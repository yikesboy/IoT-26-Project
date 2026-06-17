import { ChatOllama } from "@langchain/ollama";
import { z } from "zod";

export const modelName = process.env["LLM_MODEL_NAME"] ?? "llama3.2:3b";
export const modelTimeoutMs = Number(process.env["LLM_TIMEOUT_MS"] ?? 300_000);
const modelNumPredict = Number(process.env["LLM_NUM_PREDICT"] ?? 600);
const modelThink = process.env["LLM_THINK"] === "true";

export const apiBaseUrl = process.env["LLM_API_BASE_URL"] ?? "http://127.0.0.1:11434";

function normalizeOllamaBaseUrl(url: string) {
  return url.replace(/\/v1\/?$/, "").replace(/\/$/, "");
}

const ollamaPsSchema = z.object({
  models: z.array(
    z.object({
      name: z.string().optional(),
      model: z.string().optional(),
      size: z.number().optional(),
      size_vram: z.number().optional(),
      context_length: z.number().optional(),
      expires_at: z.string().optional(),
    }),
  ),
});

export const model = new ChatOllama({
  model: modelName,
  baseUrl: normalizeOllamaBaseUrl(apiBaseUrl),
  temperature: 0.2,
  numPredict: modelNumPredict,
  think: modelThink,
});

export async function getOllamaModelMemory() {
  try {
    const response = await fetch(`${normalizeOllamaBaseUrl(apiBaseUrl)}/api/ps`);
    if (!response.ok) return null;

    const parsed = ollamaPsSchema.safeParse(await response.json());
    if (!parsed.success) return null;

    const loadedModel =
      parsed.data.models.find((item) => item.model === modelName || item.name === modelName) ??
      parsed.data.models[0];
    if (!loadedModel) return null;

    return {
      model: loadedModel.model ?? loadedModel.name ?? modelName,
      sizeBytes: loadedModel.size ?? null,
      sizeVramBytes: loadedModel.size_vram ?? null,
      contextLength: loadedModel.context_length ?? null,
      expiresAt: loadedModel.expires_at ?? null,
    };
  } catch {
    return null;
  }
}
