import { z } from "zod";
import { HumanMessage } from "langchain";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { BaseMessage } from "@langchain/core/messages";
import agent from "@/agent";
import { getMonthlyBudget, saveMonthlyBudget, summarizeTransactions } from "@/agent/budget";
import { withToolMetrics } from "@/agent/metrics";
import { getStoredTransactions } from "@/agent/tools";
import { getOllamaModelMemory, modelTimeoutMs } from "@/agent/model";
import { listUploadedFiles, saveUploadedFile } from "@/lib/blobs";
import { currentLocalDate, currentLocalMonth } from "@/lib/date";
import {
  FinanceSummaryOutput,
  SetMonthlyBudgetInput,
  SetMonthlyBudgetOutput,
  type AgentStreamEvent,
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

export async function streamAgentMessage(
  userId: string,
  input: SendAgentMessageInput,
  emit: (event: AgentStreamEvent) => void,
  signal?: AbortSignal,
) {
  const start = performance.now();
  const cpuStart = process.cpuUsage();
  const month = input.month ?? currentLocalMonth();
  const files = await listUploadedFiles(userId, input.threadId);
  const monthlyBudget = await getMonthlyBudget(userId, month);
  const fileContext = formatFileContext(files);

  let result: unknown;
  let toolMetrics;
  try {
    const measured = await withToolMetrics(async () => {
      const activeTools = new Map<string, string>();
      const successfulTools = new Set<string>();
      const toolCallCallback = BaseCallbackHandler.fromMethods({
        handleToolStart(tool, rawInput, runId, _parentRunId, _tags, _metadata, runName) {
          const name = runName ?? tool.name ?? tool.id.at(-1) ?? "unknown_tool";
          activeTools.set(runId, name);
          emit({
            type: "tool_start",
            id: runId,
            name,
            input: parseToolInput(rawInput),
          });
        },
        handleToolEnd(_output, runId) {
          const name = activeTools.get(runId);
          if (name) successfulTools.add(name);
          activeTools.delete(runId);
          emit({ type: "tool_end", id: runId, status: "finished" });
        },
        handleToolError(error, runId) {
          activeTools.delete(runId);
          emit({
            type: "tool_end",
            id: runId,
            status: "error",
            error: errorMessage(error),
          });
        },
      });
      // Tool lifecycle events must reach the response stream before the run can close.
      toolCallCallback.awaitHandlers = true;

      async function executeAgentRun(messages: BaseMessage[]) {
        const run = await agent.streamEvents(
          { messages },
          {
            version: "v3",
            configurable: { thread_id: `${userId}:${input.threadId}` },
            context: { userId, threadId: input.threadId },
            timeout: modelTimeoutMs,
            callbacks: [toolCallCallback],
            ...(signal ? { signal } : {}),
          },
        );
        const messagesTask = (async () => {
          for await (const message of run.messages) {
            emit({ type: "response_start" });
            for await (const token of message.text) {
              if (token) emit({ type: "token", content: token });
            }
          }
        })();
        const [output] = await Promise.all([run.output, messagesTask]);
        return output;
      }

      let output = await executeAgentRun([
        new HumanMessage(
          [
            `Current date: ${currentLocalDate()}`,
            `Selected budget month: ${month}`,
            `Selected monthly budget: ${monthlyBudget === null ? "not set" : `$${monthlyBudget}`}`,
            "Currency: USD. Always display monetary values in USD using $.",
            fileContext,
            formatChatHistory(input.history),
            `User request:\n${input.message}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        ),
      ]);

      if (isExplicitTransactionStoreRequest(input.message)) {
        const retryLimit = isExplicitFileStoreRequest(input.message) ? 2 : 1;
        for (
          let retry = 0;
          retry < retryLimit && !successfulTools.has("save_transactions");
          retry++
        ) {
          const correction = successfulTools.has("extract_file_text")
            ? "The user explicitly authorized persistence and file extraction already succeeded, but save_transactions has not run. Your next assistant action must be a save_transactions tool call with exactly one structured transaction from the extracted grand total. Use categoryName directly. Do not respond with prose or announce your intent."
            : isExplicitFileStoreRequest(input.message)
              ? "The explicitly authorized file-storage workflow is incomplete. Call extract_file_text for the supplied fileId, then call save_transactions with exactly one structured transaction. Use categoryName directly. Do not respond with prose or announce your intent."
              : "The user explicitly asked to persist an expense or transaction, but save_transactions has not run. Your next assistant action must be a save_transactions tool call using the transaction details the user supplied. Use categoryName directly. If a required transaction value truly was not supplied, ask only for that value. Do not announce your intent.";
          output = await executeAgentRun([...output.messages, new HumanMessage(correction)]);
        }
      }
      return output;
    });
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
    threadId: input.threadId,
    message: input.message,
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

  emit({ type: "done", response, metric });
}

function parseToolInput(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function isExplicitFileStoreRequest(message: string) {
  return message.startsWith("Tool required: store uploaded file as one transaction.");
}

function isExplicitTransactionStoreRequest(message: string) {
  if (isExplicitFileStoreRequest(message)) return true;
  if (/\b(?:how|why|what)\s+(?:can|do|would|should)\b/i.test(message)) return false;
  return (
    /\b(?:save|store|record|add|ingest)\b/i.test(message) &&
    /\b(?:expense|transaction|receipt|invoice)s?\b/i.test(message)
  );
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
