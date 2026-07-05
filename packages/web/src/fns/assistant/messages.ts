export type MessageLike = {
  content?: unknown;
  tool_calls?: Array<{ name?: string }>;
  response_metadata?: Record<string, unknown>;
};

export function contentToString(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function latestAssistantMessage(messages: MessageLike[] | undefined) {
  return [...(messages ?? [])]
    .reverse()
    .find((message) => contentToString(message.content).length > 0);
}

export function toolCallNames(messages: MessageLike[] | undefined) {
  return (messages ?? []).flatMap((message) =>
    (message.tool_calls ?? [])
      .map((toolCall) => toolCall.name)
      .filter((name) => name !== undefined),
  );
}

export function modelDurationFromMetadata(message: MessageLike | undefined) {
  const metadata = message?.response_metadata;
  const totalDuration = metadata?.["total_duration"];
  if (typeof totalDuration === "number") {
    return Math.round(totalDuration / 1_000_000);
  }
  return null;
}

export function ollamaMetricsFromMetadata(message: MessageLike | undefined) {
  const metadata = message?.response_metadata;
  if (!metadata) return null;

  return {
    totalDurationMs: durationToMs(metadata["total_duration"]),
    loadDurationMs: durationToMs(metadata["load_duration"]),
    promptEvalCount: nullableNumber(metadata["prompt_eval_count"]),
    promptEvalDurationMs: durationToMs(metadata["prompt_eval_duration"]),
    evalCount: nullableNumber(metadata["eval_count"]),
    evalDurationMs: durationToMs(metadata["eval_duration"]),
    memory: null,
  };
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` Cause: ${error.cause.message}` : "";
    return `${error.message}${cause}`;
  }
  return String(error);
}

function durationToMs(value: unknown) {
  return typeof value === "number" ? Math.round(value / 1_000_000) : null;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}
