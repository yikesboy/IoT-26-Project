import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth";
import { AgentStreamEvent, SendAgentMessageInput } from "@/fns/assistant/api";
import { streamAgentMessage } from "@/fns/assistant/api.server";
import { errorMessage } from "@/fns/assistant/messages";

export const Route = createFileRoute("/api/assistant/stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const parsed = SendAgentMessageInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid assistant request", details: parsed.error.flatten() },
            { status: 400 },
          );
        }

        const encoder = new TextEncoder();
        const disconnectController = new AbortController();
        const signal = AbortSignal.any([request.signal, disconnectController.signal]);
        let closed = false;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            const emit = (event: AgentStreamEvent) => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
              } catch {
                closed = true;
                disconnectController.abort();
              }
            };

            void streamAgentMessage(session.user.id, parsed.data, emit, signal)
              .catch((error) => {
                if (!request.signal.aborted) {
                  emit({ type: "error", message: errorMessage(error) });
                }
              })
              .finally(() => {
                if (!closed) {
                  closed = true;
                  controller.close();
                }
              });
          },
          cancel() {
            closed = true;
            disconnectController.abort();
          },
        });

        return new Response(body, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
