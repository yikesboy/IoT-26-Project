import { tool } from "langchain";
import { z } from "zod";
import type { Tool as McpTool } from "@modelcontextprotocol/sdk/types.js";
import { measureTool } from "../metrics";
import { parseJsonInput, toolJson } from "../tools/shared";
import { getMcpServerConnections, type McpServerConnection } from "./client";

type JsonSchema = {
  type?: string | string[] | undefined;
  description?: string | undefined;
  enum?: unknown[] | undefined;
  properties?: Record<string, JsonSchema> | undefined;
  items?: JsonSchema | undefined;
  required?: string[] | undefined;
  additionalProperties?: boolean | JsonSchema | undefined;
};

export async function loadMcpTools() {
  const connections = await getMcpServerConnections();
  return connections.flatMap((connection) =>
    connection.tools.map((mcpTool) => createMcpTool(connection, mcpTool)),
  );
}

function createMcpTool(connection: McpServerConnection, mcpTool: McpTool) {
  const toolName = formatMcpToolName(connection.name, mcpTool.name);

  return tool(
    async (input: Record<string, unknown>) =>
      measureTool(toolName, async () => {
        try {
          const result = await connection.client.callTool({
            name: mcpTool.name,
            arguments: input,
          });

          return formatMcpToolResult(result);
        } catch (error) {
          return `MCP tool ${toolName} failed: ${errorMessage(error)}`;
        }
      }),
    {
      name: toolName,
      description:
        mcpTool.description ?? `Tool ${mcpTool.name} from local MCP server ${connection.name}.`,
      schema: jsonSchemaObjectToZod(mcpTool.inputSchema),
    },
  );
}

function formatMcpToolName(serverName: string, toolName: string) {
  return `mcp__${sanitizeToolNamePart(serverName)}__${sanitizeToolNamePart(toolName)}`;
}

function sanitizeToolNamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function jsonSchemaObjectToZod(schema: JsonSchema) {
  const required = new Set(schema.required ?? []);
  const shape = Object.fromEntries(
    Object.entries(schema.properties ?? {}).map(([key, propertySchema]) => {
      const valueSchema = jsonSchemaToZod(propertySchema);
      return [key, required.has(key) ? valueSchema : valueSchema.optional()];
    }),
  );

  const objectSchema = z.object(shape).passthrough();
  return z.preprocess(parseJsonInput, objectSchema);
}

function jsonSchemaToZod(schema: JsonSchema): z.ZodTypeAny {
  const baseSchema = jsonSchemaTypeToZod(schema);
  return schema.description ? baseSchema.describe(schema.description) : baseSchema;
}

function jsonSchemaTypeToZod(schema: JsonSchema): z.ZodTypeAny {
  if (Array.isArray(schema.enum) && schema.enum.every((value) => typeof value === "string")) {
    const values = schema.enum;
    if (values.length > 0) return z.enum(values as [string, ...string[]]);
  }

  const type = Array.isArray(schema.type)
    ? schema.type.find((value) => value !== "null")
    : schema.type;

  switch (type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(schema.items ? jsonSchemaToZod(schema.items) : z.unknown());
    case "object":
      return jsonSchemaObjectToZod(schema);
    default:
      return z.unknown();
  }
}

function formatMcpToolResult(result: unknown) {
  if (!result || typeof result !== "object") return toolJson(result);

  if ("toolResult" in result) return toolJson(result.toolResult);

  const typedResult = result as {
    content?: unknown[];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  };
  const parts = [
    ...(typedResult.content ?? []).map(formatContentBlock),
    typedResult.structuredContent ? toolJson(typedResult.structuredContent) : null,
  ].filter((part): part is string => Boolean(part));

  const output = parts.length > 0 ? parts.join("\n") : toolJson(result);
  return typedResult.isError ? `MCP tool returned an error:\n${output}` : output;
}

function formatContentBlock(block: unknown) {
  if (!block || typeof block !== "object") return toolJson(block);

  const typedBlock = block as {
    type?: string;
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: { uri?: string; text?: string; blob?: string; mimeType?: string };
    uri?: string;
    name?: string;
  };

  switch (typedBlock.type) {
    case "text":
      return typedBlock.text ?? "";
    case "image":
    case "audio":
      return `[${typedBlock.type}: ${typedBlock.mimeType ?? "unknown mime type"}]`;
    case "resource":
      if (typedBlock.resource?.text) return typedBlock.resource.text;
      return `[resource: ${typedBlock.resource?.uri ?? "unknown uri"}]`;
    case "resource_link":
      return `[resource link: ${typedBlock.name ?? typedBlock.uri ?? "unknown resource"}]`;
    default:
      return toolJson(block);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
