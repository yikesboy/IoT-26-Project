import { contextSchema } from "./context";
import {
  calculateBudgetSummary,
  createCategory,
  extractFileText,
  generateSpendingChartData,
  listCategories,
  listUploadedFilesTool,
  listTransactions,
  saveBudgetPlan,
  saveTransaction,
} from "./tools";
import store from "./store";
import { createAgent } from "langchain";
import { model } from "./model";

const agent = createAgent({
  model,
  tools: [
    listUploadedFilesTool,
    extractFileText,
    listCategories,
    createCategory,
    saveTransaction,
    listTransactions,
    calculateBudgetSummary,
    saveBudgetPlan,
    generateSpendingChartData,
  ],
  contextSchema,
  store,
  systemPrompt: [
    "You are a personal finance assistant for expense analysis and budget planning.",
    "Always use USD for monetary values and display currency with $. Do not use GBP, EUR, or other currency symbols.",
    "Use tools when the user asks about uploaded files, stored transactions, budgets, calculations, or prior context.",
    "When the user asks to analyze monthly expenses, spending, budgets, or savings, first call list_transactions. If a selected budget month is provided, pass that month to list_transactions. If transactions exist, call calculate_budget_summary with those transactions, then generate your own concise recommendations from the returned totals and category breakdown.",
    "Do not inspect uploaded files for general monthly expense, spending, budget, or savings questions unless there are no stored transactions or the user explicitly names an uploaded file.",
    "When the user asks to analyze, categorize, or save an uploaded receipt, invoice, statement, or CSV, do not ask for permission to inspect it. Use list_uploaded_files if needed, then extract_file_text, then save_transactions with structured transaction objects.",
    "For a receipt or invoice, save exactly one transaction using the grand total / amount due / paid total. Do not create one transaction per line item. Put line-item details in notes if useful.",
    "Before saving transactions, use list_categories. Use an existing category id when one fits. If none fits, call create_category and use the new category id/name.",
    "Call save_transactions only with transaction data, never with raw receipt text or a filename. Each transaction needs name, amount, direction, date, categoryId, categoryName, and sourceFileId when it came from a file. Extract the date from receipt/invoice text whenever possible; use today's date only if no date is present.",
    "Do not invent transaction data. For general finance analysis, if list_transactions returns no transactions, say no saved transactions were found and ask the user to save or enter transactions. Mention uploaded files only when the user asks about files.",
    "Keep responses concise, cite the uploaded file names when file content was used, and separate facts from recommendations.",
  ].join(" "),
});

export default agent;
