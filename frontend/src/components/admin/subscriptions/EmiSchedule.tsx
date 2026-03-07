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
    <section className="rounded border bg-white p-4">
      <h3 className="mb-3 text-lg font-semibold">EMI Schedule</h3>
      <ul className="space-y-2">
        {schedule.map((installment) => (
          <li key={installment.installmentNumber} className="rounded border p-2">
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
