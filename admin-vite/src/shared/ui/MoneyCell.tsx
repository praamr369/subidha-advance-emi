type Props = {
  amount: number;
  currency?: string;
};

export function MoneyCell({ amount, currency = "NPR" }: Props) {
  const formatted = new Intl.NumberFormat("en-NP", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);

  return <span className="tabular-nums">{formatted}</span>;
}
