import { type ToolRuntime } from "langchain";
import { z } from "zod";
import type { contextSchema } from "../context";

export type FinanceRuntime = ToolRuntime<unknown, z.infer<typeof contextSchema>>;

export const emptyToolSchema = z.object({}).default({});

export function toolJson(value: unknown) {
  return JSON.stringify(value);
}

export function requireContext(runtime: FinanceRuntime) {
  const userId = runtime.context.userId;
  const threadId = runtime.context.threadId;
  if (!userId) throw new Error("userId is required.");
  if (!threadId) throw new Error("threadId is required.");
  return { userId, threadId };
}

export function parseJsonInput(value: unknown) {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
