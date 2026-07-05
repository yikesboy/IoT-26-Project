import { z } from "zod";

const MAX_BLOB_BYTES = 10 * 1024 * 1024;
const jsonValueSchema = z.json();
const nullableDatabaseNumberSchema = z.union([z.string(), z.number()]).nullable();

export const uploadedFileSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  byteSize: z.number(),
  sha256: z.string(),
  metadata: z.record(z.string(), jsonValueSchema),
  createdAt: z.string(),
});

export type UploadedFile = z.infer<typeof uploadedFileSchema>;

export const uploadFileInputSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().min(0).max(MAX_BLOB_BYTES),
  contentBase64: z.string().min(1),
  metadata: z.record(z.string(), jsonValueSchema).default({}),
});

export type UploadFileInput = z.infer<typeof uploadFileInputSchema>;

export const toolMetricSchema = z.object({
  name: z.string(),
  durationMs: z.number(),
});

export type ToolMetric = z.infer<typeof toolMetricSchema>;

export const ollamaMetricSchema = z.object({
  totalDurationMs: z.number().nullable(),
  loadDurationMs: z.number().nullable(),
  promptEvalCount: z.number().nullable(),
  promptEvalDurationMs: z.number().nullable(),
  evalCount: z.number().nullable(),
  evalDurationMs: z.number().nullable(),
  memory: z
    .object({
      model: z.string(),
      sizeBytes: z.number().nullable(),
      sizeVramBytes: z.number().nullable(),
      contextLength: z.number().nullable(),
      expiresAt: z.string().nullable(),
    })
    .nullable(),
});

export type OllamaMetric = z.infer<typeof ollamaMetricSchema>;

export const performanceMetricSchema = z.object({
  id: z.string(),
  userId: z.string(),
  threadId: z.string(),
  promptChars: z.number(),
  responseChars: z.number().nullable(),
  totalDurationMs: z.number(),
  modelDurationMs: z.number().nullable(),
  toolDurationMs: z.number().nullable(),
  toolInvocationCount: z.number(),
  cpuUserMicros: z.number().nullable(),
  cpuSystemMicros: z.number().nullable(),
  rssBytes: z.number().nullable(),
  heapUsedBytes: z.number().nullable(),
  toolCalls: z.array(toolMetricSchema),
  ollama: ollamaMetricSchema.nullable(),
  metadata: z.record(z.string(), jsonValueSchema),
  createdAt: z.string(),
});

export type PerformanceMetric = z.infer<typeof performanceMetricSchema>;

export const metricInsertSchema = z.object({
  userId: z.string(),
  threadId: z.string(),
  promptChars: z.number().int().min(0),
  responseChars: z.number().int().min(0).nullable(),
  totalDurationMs: z.number().int().min(0),
  modelDurationMs: z.number().int().min(0).nullable(),
  toolDurationMs: z.number().int().min(0).nullable(),
  toolInvocationCount: z.number().int().min(0),
  cpuUserMicros: z.number().int().min(0).nullable(),
  cpuSystemMicros: z.number().int().min(0).nullable(),
  rssBytes: z.number().int().min(0).nullable(),
  heapUsedBytes: z.number().int().min(0).nullable(),
  toolCalls: z.array(toolMetricSchema).default([]),
  ollama: ollamaMetricSchema.nullable().default(null),
  metadata: z.record(z.string(), jsonValueSchema),
});

export type MetricInsert = z.infer<typeof metricInsertSchema>;

export const performanceMetricRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  thread_id: z.string(),
  prompt_chars: z.number(),
  response_chars: z.number().nullable(),
  total_duration_ms: z.number(),
  model_duration_ms: z.number().nullable(),
  tool_duration_ms: z.number().nullable(),
  tool_invocation_count: z.number(),
  cpu_user_micros: nullableDatabaseNumberSchema,
  cpu_system_micros: nullableDatabaseNumberSchema,
  rss_bytes: nullableDatabaseNumberSchema,
  heap_used_bytes: nullableDatabaseNumberSchema,
  metadata: z.record(z.string(), jsonValueSchema),
  created_at: z.union([z.date(), z.string()]),
});

export type PerformanceMetricRow = z.infer<typeof performanceMetricRowSchema>;

export function performanceMetricFromRow(row: PerformanceMetricRow): PerformanceMetric {
  const metric = {
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
    toolCalls: parseMetadataValue(z.array(toolMetricSchema), row.metadata["toolCalls"], []),
    ollama: parseMetadataValue(ollamaMetricSchema.nullable(), row.metadata["ollama"], null),
    metadata: row.metadata,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };

  return performanceMetricSchema.parse(metric);
}

function nullableNumber(value: string | number | null) {
  return value === null ? null : Number(value);
}

function parseMetadataValue<T>(schema: z.ZodType<T>, value: unknown, fallback: T) {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

export { jsonValueSchema };
