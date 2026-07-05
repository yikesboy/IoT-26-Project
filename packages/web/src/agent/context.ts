import { z } from "zod";

export const contextSchema = z.object({
  userId: z.string(),
  threadId: z.string(),
});
