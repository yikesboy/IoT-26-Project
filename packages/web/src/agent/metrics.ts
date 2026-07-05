import { AsyncLocalStorage } from "node:async_hooks";
import type { ToolMetric } from "@/lib/finance-schemas";

const storage = new AsyncLocalStorage<ToolMetric[]>();

export async function withToolMetrics<T>(fn: () => Promise<T>) {
  const metrics: ToolMetric[] = [];
  const value = await storage.run(metrics, fn);
  return { value, metrics };
}

export async function measureTool<T>(name: string, fn: () => Promise<T>) {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    storage.getStore()?.push({
      name,
      durationMs: Math.round(performance.now() - start),
    });
  }
}
