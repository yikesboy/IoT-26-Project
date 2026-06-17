import { tool } from "langchain";
import { z } from "zod";
import { currentLocalDate } from "@/lib/date";
import { measureTool } from "../metrics";
import store from "../store";
import { getCategories, getOrCreateCategory } from "./categories";
import { requireContext, toolJson, type FinanceRuntime } from "./shared";

export const transactionSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  name: z
    .string()
    .describe(
      "Vendor, merchant, sender, payer, or payee name when available. For receipts use the printed vendor/merchant name. Do not use category labels such as Groceries, Dining, Transport, or Shopping unless no counterparty can be identified.",
    ),
  amount: z
    .number()
    .transform((amount) => Math.abs(amount))
    .pipe(z.number().positive())
    .describe(
      "Positive amount. For receipts/invoices this must be the grand total, not line items.",
    ),
  direction: z
    .enum(["outgoing", "incoming"])
    .describe("Use outgoing for expenses and incoming for income/refunds."),
  categoryId: z
    .string()
    .optional()
    .describe("Existing or newly created category id from list_categories/create_category."),
  categoryName: z
    .string()
    .optional()
    .describe("Category name matching categoryId. Required if categoryId is not known."),
  date: z
    .string()
    .optional()
    .describe(
      "Transaction date in YYYY-MM-DD format. Extract this from the source text when possible.",
    ),
  sourceFileId: z.string().optional().describe("Uploaded file id when extracted from a file."),
  notes: z.string().optional().describe("Short extraction note or uncertainty."),
});

export const storedTransactionSchema = transactionSchema.extend({
  id: z.string(),
  savedAt: z.string().optional(),
  modelProvidedId: z.string().optional(),
});

export const transactionsSchema = z.object({
  transactions: z
    .array(transactionSchema)
    .min(1)
    .describe("Array of structured transactions to persist."),
});

export type StoredTransaction = z.infer<typeof storedTransactionSchema>;

const listTransactionsSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    limit: z.number().int().min(1).max(1000).default(250),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional()
      .describe("Optional month filter in YYYY-MM format."),
  }),
);

export async function executeSaveTransactions(
  userId: string,
  input: z.input<typeof transactionsSchema>,
) {
  const parsedInput = transactionsSchema.parse(input);
  const categories = await getCategories(userId);
  const transactions = collapseReceiptLineItems(parsedInput.transactions);
  const savedTransactions = await Promise.all(
    transactions.map(async (transaction) => {
      const transactionId = crypto.randomUUID();
      const category =
        categories.find((item) => item.id === transaction.categoryId) ??
        (transaction.categoryName
          ? await getOrCreateCategory(userId, transaction.categoryName)
          : await getOrCreateCategory(userId, "Misc"));

      await store.put(["users", userId, "transactions"], transactionId, {
        ...transaction,
        id: transactionId,
        date: transaction.date ?? currentLocalDate(),
        categoryId: category.id,
        categoryName: category.name,
        modelProvidedId: transaction.id,
        savedAt: new Date().toISOString(),
      });
      return { ...transaction, id: transactionId };
    }),
  );

  return {
    saved: savedTransactions.length,
    transactionIds: savedTransactions.map((transaction) => transaction.id),
  };
}

export async function getStoredTransactions(userId: string, limit = 250, month?: string) {
  const rows = await store.search(["users", userId, "transactions"], { limit });
  return rows
    .map((row) => {
      const value = "value" in row ? row.value : undefined;
      const parsed = storedTransactionSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    })
    .filter((transaction): transaction is StoredTransaction => transaction !== null)
    .filter((transaction) => !month || transaction.date?.startsWith(month));
}

export const saveTransaction = tool(
  async (input: z.infer<typeof transactionsSchema>, runtime: FinanceRuntime) =>
    measureTool("save_transactions", async () => {
      const { userId } = requireContext(runtime);
      return toolJson(await executeSaveTransactions(userId, input));
    }),
  {
    name: "save_transactions",
    description:
      "Save one or more categorized personal finance transactions. The transaction name should be the vendor, merchant, sender, payer, or payee when available; keep category labels in categoryName, not name. For receipts and invoices, save exactly one transaction using the grand total / amount due / paid total; do not save each line item as a separate transaction. Before calling this from a receipt or invoice, first use extract_file_text and convert the extracted content into transaction objects. Input must be an object with a transactions array; never pass plain text or a raw array. Only tell the user a transaction was saved after this tool returns a saved result.",
    schema: transactionsSchema,
  },
);

export const listTransactions = tool(
  async (input: z.infer<typeof listTransactionsSchema>, runtime: FinanceRuntime) =>
    measureTool("list_transactions", async () => {
      const { userId } = requireContext(runtime);
      const transactions = await getStoredTransactions(userId, input.limit, input.month);

      if (transactions.length === 0) return "No transactions found.";
      return toolJson(transactions);
    }),
  {
    name: "list_transactions",
    description:
      "Retrieve saved personal finance transactions for the current authenticated user. Use this for transaction lists, spending analysis, budget checks, savings recommendations, and any question that depends on stored transaction history. Pass month in YYYY-MM format for ordinary monthly questions using the selected budget month from context; omit month only when the user asks for all months.",
    schema: listTransactionsSchema,
  },
);

function collapseReceiptLineItems(
  transactions: z.infer<typeof transactionsSchema>["transactions"],
) {
  const grouped = new Map<string, typeof transactions>();

  for (const transaction of transactions) {
    const key = transaction.sourceFileId;
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), transaction]);
  }

  if (![...grouped.values()].some((items) => items.length > 1)) {
    return transactions;
  }

  const collapsedFileIds = new Set<string>();
  const result = transactions.filter((transaction) => {
    if (!transaction.sourceFileId) return true;
    const items = grouped.get(transaction.sourceFileId) ?? [];
    return items.length <= 1;
  });

  for (const [sourceFileId, items] of grouped.entries()) {
    if (items.length <= 1 || collapsedFileIds.has(sourceFileId)) continue;
    collapsedFileIds.add(sourceFileId);

    const totalCandidate = items.find((item) => /\b(total|amount due|paid)\b/i.test(item.name));
    const base = totalCandidate ?? items[items.length - 1]!;
    const amount =
      totalCandidate?.amount ?? items.reduce((sum, transaction) => sum + transaction.amount, 0);

    result.push({
      ...base,
      id: crypto.randomUUID(),
      name: base.name,
      amount,
      notes: [
        base.notes,
        `Collapsed ${items.length} receipt line items into one transaction for receipt total.`,
        `Line items: ${items.map((item) => `${item.name} ${item.amount}`).join("; ")}`,
      ]
        .filter(Boolean)
        .join(" "),
      sourceFileId,
    });
  }

  return result;
}
