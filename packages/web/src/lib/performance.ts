import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  metricInsertSchema,
  performanceMetricFromRow,
  performanceMetricRowSchema,
  type MetricInsert,
} from "./finance-schemas";
import sql from "./db";

type SqlJsonValue = Parameters<typeof sql.json>[0];

export async function insertPerformanceMetric(metric: MetricInsert) {
  const data = metricInsertSchema.parse(metric);
  const id = randomUUID();
  const metadata = {
    ...data.metadata,
    toolCalls: data.toolCalls,
    ollama: data.ollama,
  };

  const rows = await sql<Record<string, unknown>[]>`
    INSERT INTO performance_metric (
      id,
      user_id,
      thread_id,
      prompt_chars,
      response_chars,
      total_duration_ms,
      model_duration_ms,
      tool_duration_ms,
      tool_invocation_count,
      cpu_user_micros,
      cpu_system_micros,
      rss_bytes,
      heap_used_bytes,
      metadata
    )
    VALUES (
      ${id},
      ${data.userId},
      ${data.threadId},
      ${data.promptChars},
      ${data.responseChars},
      ${data.totalDurationMs},
      ${data.modelDurationMs},
      ${data.toolDurationMs},
      ${data.toolInvocationCount},
      ${data.cpuUserMicros},
      ${data.cpuSystemMicros},
      ${data.rssBytes},
      ${data.heapUsedBytes},
      ${sql.json(metadata as SqlJsonValue)}
    )
    RETURNING *
  `;

  const [row] = z.array(performanceMetricRowSchema).parse(rows);
  if (!row) throw new Error("Failed to insert performance metric.");
  return performanceMetricFromRow(row);
}
