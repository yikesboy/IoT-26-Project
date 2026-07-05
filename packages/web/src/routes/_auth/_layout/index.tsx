import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from "@/components/ui";
import {
  SendAgentMessageOutput as SendAgentMessageOutputSchema,
  type FinanceSummaryOutput,
  type ListFilesOutput,
  type PerformanceMetric,
} from "@/fns/assistant/api";
import {
  listFinanceSummaryFn,
  sendAgentMessageFn,
  setMonthlyBudgetFn,
  uploadFilesFn,
} from "@/fns/assistant/api.function";
import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GaugeIcon,
  Loader2Icon,
  PaperclipIcon,
  PiggyBankIcon,
  SaveIcon,
  SendIcon,
} from "lucide-react";
import prettyBytes from "pretty-bytes";
import { type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { currentLocalMonth } from "@/lib/date";
import { formatCurrency } from "@/lib/money";

export const Route = createFileRoute("/_auth/_layout/")({
  component: RouteComponent,
});

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  file?: ListFilesOutput["files"][number];
  metric?: PerformanceMetric | null;
};

const acceptedFileTypes =
  ".csv,.pdf,.png,.jpg,.jpeg,.txt,text/csv,text/plain,application/pdf,image/png,image/jpeg";

function RouteComponent() {
  const initialBudgetMonth = currentLocalMonth();
  const [threadId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        "Upload expenses, receipts, or invoices, then ask for categorization, budget tracking, or savings recommendations.",
    },
  ]);
  const [prompt, setPrompt] = useState("");
  const [summary, setSummary] = useState<FinanceSummaryOutput>({
    chartData: [],
    transactionCount: 0,
    month: initialBudgetMonth,
    monthlyBudget: null,
    monthlySpending: 0,
    remainingBudget: null,
  });
  const [budgetMonth, setBudgetMonth] = useState(initialBudgetMonth);
  const [selectedBudgetMonth, setSelectedBudgetMonth] = useState(initialBudgetMonth);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [storingFileId, setStoringFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  async function refreshData() {
    const summaryResult = await listFinanceSummaryFn({ data: { month: selectedBudgetMonth } });
    setSummary(summaryResult);
  }

  useEffect(() => {
    void refreshData().catch((err: Error) => {
      setError(`Failed to load assistant data: ${err.message}`);
    });
  }, [selectedBudgetMonth]);

  useEffect(() => {
    const scrollContainer = chatScrollRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [messages, isSending]);

  async function sendMessage() {
    const message = prompt.trim();
    if (!message || isSending) return;

    setPrompt("");
    await submitMessage(message);
  }

  async function submitMessage(message: string) {
    setError(null);
    setIsSending(true);
    const history = messages
      .filter((item) => item.role === "user" || item.role === "assistant")
      .slice(-10)
      .map((item) => ({
        role: item.role,
        content: item.content,
      }));

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: message },
    ]);

    try {
      const response = SendAgentMessageOutputSchema.parse(
        await sendAgentMessageFn({
          data: { threadId, message, month: selectedBudgetMonth, history },
        }),
      );
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.response || "I could not produce a response.",
          metric: response.metric,
        },
      ]);
      await refreshData();
    } catch (err: any) {
      setError(`Failed to send message: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  }

  async function uploadSelectedFiles(fileList: FileList | File[] | null) {
    const selectedFiles = fileList ? [...fileList] : [];
    if (selectedFiles.length === 0) return;

    setError(null);
    setIsUploading(true);
    try {
      const encodedFiles = await Promise.all(
        selectedFiles.map(async (file) => ({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          byteSize: file.size,
          contentBase64: await fileToBase64(file),
          metadata: {
            lastModified: file.lastModified,
          },
        })),
      );

      const uploadResult = await uploadFilesFn({
        data: { threadId, files: encodedFiles },
      });
      setMessages((current) => [
        ...current,
        ...uploadResult.files.map((file) => ({
          id: crypto.randomUUID(),
          role: "user" as const,
          content: `Uploaded ${file.filename} (${file.mimeType}, ${prettyBytes(file.byteSize)})`,
          file,
        })),
      ]);
      await refreshData();
    } catch (err: any) {
      setError(`Failed to upload files: ${err.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function storeFileAsTransaction(file: ListFilesOutput["files"][number]) {
    if (isSending || storingFileId) return;

    setStoringFileId(file.id);
    try {
      await submitMessage(
        [
          "Tool required: store uploaded file as one transaction.",
          `fileId=${file.id}`,
          `filename=${file.filename}`,
          "The user has already authorized saving this file as a transaction.",
          "First call extract_file_text with this fileId.",
          "If extraction returns a readable receipt or invoice, call list_categories and then save_transactions with exactly one transaction using the grand total.",
          "Do not ask for confirmation. Do not describe extracted text or saved transactions unless the corresponding tool returned that result.",
        ].join(" "),
      );
    } finally {
      setStoringFileId(null);
    }
  }

  function handleChatDragOver(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      setIsDraggingFile(true);
    }
  }

  function handleChatDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingFile(false);
    }
  }

  function handleChatDrop(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.files.length === 0) return;
    event.preventDefault();
    setIsDraggingFile(false);
    void uploadSelectedFiles(event.dataTransfer.files);
  }

  async function saveBudget() {
    const amount = Number(budgetAmount);
    if (!Number.isFinite(amount) || amount <= 0 || isSavingBudget) {
      return;
    }

    setError(null);
    setIsSavingBudget(true);
    try {
      await setMonthlyBudgetFn({
        data: {
          month: selectedBudgetMonth,
          amount,
        },
      });
      setBudgetAmount("");
      await refreshData();
    } catch (err: any) {
      setError(`Failed to save budget: ${err.message}`);
    } finally {
      setIsSavingBudget(false);
    }
  }

  const chartData = useMemo(() => summary.chartData.slice(0, 8), [summary.chartData]);
  const hasValidBudgetMonth = isBudgetMonth(budgetMonth);
  const canSaveBudget = hasValidBudgetMonth && Number(budgetAmount) > 0 && !isSavingBudget;

  function setBudgetMonthInput(month: string) {
    setBudgetMonth(month);
    if (isBudgetMonth(month)) setSelectedBudgetMonth(month);
  }

  function moveBudgetMonth(offset: number) {
    const month = shiftBudgetMonth(selectedBudgetMonth, offset);
    setBudgetMonth(month);
    setSelectedBudgetMonth(month);
  }

  return (
    <div className="h-full min-h-0 overflow-hidden grid grid-cols-[minmax(0,1fr)_22rem] bg-background">
      <section
        className="relative min-h-0 min-w-0 overflow-hidden flex flex-col border-r"
        onDragOver={handleChatDragOver}
        onDragLeave={handleChatDragLeave}
        onDrop={handleChatDrop}
      >
        <header className="px-6 py-4 border-b">
          <h1 className="text-xl font-semibold">Finance Assistant</h1>
          <p className="text-sm text-muted-foreground">
            Ask about expenses, budgets, invoices, and savings plans.
          </p>
        </header>

        <div
          ref={chatScrollRef}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-4 ${
            isDraggingFile ? "ring-2 ring-primary ring-inset" : ""
          }`}
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[78%] min-w-0 overflow-hidden rounded-md px-4 py-3 text-sm leading-6 ${
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-2 break-words last:mb-0">{children}</p>,
                    li: ({ children }) => <li className="break-words">{children}</li>,
                    a: ({ children, href }) => (
                      <a className="break-all underline" href={href}>
                        {children}
                      </a>
                    ),
                    ul: ({ children }) => (
                      <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
                    ),
                    pre: ({ children }) => (
                      <pre className="mb-2 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded bg-background/70 p-3 text-[0.85em] last:mb-0">
                        {children}
                      </pre>
                    ),
                    code: ({ children }) => (
                      <code className="max-w-full break-words rounded bg-background/70 px-1 py-0.5 text-[0.85em]">
                        {children}
                      </code>
                    ),
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
                {message.file ? (
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant={message.role === "user" ? "secondary" : "outline"}
                      disabled={isSending || storingFileId !== null}
                      onClick={() => void storeFileAsTransaction(message.file!)}
                    >
                      {storingFileId === message.file.id ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <SaveIcon className="size-4" />
                      )}
                      Store as transaction
                    </Button>
                  </div>
                ) : null}
                {message.role === "assistant" && message.metric ? (
                  <div className="mt-3 flex justify-end">
                    <MetricDialog metric={message.metric} />
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {isSending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Thinking
            </div>
          ) : null}
        </div>

        {isDraggingFile ? (
          <div className="pointer-events-none absolute inset-x-4 bottom-20 top-24 z-10 grid place-items-center rounded-md border border-dashed border-primary bg-background/85 text-sm font-medium shadow-sm">
            Drop files into this chat
          </div>
        ) : null}

        {error ? (
          <div className="mx-6 mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <footer className="border-t p-4">
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={acceptedFileTypes}
              className="hidden"
              onChange={(event) => void uploadSelectedFiles(event.currentTarget.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              title="Upload files"
            >
              {isUploading ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <PaperclipIcon className="size-4" />
              )}
            </Button>
            <Input
              value={prompt}
              placeholder="Analyze my monthly expenses and suggest savings"
              onChange={(event) => setPrompt(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
            />
            <Button type="button" onClick={() => void sendMessage()} disabled={isSending}>
              <SendIcon className="size-4" />
              Send
            </Button>
          </div>
        </footer>
      </section>

      <aside className="min-h-0 overflow-hidden p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PiggyBankIcon className="size-4" />
              Budget
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => moveBudgetMonth(-1)}
                title="Previous month"
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
              <Input
                type="month"
                value={budgetMonth}
                aria-invalid={!hasValidBudgetMonth}
                onChange={(event) => setBudgetMonthInput(event.currentTarget.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => moveBudgetMonth(1)}
                title="Next month"
              >
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
              <div className="text-xs text-muted-foreground self-center">
                Viewing {selectedBudgetMonth}
              </div>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={budgetAmount}
                placeholder={summary.monthlyBudget?.toFixed(2) ?? "0.00"}
                onChange={(event) => setBudgetAmount(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveBudget();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={!canSaveBudget}
              onClick={() => void saveBudget()}
            >
              {isSavingBudget ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SaveIcon className="size-4" />
              )}
              Set budget
            </Button>
            <div className="space-y-2 text-sm">
              <MetricRow
                label="Budget"
                value={
                  summary.monthlyBudget === null ? "Not set" : formatCurrency(summary.monthlyBudget)
                }
              />
              <MetricRow label="Spent" value={formatCurrency(summary.monthlySpending)} />
              <MetricRow
                label="Remaining"
                value={
                  summary.remainingBudget === null
                    ? "Not set"
                    : formatCurrency(summary.remainingBudget)
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3Icon className="size-4" />
              Spending
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Save transactions through the assistant to populate this chart.
              </p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="category" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={42} />
                    <Tooltip />
                    <Bar dataKey="amount" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function MetricDialog({ metric }: { metric: PerformanceMetric }) {
  const structuredToolCalls = getStructuredToolCalls(metric);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <GaugeIcon className="size-4" />
          Metrics
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[70vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GaugeIcon className="size-4" />
            Response Metrics
          </DialogTitle>
          <DialogDescription>
            Runtime, resource usage, tool timings, and Ollama response statistics for this answer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <MetricStat label="Latency" value={`${metric.totalDurationMs} ms`} />
            <MetricStat label="Model" value={formatNullableMs(metric.modelDurationMs)} />
            <MetricStat label="Tools" value={metric.toolInvocationCount} />
          </div>

          <MetricSection title="Runtime" columns={2}>
            <MetricRow label="Tool overhead" value={formatNullableMs(metric.toolDurationMs)} />
            <MetricRow label="CPU user" value={formatNullableMicros(metric.cpuUserMicros)} />
            <MetricRow label="CPU system" value={formatNullableMicros(metric.cpuSystemMicros)} />
            <MetricRow label="RSS" value={formatNullableBytes(metric.rssBytes)} />
            <MetricRow label="Heap" value={formatNullableBytes(metric.heapUsedBytes)} />
          </MetricSection>

          <MetricSection title="Ollama" columns={2}>
            {metric.ollama ? (
              <>
                <MetricRow label="Total" value={formatNullableMs(metric.ollama.totalDurationMs)} />
                <MetricRow label="Load" value={formatNullableMs(metric.ollama.loadDurationMs)} />
                <MetricRow
                  label="Prompt tokens"
                  value={metric.ollama.promptEvalCount ?? "Not reported"}
                />
                <MetricRow
                  label="Prompt eval"
                  value={formatNullableMs(metric.ollama.promptEvalDurationMs)}
                />
                <MetricRow
                  label="Output tokens"
                  value={metric.ollama.evalCount ?? "Not reported"}
                />
                <MetricRow
                  label="Output eval"
                  value={formatNullableMs(metric.ollama.evalDurationMs)}
                />
                <MetricRow
                  label="Model memory"
                  value={formatNullableBytes(metric.ollama.memory?.sizeBytes ?? null)}
                />
                <MetricRow
                  label="VRAM"
                  value={formatNullableBytes(metric.ollama.memory?.sizeVramBytes ?? null)}
                />
                <MetricRow
                  label="Context"
                  value={metric.ollama.memory?.contextLength ?? "Not reported"}
                />
                <MetricRow label="Loaded model" value={metric.ollama.memory?.model ?? "Unknown"} />
              </>
            ) : (
              <p className="text-muted-foreground">No Ollama metrics reported for this response.</p>
            )}
          </MetricSection>

          <MetricSection title="Tools">
            {metric.toolCalls.length > 0 ? (
              <>
                {metric.toolCalls.map((toolCall, index) => (
                  <MetricRow
                    key={`${toolCall.name}-${index}`}
                    label={toolCall.name}
                    value={`${toolCall.durationMs} ms`}
                  />
                ))}
              </>
            ) : (
              <p className="text-muted-foreground">No tools were invoked.</p>
            )}
            <MetricRow
              label="Structured calls"
              value={structuredToolCalls.length > 0 ? structuredToolCalls.join(", ") : "None"}
            />
          </MetricSection>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetricStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate font-semibold">{value}</div>
    </div>
  );
}

function MetricSection({
  title,
  children,
  columns = 1,
}: {
  title: string;
  children: ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <section className="rounded-md border">
      <div className="border-b bg-muted/40 px-3 py-1.5 font-medium">{title}</div>
      <div className={columns === 2 ? "grid grid-cols-2 gap-x-4 px-3" : "divide-y px-3"}>
        {children}
      </div>
    </section>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}

function getStructuredToolCalls(metric: PerformanceMetric) {
  const value = metric.metadata["modelToolCalls"];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function formatNullableMs(value: number | null) {
  return value === null ? "Not reported" : `${value} ms`;
}

function formatNullableMicros(value: number | null) {
  return value === null ? "Not reported" : `${value} us`;
}

function formatNullableBytes(value: number | null) {
  return value === null ? "Not reported" : prettyBytes(value);
}

async function fileToBase64(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to encode uploaded file."));
        return;
      }
      resolve(reader.result.split(",", 2)[1] ?? "");
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function isBudgetMonth(month: string) {
  return /^\d{4}-\d{2}$/.test(month);
}

function shiftBudgetMonth(month: string, offset: number) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return currentLocalMonth();

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
