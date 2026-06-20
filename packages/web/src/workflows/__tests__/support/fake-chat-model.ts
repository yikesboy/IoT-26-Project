export interface FakeModelInvocation {
  input: unknown;
  outputKind: "text" | "structured";
  schema?: unknown;
}

interface QueuedResponse {
  kind: "response" | "error";
  value: unknown;
}

export class ConfigurableFakeChatModel {
  readonly invocations: FakeModelInvocation[] = [];
  readonly #responses: QueuedResponse[] = [];

  constructor(responses: unknown[] = []) {
    this.#responses.push(...responses.map((value) => ({ kind: "response" as const, value })));
  }

  enqueueResponse(value: unknown): void {
    this.#responses.push({ kind: "response", value });
  }

  enqueueError(error: Error): void {
    this.#responses.push({ kind: "error", value: error });
  }

  async invoke(input: unknown): Promise<unknown> {
    this.invocations.push({ input, outputKind: "text" });
    return this.takeResponse();
  }

  withStructuredOutput<Output>(schema: unknown): { invoke: (input: unknown) => Promise<Output> } {
    return {
      invoke: async (input: unknown) => {
        this.invocations.push({ input, outputKind: "structured", schema });
        return (await this.takeResponse()) as Output;
      },
    };
  }

  reset(): void {
    this.invocations.length = 0;
    this.#responses.length = 0;
  }

  private async takeResponse(): Promise<unknown> {
    const response = this.#responses.shift();
    if (!response) throw new Error("No fake model response is queued.");
    if (response.kind === "error") throw response.value;
    return structuredClone(response.value);
  }
}
