import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool as McpTool } from "@modelcontextprotocol/sdk/types.js";
import { loadMcpServerConfigs, type McpServerConfig } from "./config";
import { formatMcpToolName } from "./names";

export type McpServerConnection = {
  name: string;
  config: McpServerConfig;
  client: Client;
  tools: McpTool[];
};

export type McpServerStatus = {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  connected: boolean;
  error: string | null;
  tools: Array<{
    name: string;
    agentName: string;
    description: string | null;
  }>;
};

type McpServerRecord = {
  connection: McpServerConnection | null;
  status: McpServerStatus;
};

let recordsPromise: Promise<McpServerRecord[]> | null = null;

export function getMcpServerConnections() {
  return getMcpServerRecords().then((records) =>
    records
      .map((record) => record.connection)
      .filter((connection): connection is McpServerConnection => connection !== null),
  );
}

export function getMcpServerStatus() {
  return getMcpServerRecords().then((records) => records.map((record) => record.status));
}

function getMcpServerRecords() {
  recordsPromise ??= connectConfiguredMcpServers();
  return recordsPromise;
}

async function connectConfiguredMcpServers(): Promise<McpServerRecord[]> {
  const configs = await loadMcpServerConfigs();
  return Promise.all(configs.map(connectMcpServer));
}

async function connectMcpServer(config: McpServerConfig) {
  try {
    const client = new Client({ name: "iot-26-project", version: "0.0.1" }, { capabilities: {} });
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      cwd: config.cwd,
      env: {
        ...getDefaultEnvironment(),
        ...config.env,
      },
      stderr: "pipe",
    });

    transport.stderr?.on("data", (chunk: Buffer) => {
      const message = chunk.toString("utf8").trim();
      if (message) console.warn(`[mcp:${config.name}] ${message}`);
    });

    await client.connect(transport);
    const { tools } = await client.listTools();

    const connection = {
      name: config.name,
      config,
      client,
      tools,
    };

    return {
      connection,
      status: {
        name: config.name,
        command: config.command,
        args: config.args,
        cwd: config.cwd,
        connected: true,
        error: null,
        tools: tools.map((mcpTool) => ({
          name: mcpTool.name,
          agentName: formatMcpToolName(config.name, mcpTool.name),
          description: mcpTool.description ?? null,
        })),
      },
    };
  } catch (error) {
    const message = errorMessage(error);
    console.warn(`[mcp:${config.name}] failed to start: ${message}`);
    return {
      connection: null,
      status: {
        name: config.name,
        command: config.command,
        args: config.args,
        cwd: config.cwd,
        connected: false,
        error: message,
        tools: [],
      },
    };
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
