import { authMiddleware } from "@/lib/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import { ListReceiptsParams } from "./api";
import { listReceipts } from "./api.server";

export const listReceiptsFn = createServerFn({ method: "GET" })
  .inputValidator(ListReceiptsParams)
  .middleware([authMiddleware])
  .handler(async ({ context }) => listReceipts(context.session.user.id));
