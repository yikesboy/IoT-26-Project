import { tool } from "langchain";
import { z } from "zod";
import { measureTool } from "../metrics";
import store from "../store";
import { emptyToolSchema, requireContext, toolJson, type FinanceRuntime } from "./shared";

const defaultCategories = [
  "Groceries",
  "Dining",
  "Transport",
  "Utilities",
  "Rent",
  "Shopping",
  "Healthcare",
  "Entertainment",
  "Income",
  "Misc",
];

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

export type Category = z.infer<typeof categorySchema>;

const createCategorySchema = z.object({
  name: z.string().min(1).describe("Human-readable category name."),
});

export async function getCategories(userId: string): Promise<Category[]> {
  const rows = await store.search(["users", userId, "categories"], { limit: 1000 });
  const categories = rows
    .map((row) => {
      const value = "value" in row ? row.value : undefined;
      const parsed = categorySchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    })
    .filter((category): category is Category => category !== null);

  if (categories.length > 0) return categories;

  const now = new Date().toISOString();
  const defaults = defaultCategories.map((name) => ({
    id: categoryIdFromName(name),
    name,
    createdAt: now,
  }));
  await Promise.all(
    defaults.map((category) => store.put(["users", userId, "categories"], category.id, category)),
  );
  return defaults;
}

export async function getOrCreateCategory(userId: string, name: string) {
  const categories = await getCategories(userId);
  const existing = categories.find(
    (category) => category.name.toLowerCase() === name.trim().toLowerCase(),
  );
  if (existing) return existing;

  const category = {
    id: categoryIdFromName(name) || crypto.randomUUID(),
    name: name.trim() || "Misc",
    createdAt: new Date().toISOString(),
  };
  await store.put(["users", userId, "categories"], category.id, category);
  return category;
}

export const listCategories = tool(
  async (_input: Record<string, never>, runtime: FinanceRuntime) =>
    measureTool("list_categories", async () => {
      const { userId } = requireContext(runtime);
      return toolJson(await getCategories(userId));
    }),
  {
    name: "list_categories",
    description:
      "List available transaction categories with id and name. Call this before saving transactions.",
    schema: emptyToolSchema,
  },
);

export const createCategory = tool(
  async (input: z.infer<typeof createCategorySchema>, runtime: FinanceRuntime) =>
    measureTool("create_category", async () => {
      const { userId } = requireContext(runtime);
      return toolJson(await getOrCreateCategory(userId, input.name));
    }),
  {
    name: "create_category",
    description:
      "Create a new transaction category when no existing category from list_categories fits.",
    schema: createCategorySchema,
  },
);

function categoryIdFromName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
