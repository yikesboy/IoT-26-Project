import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadReceiptFixture, receiptFixtureNames } from "./fixtures";
import { ConfigurableFakeChatModel } from "./support/fake-chat-model";
import { InMemoryFinanceRepository } from "./support/in-memory-finance-repository";

describe("workflow test foundation", () => {
  it("loads all receipt fixtures", async () => {
    const fixtures = await Promise.all(receiptFixtureNames.map(loadReceiptFixture));

    expect(fixtures).toHaveLength(5);
    expect(fixtures.every((fixture) => fixture.trim().length > 0)).toBe(true);
  });

  it("returns configured structured model output and records the invocation", async () => {
    const output = { merchant: "Fresh Market", total: 8.82 };
    const schema = z.object({ merchant: z.string(), total: z.number() });
    const model = new ConfigurableFakeChatModel([output]);

    const result = await model.withStructuredOutput<z.infer<typeof schema>>(schema).invoke({
      text: await loadReceiptFixture("valid-receipt"),
    });

    expect(schema.parse(result)).toEqual(output);
    expect(model.invocations).toMatchObject([
      { outputKind: "structured", input: { text: expect.stringContaining("FRESH MARKET") } },
    ]);
  });

  it("stores isolated finance data and supports forced failures", async () => {
    const repository = new InMemoryFinanceRepository();
    await repository.saveCategory("user-1", {
      id: "groceries",
      name: "Groceries",
      createdAt: "2026-06-20T00:00:00.000Z",
    });
    await repository.saveTransaction("user-1", {
      id: "transaction-1",
      name: "Fresh Market",
      amount: 8.82,
      categoryId: "groceries",
      sourceFileId: "file-1",
    });

    await expect(repository.findTransactionBySourceFile("user-1", "file-1")).resolves.toMatchObject({
      id: "transaction-1",
      userId: "user-1",
    });
    await expect(repository.listTransactions("user-2")).resolves.toEqual([]);

    repository.failNext("listTransactions", new Error("forced read failure"));
    await expect(repository.listTransactions("user-1")).rejects.toThrow("forced read failure");
    await expect(repository.listTransactions("user-1")).resolves.toHaveLength(1);

    repository.failNext("saveTransaction", new Error("forced write failure"));
    await expect(
      repository.saveTransaction("user-1", {
        id: "transaction-2",
        name: "Northstar Energy",
        amount: 100,
        categoryId: "utilities",
      }),
    ).rejects.toThrow("forced write failure");
    await expect(repository.listTransactions("user-1")).resolves.toHaveLength(1);
  });
});
