import { z } from "zod";
import { HumanMessage } from "langchain";
import { getAgent } from "@/agent";
import { getMonthlyBudget, saveMonthlyBudget, summarizeTransactions } from "@/agent/budget";
import { withToolMetrics } from "@/agent/metrics";
import { getMcpServerStatus } from "@/agent/mcp/client";
import { getStoredTransactions } from "@/agent/tools";
import { getOllamaModelMemory, modelTimeoutMs } from "@/agent/model";
import { listUploadedFiles, saveUploadedFile } from "@/lib/blobs";
import { currentLocalDate, currentLocalMonth } from "@/lib/date";
import {
  FinanceSummaryOutput,
  SetMonthlyBudgetInput,
  SetMonthlyBudgetOutput,
  type SendAgentMessageOutput,
  type SendAgentMessageInput,
  type UploadFilesInput,
} from "./api";
import { formatChatHistory, formatFileContext } from "./formatting";
import {
  contentToString,
  errorMessage,
  latestAssistantMessage,
  type MessageLike,
  modelDurationFromMetadata,
  ollamaMetricsFromMetadata,
  toolCallNames,
} from "./messages";
import { recordAssistantMetric } from "./metrics.server";

export async function sendAgentMessage(
  userId: string,
  threadId: string,
  message: string,
  month = currentLocalMonth(),
  history: SendAgentMessageInput["history"] = [],
): Promise<SendAgentMessageOutput> {
  const start = performance.now();
  const cpuStart = process.cpuUsage();
  const files = await listUploadedFiles(userId, threadId);
  const monthlyBudget = await getMonthlyBudget(userId, month);
  const fileContext = formatFileContext(files);

  let result: unknown;
  let toolMetrics;
  try {
    const agent = await getAgent();
    const measured = await withToolMetrics(async () =>
      agent.invoke(
        {
          messages: [
            new HumanMessage(
              [
                `Current date: ${currentLocalDate()}`,
                `Selected budget month: ${month}`,
                `Selected monthly budget: ${monthlyBudget === null ? "not set" : `$${monthlyBudget}`}`,
                "Currency: USD. Always display monetary values in USD using $.",
                fileContext,
                formatChatHistory(history),
                `User request:\n${message}`,
              ]
                .filter(Boolean)
                .join("\n\n"),
            ),
          ],
        },
        {
          configurable: { thread_id: `${userId}:${threadId}` },
          context: { userId, threadId },
          timeout: modelTimeoutMs,
        },
      ),
    );
    result = measured.value;
    toolMetrics = measured.metrics;
  } catch (error) {
    throw new Error(`Ollama agent request failed: ${errorMessage(error)}`);
  }

  const messages = (result as { messages?: MessageLike[] }).messages;
  const assistantMessage = latestAssistantMessage(messages);
  const response = contentToString(assistantMessage?.content);
  const totalDurationMs = Math.round(performance.now() - start);
  const cpu = process.cpuUsage(cpuStart);
  const memory = process.memoryUsage();
  const toolDurationMs = toolMetrics.reduce((sum, metric) => sum + metric.durationMs, 0);
  const responseOllama = ollamaMetricsFromMetadata(assistantMessage);
  const ollama = responseOllama
    ? { ...responseOllama, memory: await getOllamaModelMemory() }
    : null;

  const metric = await recordAssistantMetric({
    userId,
    threadId,
    message,
    response,
    totalDurationMs,
    modelDurationMs: modelDurationFromMetadata(assistantMessage),
    toolDurationMs,
    toolInvocationCount: toolMetrics.length,
    cpu,
    memory,
    toolCalls: toolMetrics,
    ollama,
    metadata: {
      modelToolCalls: toolCallNames(messages),
      messageCount: messages?.length ?? 0,
    },
  });

  return {
    threadId,
    response,
    metric,
  };
}

export async function uploadFiles(userId: string, input: UploadFilesInput) {
  const files = await Promise.all(
    input.files.map((file) => saveUploadedFile(userId, input.threadId, file)),
  );
  return { files };
}

export async function listFiles(userId: string, threadId: string) {
  return { files: await listUploadedFiles(userId, threadId) };
}

export async function setMonthlyBudget(
  userId: string,
  input: z.infer<typeof SetMonthlyBudgetInput>,
) {
  const budget = await saveMonthlyBudget(userId, input.month, input.amount);

  return SetMonthlyBudgetOutput.parse({
    month: budget.month,
    monthlyBudget: budget.monthlyBudget,
  });
}

export async function listFinanceSummary(userId: string, month = currentLocalMonth()) {
  const monthlyBudget = await getMonthlyBudget(userId, month);
  const transactions = await getStoredTransactions(userId, 1000, month);
  const summary = summarizeTransactions(transactions, monthlyBudget);

  return FinanceSummaryOutput.parse({
    chartData: summary.categories.map(({ category, amount }) => ({ category, amount })),
    transactionCount: transactions.filter((transaction) => transaction.direction === "outgoing")
      .length,
    month,
    monthlyBudget: summary.monthlyBudget,
    monthlySpending: summary.spending,
    remainingBudget: summary.remainingBudget,
  });
}

export async function listMcpStatus() {
  const servers = await getMcpServerStatus();

  return {
    enabled: servers.length > 0,
    servers,
    restartRequiredForChanges: true as const,
  };
}
