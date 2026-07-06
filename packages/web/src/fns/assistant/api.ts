import { z } from "zod";
import {
  performanceMetricSchema,
  uploadedFileSchema,
  uploadFileInputSchema,
  type PerformanceMetric as PerformanceMetricType,
} from "@/lib/finance-schemas";

export const SendAgentMessageInput = z.object({
  threadId: z.string().min(1),
  message: z.string().min(1).max(8000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      }),
    )
    .max(12)
    .default([]),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

export const SendAgentMessageOutput = z.object({
  threadId: z.string(),
  response: z.string(),
  metric: performanceMetricSchema.nullable(),
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

export const McpStatusOutput = z.object({
  enabled: z.boolean(),
  servers: z.array(
    z.object({
      name: z.string(),
      command: z.string(),
      args: z.array(z.string()),
      cwd: z.string(),
      connected: z.boolean(),
      error: z.string().nullable(),
      tools: z.array(
        z.object({
          name: z.string(),
          agentName: z.string(),
          description: z.string().nullable(),
        }),
      ),
    }),
  ),
  restartRequiredForChanges: z.literal(true),
});

export type SendAgentMessageInput = z.infer<typeof SendAgentMessageInput>;
export type SendAgentMessageOutput = z.infer<typeof SendAgentMessageOutput>;
export type UploadFilesInput = z.infer<typeof UploadFilesInput>;
export type UploadFilesOutput = z.infer<typeof UploadFilesOutput>;
export type ListFilesOutput = z.infer<typeof ListFilesOutput>;
export type PerformanceMetric = PerformanceMetricType;
export type FinanceSummaryOutput = z.infer<typeof FinanceSummaryOutput>;
export type SetMonthlyBudgetOutput = z.infer<typeof SetMonthlyBudgetOutput>;
export type McpStatusOutput = z.infer<typeof McpStatusOutput>;
