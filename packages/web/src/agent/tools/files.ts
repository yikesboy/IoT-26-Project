import { tool } from "langchain";
import Papa from "papaparse";
import { createWorker } from "tesseract.js";
import { z } from "zod";
import { getUploadedBlob, listUploadedFiles } from "@/lib/blobs";
import { measureTool } from "../metrics";
import { emptyToolSchema, requireContext, toolJson, type FinanceRuntime } from "./shared";

const textFileTypes = new Set([
  "text/plain",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
]);

const extractFileTextSchema = z.object({
  fileId: z
    .string()
    .describe("The uploaded file id from list_uploaded_files or the chat file list."),
  language: z.enum(["eng", "deu"]).default("eng"),
});

export async function executeExtractFileText(
  userId: string,
  threadId: string,
  input: z.infer<typeof extractFileTextSchema>,
) {
  const blob = await getUploadedBlob(userId, threadId, input.fileId);

  let text: string;
  if (textFileTypes.has(blob.mimeType)) {
    const raw = blob.content.toString("utf8");
    text = blob.mimeType.includes("csv") ? csvToText(raw) : raw;
  } else if (blob.mimeType === "application/pdf") {
    text = await extractPdfText(blob.content);
  } else if (blob.mimeType.startsWith("image/")) {
    text = await extractImageText(blob.content, input.language);
  } else {
    throw new Error(`Unsupported file type: ${blob.mimeType}`);
  }

  return {
    file: {
      id: blob.id,
      filename: blob.filename,
      mimeType: blob.mimeType,
      byteSize: blob.byteSize,
    },
    text: text.slice(0, 20_000),
    truncated: text.length > 20_000,
  };
}

export const listUploadedFilesTool = tool(
  async (_input: Record<string, never>, runtime: FinanceRuntime) =>
    measureTool("list_uploaded_files", async () => {
      const { userId, threadId } = requireContext(runtime);
      const files = await listUploadedFiles(userId, threadId);
      if (files.length === 0) return "No uploaded files found.";
      return toolJson(
        files.map(({ id, filename, mimeType, byteSize, createdAt }) => ({
          id,
          filename,
          mimeType,
          byteSize,
          createdAt,
        })),
      );
    }),
  {
    name: "list_uploaded_files",
    description:
      "List files uploaded by the current authenticated user in the current chat. Use this only for requests about uploaded files, receipts, invoices, statements, CSVs, or when file content is needed.",
    schema: emptyToolSchema,
  },
);

export const extractFileText = tool(
  async (input: z.infer<typeof extractFileTextSchema>, runtime: FinanceRuntime) =>
    measureTool("extract_file_text", async () => {
      const { userId, threadId } = requireContext(runtime);
      return toolJson(await executeExtractFileText(userId, threadId, input));
    }),
  {
    name: "extract_file_text",
    description:
      "Extract readable text from an owned uploaded CSV, text, PDF, or image file in the current chat. For images this performs OCR. Always call this tool before claiming that receipt/invoice text was extracted or before asking the user to manually provide receipt or invoice amounts. Use this before analyzing or saving a receipt, invoice, statement, or CSV. If extracted text is not a receipt/invoice/finance document or is unreadable, explain that it cannot be stored as a transaction instead of inventing one.",
    schema: extractFileTextSchema,
  },
);

function csvToText(text: string) {
  const parsed = Papa.parse<string[]>(text.trim(), {
    skipEmptyLines: true,
  });
  const rows = parsed.data;
  if (rows.length === 0) return "No CSV rows found.";

  const [headers = [], ...dataRows] = rows;
  return dataRows
    .slice(0, 200)
    .map((row, index) => {
      const values = row.map((value, valueIndex) => {
        const header = headers[valueIndex] || `column_${valueIndex + 1}`;
        return `${header}: ${value}`;
      });
      return `Row ${index + 1}: ${values.join("; ")}`;
    })
    .join("\n");
}

async function extractPdfText(content: Buffer) {
  const { default: pdfParse } = await import("pdf-parse");
  const parsed = await pdfParse(content);
  return parsed.text.trim();
}

async function extractImageText(content: Buffer, language: "eng" | "deu") {
  const worker = await createWorker(language);
  try {
    const result = await worker.recognize(content);
    return result.data.text.trim();
  } finally {
    await worker.terminate();
  }
}
