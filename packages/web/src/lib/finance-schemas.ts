import { z } from "zod";

const MAX_BLOB_BYTES = 10 * 1024 * 1024;
const jsonValueSchema = z.json();

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
  metadata: z.record(z.string(), jsonValueSchema),
});

export type MetricInsert = z.infer<typeof metricInsertSchema>;

export { jsonValueSchema };
