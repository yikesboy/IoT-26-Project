import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@/components/ui";
import { McpStatusOutput, type McpStatusOutput as McpStatusOutputType } from "@/fns/assistant/api";
import { listMcpStatusFn } from "@/fns/assistant/api.function";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangleIcon, CheckCircle2Icon, PlugIcon } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_auth/_layout/mcp")({
  component: RouteComponent,
});

function RouteComponent() {
  const [status, setStatus] = useState<McpStatusOutputType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMcpStatusFn()
      .then((result) => {
        setStatus(McpStatusOutput.parse(result));
        setError(null);
      })
      .catch((err: Error) => {
        setError(`Failed to load MCP status: ${err.message}`);
      });
  }, []);

  return (
    <div className="h-full overflow-auto">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <PlugIcon className="size-6" />
            <h1 className="text-2xl font-semibold">MCP Servers</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Local MCP servers currently loaded by the assistant.
          </p>
        </header>

        {error ? (
          <Card>
            <CardContent className="flex items-center gap-3 p-6 text-destructive">
              <AlertTriangleIcon className="size-5" />
              <span>{error}</span>
            </CardContent>
          </Card>
        ) : null}

        {!status && !error ? <McpStatusSkeleton /> : null}

        {status ? (
          <>
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
                <div>
                  <p className="text-sm text-muted-foreground">Loaded servers</p>
                  <p className="text-3xl font-semibold">{status.servers.length}</p>
                </div>
                <Badge variant={status.enabled ? "default" : "secondary"}>
                  {status.enabled ? "MCP enabled" : "MCP disabled"}
                </Badge>
              </CardContent>
            </Card>

            {status.servers.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  No MCP servers are loaded. Create `mcp.config.json` and restart the UI server to
                  enable local MCP tools.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {status.servers.map((server) => (
                  <Card key={server.name}>
                    <CardHeader className="flex-row items-start justify-between gap-4">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {server.connected ? (
                            <CheckCircle2Icon className="size-5 text-emerald-600" />
                          ) : (
                            <AlertTriangleIcon className="size-5 text-destructive" />
                          )}
                          {server.name}
                        </CardTitle>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {server.command} {server.args.join(" ")}
                        </p>
                      </div>
                      <Badge variant={server.connected ? "default" : "destructive"}>
                        {server.connected ? "Connected" : "Failed"}
                      </Badge>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="grid gap-1 text-sm">
                        <span className="text-muted-foreground">Working directory</span>
                        <code className="rounded bg-muted px-2 py-1 text-xs break-all">
                          {server.cwd}
                        </code>
                      </div>

                      {server.error ? (
                        <div className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                          {server.error}
                        </div>
                      ) : null}

                      <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-3">
                          <h2 className="text-sm font-medium">Agent tools</h2>
                          <span className="text-sm text-muted-foreground">
                            {server.tools.length} tools
                          </span>
                        </div>
                        {server.tools.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            This server did not expose tools to the assistant.
                          </p>
                        ) : (
                          <div className="grid gap-2">
                            {server.tools.map((tool) => (
                              <div
                                key={tool.agentName}
                                className="grid gap-1 rounded border p-3 text-sm"
                              >
                                <code className="text-xs font-semibold break-all">
                                  {tool.agentName}
                                </code>
                                {tool.description ? (
                                  <p className="text-muted-foreground">{tool.description}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}

function McpStatusSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-28" />
      <Skeleton className="h-72" />
    </div>
  );
}
