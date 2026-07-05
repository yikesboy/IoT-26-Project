export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatSignedCurrency(amount: number, direction: "incoming" | "outgoing") {
  return `${direction === "outgoing" ? "-" : "+"}${formatCurrency(amount)}`;
}

export function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}
