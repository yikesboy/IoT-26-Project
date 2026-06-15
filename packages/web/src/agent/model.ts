import { ChatOllama } from "@langchain/ollama";

export const modelName = process.env["LLM_MODEL_NAME"] ?? "qwen3:8b";
export const modelTimeoutMs = Number(process.env["LLM_TIMEOUT_MS"] ?? 300_000);
const modelNumPredict = Number(process.env["LLM_NUM_PREDICT"] ?? 600);
const modelThink = process.env["LLM_THINK"] === "true";

const apiBaseUrl = process.env["LLM_API_BASE_URL"] ?? "http://127.0.0.1:11434";

function normalizeOllamaBaseUrl(url: string) {
  return url.replace(/\/v1\/?$/, "").replace(/\/$/, "");
}

export const model = new ChatOllama({
  model: modelName,
  baseUrl: normalizeOllamaBaseUrl(apiBaseUrl),
  temperature: 0.2,
  numPredict: modelNumPredict,
  think: modelThink,
});
