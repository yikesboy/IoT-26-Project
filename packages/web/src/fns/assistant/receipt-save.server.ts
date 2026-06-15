import { HumanMessage } from "langchain";
import { z } from "zod";
import {
  executeExtractFileText,
  executeSaveTransactions,
  getStoredTransactions,
} from "@/agent/tools";
import { model, modelTimeoutMs } from "@/agent/model";
import { currentLocalDate } from "@/lib/date";
import type { UploadedFile } from "@/lib/finance-schemas";
import type { SendAgentMessageOutput } from "./api";
import { formatSavedTransactionsMarkdown } from "./formatting";
import { recordAssistantMetric } from "./metrics.server";

const extractedReceiptTransactionsSchema = z.object({
  transactions: z
    .array(
      z.object({
        name: z
          .string()
          .min(1)
          .describe("Merchant, payer, or short transaction label. Prefer the receipt vendor."),
        amount: z
          .number()
          .transform((amount) => Math.abs(amount))
          .pipe(z.number().positive())
          .describe("Receipt grand total / amount due / paid total, not line-item prices."),
        direction: z.enum(["outgoing", "incoming"]),
        categoryName: z.string().min(1),
        date: z
          .string()
          .min(1)
          .describe(
            "Transaction date in YYYY-MM-DD format. Use the date printed in the receipt/invoice text; if no date is present, use today's date.",
          ),
        notes: z.string().optional(),
      }),
    )
    .min(1)
    .max(3),
});

export function shouldSaveUploadedReceipt(message: string) {
  return (
    /\b(save|store|record|add)\b/i.test(message) &&
    /\b(receipt|invoice|statement|upload|uploaded|file|transaction)\b/i.test(message)
  );
}

export async function saveUploadedReceiptDirectly(
  userId: string,
  threadId: string,
  message: string,
  files: UploadedFile[],
  start: number,
  cpuStart: NodeJS.CpuUsage,
): Promise<SendAgentMessageOutput | null> {
  const file = findReferencedFile(files, message);
  if (!file) return null;

  const extractStart = performance.now();
  const extracted = await executeExtractFileText(userId, threadId, {
    fileId: file.id,
    language: "eng",
  });
  const extractDurationMs = Math.round(performance.now() - extractStart);

  const structuredModel = model.withStructuredOutput(extractedReceiptTransactionsSchema, {
    name: "ReceiptTransactions",
  });
  const today = currentLocalDate();
  const modelStart = performance.now();
  const extractedTransactions = await structuredModel.invoke(
    [
      new HumanMessage(
        [
          "Extract personal finance transactions from this uploaded receipt/invoice text.",
          "Return exactly one transaction when this is a receipt or invoice: use the grand total / total due / amount paid, not individual line items.",
          "Use outgoing for purchases and incoming only for income or refunds.",
          "Choose a concise categoryName such as Transport, Dining, Groceries, Utilities, Shopping, Healthcare, Entertainment, Income, or Misc.",
          `Today's date is ${today}. Use it only when the extracted text has no receipt/invoice date.`,
          `File: ${file.filename} (${file.id})`,
          `User request: ${message}`,
          "Extracted text:",
          extracted.text,
        ].join("\n\n"),
      ),
    ],
    { timeout: modelTimeoutMs },
  );
  const modelDurationMs = Math.round(performance.now() - modelStart);

  const saveStart = performance.now();
  const saved = await executeSaveTransactions(userId, {
    transactions: extractedTransactions.transactions.map((transaction) => ({
      ...transaction,
      id: crypto.randomUUID(),
      sourceFileId: file.id,
    })),
  });
  const saveDurationMs = Math.round(performance.now() - saveStart);

  const storedTransactions = await getStoredTransactions(userId);
  const savedTransactionIds = new Set<string>(saved.transactionIds);
  const savedTransactions = storedTransactions.filter((transaction) =>
    savedTransactionIds.has(transaction.id),
  );
  const response = formatSavedTransactionsMarkdown(savedTransactions, file);
  const totalDurationMs = Math.round(performance.now() - start);
  const cpu = process.cpuUsage(cpuStart);
  const memory = process.memoryUsage();
  const toolCalls = [
    { name: "extract_file_text", durationMs: extractDurationMs },
    { name: "save_transactions", durationMs: saveDurationMs },
  ];

  await recordAssistantMetric({
    userId,
    threadId,
    message,
    response,
    totalDurationMs,
    modelDurationMs,
    toolDurationMs: extractDurationMs + saveDurationMs,
    toolInvocationCount: toolCalls.length,
    cpu,
    memory,
    metadata: {
      direct: "save_uploaded_receipt",
      toolCalls,
      sourceFileId: file.id,
    },
  });

  return { threadId, response, toolCalls };
}

function findReferencedFile(files: UploadedFile[], message: string) {
  if (files.length === 0) return null;

  const uuid = message.match(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  )?.[0];
  if (uuid) {
    const byId = files.find((file) => file.id.toLowerCase() === uuid.toLowerCase());
    if (byId) return byId;
  }

  const normalizedMessage = message.toLowerCase();
  const byName = files.find((file) => normalizedMessage.includes(file.filename.toLowerCase()));
  return byName ?? files[0] ?? null;
}
