import type { StoredTransaction } from "@/agent/tools";
import type { SendAgentMessageInput } from "./api";
import type { UploadedFile } from "@/lib/finance-schemas";
import { formatSignedCurrency } from "@/lib/money";

export function formatTransactionsMarkdown(transactions: StoredTransaction[]) {
  if (transactions.length === 0) {
    return "No transactions found.";
  }

  return [
    `Found ${transactions.length} transaction${transactions.length === 1 ? "" : "s"}:`,
    "",
    ...transactions.map((transaction) => {
      const amount = formatSignedCurrency(transaction.amount, transaction.direction);
      const category = transaction.categoryName ?? "Uncategorized";
      const date = transaction.date ? ` on ${transaction.date}` : "";
      return `- **${transaction.name}**${date}: ${amount} (${category})`;
    }),
  ].join("\n");
}

export function formatSavedTransactionsMarkdown(
  transactions: StoredTransaction[],
  file?: UploadedFile,
) {
  if (transactions.length === 0) {
    return file ? `Saved the receipt from **${file.filename}**.` : "Saved the transaction.";
  }

  return [
    `Saved ${transactions.length} transaction${transactions.length === 1 ? "" : "s"}${file ? ` from **${file.filename}**` : ""}:`,
    "",
    ...transactions.map((transaction) => {
      const amount = formatSignedCurrency(transaction.amount, transaction.direction);
      const category = transaction.categoryName ?? "Uncategorized";
      const date = transaction.date ? ` on ${transaction.date}` : "";
      return `- **${transaction.name}**${date}: ${amount} (${category})`;
    }),
  ].join("\n");
}

export function formatFileContext(files: UploadedFile[]) {
  if (files.length === 0) {
    return "Files available in this chat: none.";
  }

  const fileList = files
    .map((file) => `- ${file.filename} (id: ${file.id}, type: ${file.mimeType})`)
    .join("\n");
  return `Files available in this chat:\n${fileList}\nUse these files only when the user explicitly asks about an uploaded file, receipt, invoice, statement, or CSV. For general spending, budget, or savings analysis, use stored transactions first.`;
}

export function formatChatHistory(history: SendAgentMessageInput["history"]) {
  const recentHistory = history
    .slice(-8)
    .map((message) => `${message.role}: ${message.content.slice(0, 1200)}`)
    .join("\n\n");

  if (!recentHistory) return "";

  return [
    "Recent chat context:",
    recentHistory,
    "Use this only to understand follow-up references. Prior assistant text is not evidence that a tool ran.",
  ].join("\n");
}
