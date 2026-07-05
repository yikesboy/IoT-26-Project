import { z } from "zod";
import { formatCurrency, formatPercent } from "@/lib/money";
import store from "./store";
import type { StoredTransaction } from "./tools/transactions";

export const storedBudgetSchema = z.object({
  month: z.string(),
  monthlyBudget: z.number(),
  savedAt: z.string(),
});

export async function getMonthlyBudget(userId: string, month: string) {
  const budgetRow = await store.get(["users", userId, "budgets"], month);
  const budgetValue = budgetRow && "value" in budgetRow ? budgetRow.value : undefined;
  const budget = storedBudgetSchema.safeParse(budgetValue);
  return budget.success ? budget.data.monthlyBudget : null;
}

export async function saveMonthlyBudget(userId: string, month: string, monthlyBudget: number) {
  const budget = {
    month,
    monthlyBudget,
    savedAt: new Date().toISOString(),
  };
  await store.put(["users", userId, "budgets"], month, budget);
  return budget;
}

export function summarizeTransactions(
  transactions: Array<Pick<StoredTransaction, "amount" | "categoryName" | "direction">>,
  monthlyBudget: number | null,
) {
  const categories = new Map<string, number>();
  let income = 0;
  let spending = 0;

  for (const transaction of transactions) {
    const categoryName = transaction.categoryName ?? "Misc";
    if (transaction.direction === "incoming") {
      income += transaction.amount;
    } else {
      spending += transaction.amount;
      categories.set(categoryName, (categories.get(categoryName) ?? 0) + transaction.amount);
    }
  }

  const net = income - spending;
  const savingsRate = income > 0 ? net / income : null;
  const budgetUsageRate = monthlyBudget === null ? null : spending / monthlyBudget;
  const categoryTotals = [...categories.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      spendingShare: spending > 0 ? amount / spending : 0,
    }))
    .sort((left, right) => right.amount - left.amount);

  return {
    income,
    spending,
    net,
    savingsRate,
    monthlyBudget,
    budgetUsageRate,
    remainingBudget: monthlyBudget === null ? null : monthlyBudget - spending,
    transactionCount: transactions.length,
    categories: categoryTotals,
  };
}

export function formatBudgetOverviewMarkdown(
  month: string,
  summary: ReturnType<typeof summarizeTransactions>,
) {
  return [
    `## Budget Overview for ${month}`,
    "",
    `- Transactions counted: **${summary.transactionCount}**`,
    `- Spent: **${formatCurrency(summary.spending)}**`,
    `- Monthly budget: **${summary.monthlyBudget === null ? "Not set" : formatCurrency(summary.monthlyBudget)}**`,
    `- Remaining: **${summary.remainingBudget === null ? "Not set" : formatCurrency(summary.remainingBudget)}**`,
    `- Budget used: **${summary.budgetUsageRate === null ? "Not set" : formatPercent(summary.budgetUsageRate)}**`,
    "",
    "## Category Breakdown",
    "",
    ...summary.categories.map(
      (category) =>
        `- ${category.category}: **${formatCurrency(category.amount)}** (${formatPercent(category.spendingShare)} of spending)`,
    ),
  ].join("\n");
}
