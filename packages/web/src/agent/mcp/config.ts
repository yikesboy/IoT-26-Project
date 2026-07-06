import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

const mcpServerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).default({}),
});

const mcpConfigSchema = z.object({
  servers: z.record(z.string(), mcpServerConfigSchema).default({}),
});

export type McpServerConfig = z.infer<typeof mcpServerConfigSchema> & {
  name: string;
  cwd: string;
};

export async function loadMcpServerConfigs() {
  const configPath = findUp("mcp.config.json", process.cwd());
  if (!configPath) return [];

  const configDir = dirname(configPath);
  const rawConfig: unknown = JSON.parse(await readFile(configPath, "utf8"));
  const config = mcpConfigSchema.parse(rawConfig);

  return Object.entries(config.servers)
    .filter(([, server]) => server.enabled)
    .map(([name, server]) => ({
      ...server,
      name,
      cwd: resolve(configDir, server.cwd ?? "."),
    }));
}

function findUp(filename: string, startDirectory: string) {
  let directory = resolve(startDirectory);

  while (true) {
    const candidate = join(directory, filename);
    if (existsSync(candidate)) return candidate;

    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}
