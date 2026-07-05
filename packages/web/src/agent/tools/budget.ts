import { tool } from "langchain";
import { z } from "zod";
import { currentLocalMonth } from "@/lib/date";
import { formatBudgetOverviewMarkdown, getMonthlyBudget, summarizeTransactions } from "../budget";
import { measureTool } from "../metrics";
import store from "../store";
import { parseJsonInput, requireContext, toolJson, type FinanceRuntime } from "./shared";
import { getStoredTransactions, transactionSchema } from "./transactions";

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

const budgetOverviewSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .default(currentLocalMonth)
      .describe("Month to summarize in YYYY-MM format. Use the selected budget month."),
  }),
);

export const calculateBudgetSummary = tool(
  async (input: z.infer<typeof budgetSummarySchema>) =>
    measureTool("calculate_budget_summary", async () => {
      return toolJson(summarizeTransactions(input.transactions, input.monthlyBudget ?? null));
    }),
  {
    name: "calculate_budget_summary",
    description:
      "Calculate deterministic income, spending, net cash flow, category totals, category spending shares, savings rate, transaction count, and budget usage from a transaction array. Use get_budget_overview for ordinary stored monthly budget or expense overview questions because it retrieves stored transactions and the saved budget itself. Include monthlyBudget when this tool is used directly.",
    schema: budgetSummarySchema,
  },
);

export const getBudgetOverview = tool(
  async (input: z.infer<typeof budgetOverviewSchema>, runtime: FinanceRuntime) =>
    measureTool("get_budget_overview", async () => {
      const { userId } = requireContext(runtime);
      const monthlyBudget = await getMonthlyBudget(userId, input.month);
      const transactions = await getStoredTransactions(userId, 1000, input.month);
      const summary = summarizeTransactions(transactions, monthlyBudget);

      return toolJson({
        month: input.month,
        ...summary,
        markdown: formatBudgetOverviewMarkdown(input.month, summary),
      });
    }),
  {
    name: "get_budget_overview",
    description:
      "Authoritative monthly budget and expense overview for the current authenticated user. This retrieves saved transactions for one YYYY-MM month, retrieves the saved monthly budget, calculates exact totals, remaining budget, budget usage, and category shares, and returns display-ready markdown. Use this for questions like budget overview, expenses this month, how is my budget doing, savings suggestions based on this month, or monthly spending. Use the returned numbers exactly; do not recalculate them.",
    schema: budgetOverviewSchema,
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
      const summary = summarizeTransactions(input.transactions, input.monthlyBudget ?? null);
      return toolJson(
        summary.categories.map(({ category, amount }) => ({
          category,
          amount,
        })),
      );
    }),
  {
    name: "generate_spending_chart_data",
    description:
      "Create chart-ready spending totals by category from transactions returned by list_transactions.",
    schema: budgetSummarySchema,
  },
);
