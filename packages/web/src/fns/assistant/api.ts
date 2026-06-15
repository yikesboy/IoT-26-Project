import { z } from "zod";
import {
  performanceMetricSchema,
  uploadedFileSchema,
  uploadFileInputSchema,
} from "@/lib/finance-schemas";

export const SendAgentMessageInput = z.object({
  threadId: z.string().min(1),
  message: z.string().min(1).max(8000),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

export const SendAgentMessageOutput = z.object({
  threadId: z.string(),
  response: z.string(),
  toolCalls: z.array(
    z.object({
      name: z.string(),
      durationMs: z.number(),
    }),
  ),
});

export const UploadFilesInput = z.object({
  threadId: z.string().min(1),
  files: z.array(uploadFileInputSchema).min(1).max(5),
});

export const UploadFilesOutput = z.object({
  files: z.array(uploadedFileSchema),
});

export const ListFilesInput = z.object({
  threadId: z.string().min(1),
});

export const ListFilesOutput = z.object({
  files: z.array(uploadedFileSchema),
});

export const ListMetricsInput = z.object({}).default({});

export const ListMetricsOutput = z.object({
  metrics: z.array(performanceMetricSchema),
});

export const FinanceSummaryInput = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  })
  .default({});

export const chartDatumSchema = z.object({
  category: z.string(),
  amount: z.number(),
});

export const FinanceSummaryOutput = z.object({
  chartData: z.array(chartDatumSchema),
  transactionCount: z.number(),
  month: z.string(),
  monthlyBudget: z.number().nullable(),
  monthlySpending: z.number(),
  remainingBudget: z.number().nullable(),
});

export const SetMonthlyBudgetInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.number().positive(),
});

export const SetMonthlyBudgetOutput = z.object({
  month: z.string(),
  monthlyBudget: z.number(),
});

export type SendAgentMessageInput = z.infer<typeof SendAgentMessageInput>;
export type SendAgentMessageOutput = z.infer<typeof SendAgentMessageOutput>;
export type UploadFilesInput = z.infer<typeof UploadFilesInput>;
export type UploadFilesOutput = z.infer<typeof UploadFilesOutput>;
export type ListFilesOutput = z.infer<typeof ListFilesOutput>;
export type ListMetricsOutput = z.infer<typeof ListMetricsOutput>;
export type FinanceSummaryOutput = z.infer<typeof FinanceSummaryOutput>;
export type SetMonthlyBudgetOutput = z.infer<typeof SetMonthlyBudgetOutput>;
