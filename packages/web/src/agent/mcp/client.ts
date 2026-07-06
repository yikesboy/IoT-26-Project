import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool as McpTool } from "@modelcontextprotocol/sdk/types.js";
import { loadMcpServerConfigs, type McpServerConfig } from "./config";

export type McpServerConnection = {
  name: string;
  config: McpServerConfig;
  client: Client;
  tools: McpTool[];
};

let connectionsPromise: Promise<McpServerConnection[]> | null = null;

export function getMcpServerConnections() {
  connectionsPromise ??= connectConfiguredMcpServers();
  return connectionsPromise;
}

async function connectConfiguredMcpServers() {
  const configs = await loadMcpServerConfigs();
  const connections = await Promise.all(configs.map(connectMcpServer));
  return connections.filter((connection): connection is McpServerConnection => connection !== null);
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

    return {
      name: config.name,
      config,
      client,
      tools,
    };
  } catch (error) {
    console.warn(`[mcp:${config.name}] failed to start: ${errorMessage(error)}`);
    return null;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
