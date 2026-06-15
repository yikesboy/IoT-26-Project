import { getStoredTransactions, type StoredTransaction } from "@/agent/tools";
import type { SendAgentMessageOutput } from "./api";
import { formatSavedTransactionsMarkdown } from "./formatting";
import { errorMessage } from "./messages";
import { recordAssistantMetric } from "./metrics.server";

export async function responseFromTransactionsSavedDuringFailure(input: {
  userId: string;
  threadId: string;
  message: string;
  start: number;
  cpuStart: NodeJS.CpuUsage;
  transactionsBefore: StoredTransaction[];
  error: unknown;
}): Promise<SendAgentMessageOutput | null> {
  const beforeIds = new Set(input.transactionsBefore.map((transaction) => transaction.id));
  const transactionsAfter = await getStoredTransactions(input.userId);
  const savedTransactions = transactionsAfter.filter(
    (transaction) => !beforeIds.has(transaction.id),
  );
  if (savedTransactions.length === 0) return null;

  const response = [
    formatSavedTransactionsMarkdown(savedTransactions),
    "",
    "_The transaction was saved, but the local model failed while composing the final agent reply._",
  ].join("\n");
  const totalDurationMs = Math.round(performance.now() - input.start);
  const cpu = process.cpuUsage(input.cpuStart);
  const memory = process.memoryUsage();

  await recordAssistantMetric({
    userId: input.userId,
    threadId: input.threadId,
    message: input.message,
    response,
    totalDurationMs,
    modelDurationMs: null,
    toolDurationMs: 0,
    toolInvocationCount: 0,
    cpu,
    memory,
    metadata: {
      fallback: "transactions_saved_after_agent_failure",
      error: errorMessage(input.error),
    },
  });

  return { threadId: input.threadId, response, toolCalls: [] };
}
