import { z } from "zod";
import { HumanMessage } from "langchain";
import agent from "@/agent";
import { withToolMetrics } from "@/agent/metrics";
import { getStoredTransactions, storedTransactionSchema } from "@/agent/tools";
import { modelTimeoutMs } from "@/agent/model";
import store from "@/agent/store";
import { listUploadedFiles, saveUploadedFile } from "@/lib/blobs";
import { currentLocalDate, currentLocalMonth } from "@/lib/date";
import { listPerformanceMetrics } from "@/lib/performance";
import {
  FinanceSummaryOutput,
  SetMonthlyBudgetInput,
  SetMonthlyBudgetOutput,
  type SendAgentMessageOutput,
  type UploadFilesInput,
} from "./api";
import { formatBudgetSummaryResponse } from "./budget-summary.server";
import { responseFromTransactionsSavedDuringFailure } from "./fallback.server";
import { formatFileContext, formatTransactionsMarkdown } from "./formatting";
import {
  contentToString,
  errorMessage,
  latestAssistantMessage,
  type MessageLike,
  modelDurationFromMetadata,
} from "./messages";
import { recordAssistantMetric } from "./metrics.server";
import { saveUploadedReceiptDirectly, shouldSaveUploadedReceipt } from "./receipt-save.server";

const storeSearchRowSchema = z.object({
  value: z.unknown().optional(),
});

const storedBudgetSchema = z.object({
  month: z.string(),
  monthlyBudget: z.number(),
  savedAt: z.string(),
});

export async function sendAgentMessage(
  userId: string,
  threadId: string,
  message: string,
  month = currentLocalMonth(),
): Promise<SendAgentMessageOutput> {
  const start = performance.now();
  const cpuStart = process.cpuUsage();
  const directTransactionList = shouldListTransactions(message)
    ? await getStoredTransactions(
        userId,
        1000,
        shouldListSelectedMonth(message) ? month : undefined,
      )
    : null;
  if (directTransactionList) {
    const response = formatTransactionsMarkdown(directTransactionList);
    const totalDurationMs = Math.round(performance.now() - start);
    const cpu = process.cpuUsage(cpuStart);
    const memory = process.memoryUsage();

    await recordAssistantMetric({
      userId,
      threadId,
      message,
      response,
      totalDurationMs,
      modelDurationMs: null,
      toolDurationMs: 0,
      toolInvocationCount: 0,
      cpu,
      memory,
      metadata: { direct: "list_transactions" },
    });

    return { threadId, response, toolCalls: [] };
  }

  const files = await listUploadedFiles(userId, threadId);
  const directReceiptSave = shouldSaveUploadedReceipt(message)
    ? await saveUploadedReceiptDirectly(userId, threadId, message, files, start, cpuStart)
    : null;
  if (directReceiptSave) return directReceiptSave;

  const monthlyBudget = await getMonthlyBudget(userId, month);
  const toolRoutingContext = formatToolRoutingContext(message, month, monthlyBudget);
  const fileContext = toolRoutingContext ? "" : formatFileContext(files);
  const transactionsBefore = await getStoredTransactions(userId);

  let result: unknown;
  let toolMetrics;
  try {
    const measured = await withToolMetrics(async () =>
      agent.invoke(
        {
          messages: [
            new HumanMessage(
              [
                `Current date: ${currentLocalDate()}`,
                `Selected budget month: ${month}`,
                "Currency: USD. Always display monetary values in USD using $.",
                fileContext,
                toolRoutingContext,
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
    const fallback = await responseFromTransactionsSavedDuringFailure({
      userId,
      threadId,
      message,
      start,
      cpuStart,
      transactionsBefore,
      error,
    });
    if (fallback) return fallback;

    throw new Error(`Ollama agent request failed: ${errorMessage(error)}`);
  }

  const messages = (result as { messages?: MessageLike[] }).messages;
  const assistantMessage = latestAssistantMessage(messages);
  let response = contentToString(assistantMessage?.content);
  if (isLeakedBudgetToolCall(response) && shouldAnalyzeStoredTransactions(message)) {
    const transactions = await getStoredTransactions(userId, 1000, month);
    response = formatBudgetSummaryResponse(transactions, month, monthlyBudget);
  }
  const totalDurationMs = Math.round(performance.now() - start);
  const cpu = process.cpuUsage(cpuStart);
  const memory = process.memoryUsage();
  const toolDurationMs = toolMetrics.reduce((sum, metric) => sum + metric.durationMs, 0);

  await recordAssistantMetric({
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
    metadata: {
      toolCalls: toolMetrics,
    },
  });

  return {
    threadId,
    response,
    toolCalls: toolMetrics,
  };
}

function shouldListTransactions(message: string) {
  return /\b(list|show|display)\b/i.test(message) && /\btransactions?\b/i.test(message);
}

function shouldListSelectedMonth(message: string) {
  if (/\b(all|every|all months|for all months)\b/i.test(message)) return false;
  return /\b(this month|current month|selected month|monthly|month)\b/i.test(message);
}

function shouldAnalyzeStoredTransactions(message: string) {
  return (
    /\b(analy[sz]e|summary|summari[sz]e|review|budget|spending|expenses?|savings?|save money|saved transactions?|transactions?|tool)\b/i.test(
      message,
    ) &&
    /\b(monthly|month|expenses?|spending|budget|savings?|saved|transactions?|tool)\b/i.test(message)
  );
}

function isLeakedBudgetToolCall(response: string) {
  return (
    /"name"\s*:\s*"calculate_budget_summary"/i.test(response) ||
    /\bcalculate_budget_summary\b/i.test(response)
  );
}

async function getMonthlyBudget(userId: string, month: string) {
  const budgetRow = await store.get(["users", userId, "budgets"], month);
  const budgetValue = budgetRow && "value" in budgetRow ? budgetRow.value : undefined;
  const budget = storedBudgetSchema.safeParse(budgetValue);
  return budget.success ? budget.data.monthlyBudget : null;
}

function formatToolRoutingContext(message: string, month: string, monthlyBudget: number | null) {
  if (!shouldAnalyzeStoredTransactions(message)) return "";

  return [
    "Tool routing requirement:",
    `- This request is about stored transactions, expense analysis, budgeting, or savings for ${month}.`,
    `- You must call list_transactions with {"month":"${month}"} before answering.`,
    `- If list_transactions returns transactions, call calculate_budget_summary with those transactions${monthlyBudget === null ? "" : ` and monthlyBudget ${monthlyBudget}`}.`,
    "- Base your final answer on those tool results and the selected month. Use the spending, budgetVariance, budgetUsageRate, and category spendingShare values returned by calculate_budget_summary; do not recalculate them yourself.",
    "- Do not append a raw transaction list unless the user explicitly asks to list transactions.",
    "- Use USD everywhere. Do not use GBP, EUR, or other currency symbols.",
  ].join("\n");
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

export async function listMetrics(userId: string) {
  return { metrics: await listPerformanceMetrics(userId) };
}

export async function setMonthlyBudget(
  userId: string,
  input: z.infer<typeof SetMonthlyBudgetInput>,
) {
  const budget = {
    month: input.month,
    monthlyBudget: input.amount,
    savedAt: new Date().toISOString(),
  };
  await store.put(["users", userId, "budgets"], input.month, budget);

  return SetMonthlyBudgetOutput.parse({
    month: budget.month,
    monthlyBudget: budget.monthlyBudget,
  });
}

export async function listFinanceSummary(userId: string, month = currentLocalMonth()) {
  const rows = await store.search(["users", userId, "transactions"], {
    limit: 1000,
  });
  const budgetRow = await store.get(["users", userId, "budgets"], month);
  const budgetValue = budgetRow && "value" in budgetRow ? budgetRow.value : undefined;
  const budget = storedBudgetSchema.safeParse(budgetValue);
  const categories = new Map<string, number>();
  let monthlySpending = 0;
  let transactionCount = 0;

  for (const row of rows) {
    const value = storeSearchRowSchema.parse(row).value;
    const transaction = storedTransactionSchema.safeParse(value);
    if (
      transaction.success &&
      transaction.data.direction === "outgoing" &&
      transaction.data.date?.startsWith(month)
    ) {
      const category = transaction.data.categoryName ?? "Misc";
      const amount = transaction.data.amount;
      categories.set(category, (categories.get(category) ?? 0) + amount);
      monthlySpending += amount;
      transactionCount += 1;
    }
  }

  const chartData = [...categories.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((left, right) => right.amount - left.amount);
  const monthlyBudget = budget.success ? budget.data.monthlyBudget : null;

  return FinanceSummaryOutput.parse({
    chartData,
    transactionCount,
    month,
    monthlyBudget,
    monthlySpending,
    remainingBudget: monthlyBudget === null ? null : monthlyBudget - monthlySpending,
  });
}
