import { z } from "zod";
import { jsonValueSchema } from "@/lib/finance-schemas";
import { insertPerformanceMetric } from "@/lib/performance";
import { errorMessage } from "./messages";

export async function recordAssistantMetric(input: {
  userId: string;
  threadId: string;
  message: string;
  response: string;
  totalDurationMs: number;
  modelDurationMs: number | null;
  toolDurationMs: number;
  toolInvocationCount: number;
  cpu: NodeJS.CpuUsage;
  memory: NodeJS.MemoryUsage;
  metadata: Record<string, z.infer<typeof jsonValueSchema>>;
}) {
  try {
    await insertPerformanceMetric({
      userId: input.userId,
      threadId: input.threadId,
      promptChars: input.message.length,
      responseChars: input.response.length,
      totalDurationMs: input.totalDurationMs,
      modelDurationMs: input.modelDurationMs,
      toolDurationMs: input.toolDurationMs,
      toolInvocationCount: input.toolInvocationCount,
      cpuUserMicros: input.cpu.user,
      cpuSystemMicros: input.cpu.system,
      rssBytes: input.memory.rss,
      heapUsedBytes: input.memory.heapUsed,
      metadata: input.metadata,
    });
  } catch (error) {
    console.error(`Failed to insert performance metric: ${errorMessage(error)}`);
  }
}
