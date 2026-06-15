import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  metricInsertSchema,
  type MetricInsert,
  type PerformanceMetric,
  jsonValueSchema,
} from "./finance-schemas";
import sql from "./db";

type SqlJsonValue = Parameters<typeof sql.json>[0];

const metricRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  thread_id: z.string(),
  prompt_chars: z.number(),
  response_chars: z.number().nullable(),
  total_duration_ms: z.number(),
  model_duration_ms: z.number().nullable(),
  tool_duration_ms: z.number().nullable(),
  tool_invocation_count: z.number(),
  cpu_user_micros: z.union([z.string(), z.number()]).nullable(),
  cpu_system_micros: z.union([z.string(), z.number()]).nullable(),
  rss_bytes: z.union([z.string(), z.number()]).nullable(),
  heap_used_bytes: z.union([z.string(), z.number()]).nullable(),
  metadata: z.record(z.string(), jsonValueSchema),
  created_at: z.union([z.date(), z.string()]),
});

type MetricRow = z.infer<typeof metricRowSchema>;

function nullableNumber(value: string | number | null) {
  return value === null ? null : Number(value);
}

function metricRowToMetric(row: MetricRow): PerformanceMetric {
  return {
    id: row.id,
    userId: row.user_id,
    threadId: row.thread_id,
    promptChars: row.prompt_chars,
    responseChars: row.response_chars,
    totalDurationMs: row.total_duration_ms,
    modelDurationMs: row.model_duration_ms,
    toolDurationMs: row.tool_duration_ms,
    toolInvocationCount: row.tool_invocation_count,
    cpuUserMicros: nullableNumber(row.cpu_user_micros),
    cpuSystemMicros: nullableNumber(row.cpu_system_micros),
    rssBytes: nullableNumber(row.rss_bytes),
    heapUsedBytes: nullableNumber(row.heap_used_bytes),
    metadata: row.metadata,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export async function insertPerformanceMetric(metric: MetricInsert) {
  const data = metricInsertSchema.parse(metric);
  const id = randomUUID();

  await sql`
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
      ${sql.json(data.metadata as SqlJsonValue)}
    )
  `;
}

export async function listPerformanceMetrics(userId: string) {
  const rawRows = await sql<Record<string, unknown>[]>`
    SELECT *
    FROM performance_metric
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 100
  `;

  const rows = z.array(metricRowSchema).parse(rawRows);
  return rows.map(metricRowToMetric);
}
