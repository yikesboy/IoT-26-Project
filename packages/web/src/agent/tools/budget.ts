import { tool } from "langchain";
import { z } from "zod";
import { measureTool } from "../metrics";
import store from "../store";
import { parseJsonInput, requireContext, toolJson, type FinanceRuntime } from "./shared";
import { transactionSchema } from "./transactions";

const budgetTransactionSchema = transactionSchema.extend({
  id: z.string().optional(),
});

const budgetSummarySchema = z.preprocess(
  (value) => {
    const parsedValue = parseJsonInput(value);
    if (Array.isArray(parsedValue)) return { transactions: parsedValue };

    if (parsedValue && typeof parsedValue === "object" && "transactions" in parsedValue) {
      const transactions = parseJsonInput(parsedValue.transactions);
      return {
        ...parsedValue,
        transactions,
      };
    }

    return parsedValue;
  },
  z.object({
    transactions: z.array(budgetTransactionSchema),
    monthlyBudget: z.coerce.number().optional(),
  }),
);

const budgetPlanSchema = z.object({
  month: z.string(),
  monthlyBudget: z.number(),
  recommendations: z.array(z.string()),
  categoryTargets: z.record(z.string(), z.number()).default({}),
});

export const calculateBudgetSummary = tool(
  async (input: z.infer<typeof budgetSummarySchema>) =>
    measureTool("calculate_budget_summary", async () => {
      const categories = new Map<string, number>();
      let income = 0;
      let spending = 0;

      for (const transaction of input.transactions) {
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
      const monthlyBudget = input.monthlyBudget ?? null;
      const budgetVariance = monthlyBudget === null ? null : monthlyBudget - spending;
      const budgetUsageRate = monthlyBudget === null ? null : spending / monthlyBudget;

      return toolJson({
        income,
        spending,
        net,
        savingsRate,
        monthlyBudget,
        budgetVariance,
        budgetUsageRate,
        transactionCount: input.transactions.length,
        categories: [...categories.entries()]
          .map(([category, amount]) => ({
            category,
            amount,
            spendingShare: spending > 0 ? amount / spending : 0,
          }))
          .sort((left, right) => right.amount - left.amount),
      });
    }),
  {
    name: "calculate_budget_summary",
    description:
      "Calculate deterministic income, spending, category totals, savings rate, and budget variance from transactions returned by list_transactions. Use the result to write your own savings suggestions.",
    schema: budgetSummarySchema,
  },
);

export const saveBudgetPlan = tool(
  async (input: z.infer<typeof budgetPlanSchema>, runtime: FinanceRuntime) =>
    measureTool("save_budget_plan", async () => {
      const { userId } = requireContext(runtime);
      await store.put(["users", userId, "budgets"], input.month, {
        ...input,
        savedAt: new Date().toISOString(),
      });
      return `Saved budget plan for ${input.month}.`;
    }),
  {
    name: "save_budget_plan",
    description: "Persist a monthly budget plan and savings recommendations for the current user.",
    schema: budgetPlanSchema,
  },
);

export const generateSpendingChartData = tool(
  async (input: z.infer<typeof budgetSummarySchema>) =>
    measureTool("generate_spending_chart_data", async () => {
      const categories = new Map<string, number>();
      for (const transaction of input.transactions) {
        if (transaction.direction === "outgoing") {
          const categoryName = transaction.categoryName ?? "Misc";
          categories.set(categoryName, (categories.get(categoryName) ?? 0) + transaction.amount);
        }
      }

      return toolJson(
        [...categories.entries()]
          .map(([category, amount]) => ({ category, amount }))
          .sort((left, right) => right.amount - left.amount),
      );
    }),
  {
    name: "generate_spending_chart_data",
    description: "Create chart-ready spending totals by category.",
    schema: budgetSummarySchema,
  },
);
