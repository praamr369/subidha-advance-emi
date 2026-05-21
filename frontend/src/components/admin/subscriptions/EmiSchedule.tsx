type EmiScheduleItem = {
  installmentNumber: number;
  dueDate: string;
  amount: number;
  status: string;
};

type EmiScheduleProps = {
  schedule: EmiScheduleItem[];
};

export default function EmiSchedule({ schedule }: EmiScheduleProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 text-card-foreground">
      <h3 className="mb-3 text-base font-semibold">EMI Schedule</h3>
      <ul className="space-y-2">
        {schedule.map((installment) => (
          <li
            key={installment.installmentNumber}
            className="rounded-lg border border-border bg-[var(--surface-muted)] p-3"
          >
            <p>Installment #{installment.installmentNumber}</p>
            <p>Due Date: {installment.dueDate}</p>
            <p>Amount: ₹ {installment.amount}</p>
            <p>Status: {installment.status}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
