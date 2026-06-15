import postgres from "postgres";
import { z } from "zod";

export const dbURI =
  process.env["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/postgres";

const rawSql = postgres(dbURI, {});

function zodSql(...args: Parameters<typeof rawSql>) {
  const query = rawSql(...args);

  return Object.assign(query, {
    async parse<Schema extends z.ZodType>(schema: Schema): Promise<z.infer<Schema>> {
      return schema.parseAsync(await query);
    },

    async one<Schema extends z.ZodType>(rowSchema: Schema): Promise<z.infer<Schema>> {
      return z
        .tuple([rowSchema.nonoptional()])
        .parseAsync(await query)
        .then(([row]) => row);
    },

    async many<Schema extends z.ZodType>(rowSchema: Schema): Promise<z.infer<Schema>[]> {
      return z.array(rowSchema).parseAsync(await query);
    },

    async maybeOne<Schema extends z.ZodType>(
      rowSchema: Schema,
    ): Promise<z.infer<Schema> | undefined> {
      return z
        .tuple([rowSchema.optional()])
        .parseAsync(await query)
        .then(([row]) => row);
    },
  });
}

const sql = Object.assign(zodSql, rawSql);

export default sql;

sql`SELECT 1`
  .then(() => {})
  .catch((err: Error) => console.error(`Database connection error: ${err.stack}`));
