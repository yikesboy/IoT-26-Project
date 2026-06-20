import { readFile } from "node:fs/promises";

export const receiptFixtureNames = [
  "valid-receipt",
  "invoice",
  "unreadable-document",
  "missing-total",
  "duplicate-upload",
] as const;

export type ReceiptFixtureName = (typeof receiptFixtureNames)[number];

export function loadReceiptFixture(name: ReceiptFixtureName): Promise<string> {
  return readFile(new URL(`./${name}.txt`, import.meta.url), "utf8");
}
