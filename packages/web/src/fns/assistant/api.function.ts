import { authMiddleware } from "@/lib/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import {
  FinanceSummaryInput,
  ListFilesInput,
  SendAgentMessageInput,
  SetMonthlyBudgetInput,
  UploadFilesInput,
} from "./api";
import {
  listFiles,
  listFinanceSummary,
  sendAgentMessage,
  setMonthlyBudget,
  uploadFiles,
} from "./api.server";

export const sendAgentMessageFn = createServerFn({ method: "POST" })
  .inputValidator(SendAgentMessageInput)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) =>
    sendAgentMessage(context.user.id, data.threadId, data.message, data.month, data.history),
  );

export const uploadFilesFn = createServerFn({ method: "POST" })
  .inputValidator(UploadFilesInput)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => uploadFiles(context.user.id, data));

export const listFilesFn = createServerFn({ method: "GET" })
  .inputValidator(ListFilesInput)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => listFiles(context.user.id, data.threadId));

export const listFinanceSummaryFn = createServerFn({ method: "GET" })
  .inputValidator(FinanceSummaryInput)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => listFinanceSummary(context.user.id, data.month));

export const setMonthlyBudgetFn = createServerFn({ method: "POST" })
  .inputValidator(SetMonthlyBudgetInput)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => setMonthlyBudget(context.user.id, data));
