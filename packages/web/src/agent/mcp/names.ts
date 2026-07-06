export function formatMcpToolName(serverName: string, toolName: string) {
  return `mcp__${sanitizeToolNamePart(serverName)}__${sanitizeToolNamePart(toolName)}`;
}

function sanitizeToolNamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
