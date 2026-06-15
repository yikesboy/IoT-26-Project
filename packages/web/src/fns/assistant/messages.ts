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

export function modelDurationFromMetadata(message: MessageLike | undefined) {
  const metadata = message?.response_metadata;
  const totalDuration = metadata?.["total_duration"];
  if (typeof totalDuration === "number") {
    return Math.round(totalDuration / 1_000_000);
  }
  return null;
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` Cause: ${error.cause.message}` : "";
    return `${error.message}${cause}`;
  }
  return String(error);
}
