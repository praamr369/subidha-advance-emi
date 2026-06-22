type Props = {
  date: string | Date;
  format?: "short" | "long" | "relative";
};

export function DateCell({ date, format = "short" }: Props) {
  const d = typeof date === "string" ? new Date(date) : date;

  if (format === "relative") {
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return <span>Today</span>;
    if (days === 1) return <span>Yesterday</span>;
    if (days < 30) return <span>{days}d ago</span>;
  }

  const formatted = d.toLocaleDateString("en-US", {
    year: "numeric",
    month: format === "long" ? "long" : "short",
    day: "numeric",
  });

  return <span className="whitespace-nowrap">{formatted}</span>;
}
