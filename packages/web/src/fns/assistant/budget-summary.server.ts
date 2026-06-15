import type { StoredTransaction } from "@/agent/tools";
import { formatCurrency, formatPercent } from "@/lib/money";

export function formatBudgetSummaryResponse(
  transactions: StoredTransaction[],
  month: string,
  monthlyBudget: number | null,
) {
  const outgoing = transactions.filter((transaction) => transaction.direction === "outgoing");
  const spending = outgoing.reduce((sum, transaction) => sum + transaction.amount, 0);
  const remainingBudget = monthlyBudget === null ? null : monthlyBudget - spending;
  const usageRate = monthlyBudget === null || monthlyBudget === 0 ? null : spending / monthlyBudget;
  const categories = totalsByCategory(outgoing);

  const categoryLines = [...categories.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      share: spending > 0 ? amount / spending : 0,
    }))
    .sort((left, right) => right.amount - left.amount)
    .map(
      ({ category, amount, share }) =>
        `- **${category}**: ${formatCurrency(amount)} (${formatPercent(share)} of spending)`,
    );

  return [
    `## Budget Summary for ${month}`,
    "",
    `- Transactions counted: **${outgoing.length}**`,
    `- Spent: **${formatCurrency(spending)}**`,
    `- Monthly budget: **${monthlyBudget === null ? "Not set" : formatCurrency(monthlyBudget)}**`,
    `- Remaining: **${remainingBudget === null ? "Not set" : formatCurrency(remainingBudget)}**`,
    usageRate === null ? null : `- Budget used: **${formatPercent(usageRate)}**`,
    "",
    "### Category Breakdown",
    categoryLines.length > 0 ? categoryLines.join("\n") : "- No spending recorded for this month.",
    "",
    "### Recommendation",
    budgetRecommendation(spending, monthlyBudget, categories),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function totalsByCategory(transactions: StoredTransaction[]) {
  const categories = new Map<string, number>();
  for (const transaction of transactions) {
    const category = transaction.categoryName ?? "Uncategorized";
    categories.set(category, (categories.get(category) ?? 0) + transaction.amount);
  }
  return categories;
}

function budgetRecommendation(
  spending: number,
  monthlyBudget: number | null,
  categories: Map<string, number>,
) {
  if (spending === 0) return "No spending is recorded for this month yet.";

  const largestCategory = [...categories.entries()].sort((left, right) => right[1] - left[1])[0];
  const categoryAdvice = largestCategory
    ? ` Your largest category is **${largestCategory[0]}** at ${formatCurrency(largestCategory[1])}.`
    : "";

  if (monthlyBudget === null) {
    return `Set a monthly budget to track remaining room.${categoryAdvice}`;
  }

  if (spending > monthlyBudget) {
    return `You are over budget by **${formatCurrency(spending - monthlyBudget)}**.${categoryAdvice}`;
  }

  return `You are within budget with **${formatCurrency(monthlyBudget - spending)}** remaining.${categoryAdvice}`;
}
