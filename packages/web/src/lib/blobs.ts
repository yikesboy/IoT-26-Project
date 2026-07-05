import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  type UploadedFile,
  type UploadFileInput,
  uploadFileInputSchema,
  jsonValueSchema,
} from "./finance-schemas";
import sql from "./db";

type SqlJsonValue = Parameters<typeof sql.json>[0];

const blobRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  thread_id: z.string(),
  filename: z.string(),
  mime_type: z.string(),
  byte_size: z.union([z.string(), z.number()]),
  sha256: z.string(),
  content: z.instanceof(Uint8Array),
  metadata: z.record(z.string(), jsonValueSchema),
  created_at: z.union([z.date(), z.string()]),
});

type BlobRowFromSchema = z.infer<typeof blobRowSchema>;

function rowToUploadedFile(
  row: Omit<BlobRowFromSchema, "content" | "user_id" | "thread_id">,
): UploadedFile {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    sha256: row.sha256,
    metadata: row.metadata,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export async function saveUploadedFile(
  userId: string,
  threadId: string,
  file: UploadFileInput,
): Promise<UploadedFile> {
  const parsedFile = uploadFileInputSchema.parse(file);
  const content = Buffer.from(parsedFile.contentBase64, "base64");
  if (content.byteLength !== parsedFile.byteSize) {
    throw new Error("Uploaded file size does not match decoded content.");
  }

  const sha256 = createHash("sha256").update(content).digest("hex");
  const id = randomUUID();

  const [rawRow] = await sql<Record<string, unknown>[]>`
    INSERT INTO uploaded_blob (
      id,
      user_id,
      thread_id,
      filename,
      mime_type,
      byte_size,
      sha256,
      content,
      metadata
    )
    VALUES (
      ${id},
      ${userId},
      ${threadId},
      ${parsedFile.filename},
      ${parsedFile.mimeType},
      ${parsedFile.byteSize},
      ${sha256},
      ${content},
      ${sql.json(parsedFile.metadata as SqlJsonValue)}
    )
    RETURNING id, filename, mime_type, byte_size, sha256, metadata, created_at
  `;

  if (!rawRow) {
    throw new Error("Failed to store uploaded file.");
  }

  const row = blobRowSchema.omit({ content: true, user_id: true, thread_id: true }).parse(rawRow);
  return rowToUploadedFile(row);
}

export async function listUploadedFiles(userId: string, threadId: string): Promise<UploadedFile[]> {
  const rawRows = await sql<Record<string, unknown>[]>`
    SELECT id, filename, mime_type, byte_size, sha256, metadata, created_at
    FROM uploaded_blob
    WHERE user_id = ${userId}
      AND thread_id = ${threadId}
    ORDER BY created_at DESC
  `;

  const rows = z
    .array(blobRowSchema.omit({ content: true, user_id: true, thread_id: true }))
    .parse(rawRows);
  return rows.map(rowToUploadedFile);
}

export async function getUploadedBlob(userId: string, threadId: string, blobId: string) {
  const [rawRow] = await sql<Record<string, unknown>[]>`
    SELECT id, user_id, thread_id, filename, mime_type, byte_size, sha256, content, metadata, created_at
    FROM uploaded_blob
    WHERE id = ${blobId}
      AND user_id = ${userId}
      AND thread_id = ${threadId}
  `;

  if (!rawRow) {
    throw new Error("File not found or access denied.");
  }

  const row = blobRowSchema.parse(rawRow);
  return {
    ...rowToUploadedFile(row),
    content: Buffer.from(row.content),
  };
}
