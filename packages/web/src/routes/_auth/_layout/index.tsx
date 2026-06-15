import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";
import {
  SendAgentMessageOutput as SendAgentMessageOutputSchema,
  type FinanceSummaryOutput,
  type ListFilesOutput,
  type ListMetricsOutput,
} from "@/fns/assistant/api";
import {
  listFinanceSummaryFn,
  listMetricsFn,
  sendAgentMessageFn,
  setMonthlyBudgetFn,
  uploadFilesFn,
} from "@/fns/assistant/api.function";
import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3Icon,
  Loader2Icon,
  PaperclipIcon,
  PiggyBankIcon,
  SaveIcon,
  SendIcon,
} from "lucide-react";
import prettyBytes from "pretty-bytes";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
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
};

const acceptedFileTypes =
  ".csv,.pdf,.png,.jpg,.jpeg,.txt,text/csv,text/plain,application/pdf,image/png,image/jpeg";

function RouteComponent() {
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
    month: currentLocalMonth(),
    monthlyBudget: null,
    monthlySpending: 0,
    remainingBudget: null,
  });
  const [budgetMonth, setBudgetMonth] = useState(currentLocalMonth);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [metrics, setMetrics] = useState<ListMetricsOutput["metrics"]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [storingFileId, setStoringFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  async function refreshData() {
    const [summaryResult, metricResult] = await Promise.all([
      listFinanceSummaryFn({ data: { month: budgetMonth } }),
      listMetricsFn({ data: {} }),
    ]);
    setSummary(summaryResult);
    setMetrics(metricResult.metrics);
  }

  useEffect(() => {
    void refreshData().catch((err: Error) => {
      setError(`Failed to load assistant data: ${err.message}`);
    });
  }, [budgetMonth]);

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
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: message },
    ]);

    try {
      const response = SendAgentMessageOutputSchema.parse(
        await sendAgentMessageFn({
          data: { threadId, message, month: budgetMonth },
        }),
      );
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.response || "I could not produce a response.",
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
        `Store uploaded file as a transaction. File id: ${file.id}. File name: ${file.filename}.`,
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
    if (
      !/^\d{4}-\d{2}$/.test(budgetMonth) ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      isSavingBudget
    ) {
      return;
    }

    setError(null);
    setIsSavingBudget(true);
    try {
      await setMonthlyBudgetFn({
        data: {
          month: budgetMonth,
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

  const latestMetric = metrics[0];
  const chartData = useMemo(() => summary.chartData.slice(0, 8), [summary.chartData]);

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
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
              <Input
                type="month"
                value={budgetMonth}
                onChange={(event) => setBudgetMonth(event.currentTarget.value)}
              />
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
              disabled={isSavingBudget || Number(budgetAmount) <= 0}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {latestMetric ? (
              <>
                <MetricRow label="Latency" value={`${latestMetric.totalDurationMs} ms`} />
                <MetricRow label="Tool overhead" value={`${latestMetric.toolDurationMs ?? 0} ms`} />
                <MetricRow label="Tool calls" value={latestMetric.toolInvocationCount} />
                <MetricRow label="Memory" value={prettyBytes(latestMetric.rssBytes ?? 0)} />
              </>
            ) : (
              <p className="text-muted-foreground">No interactions measured yet.</p>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
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
