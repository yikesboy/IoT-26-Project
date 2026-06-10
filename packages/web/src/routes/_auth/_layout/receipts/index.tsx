import { listReceiptsFn } from "@/fns/receipts/api.function";
import { createFileRoute, useLoaderData } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/_layout/receipts/")({
  component: RouteComponent,
  loader: async () => {
    return {
      receipts: await listReceiptsFn({ data: {} }),
    };
  },
});

function RouteComponent() {
  const { receipts } = useLoaderData({ from: Route.id });

  return <p>{`${receipts.join(" ")}`}</p>;
}
