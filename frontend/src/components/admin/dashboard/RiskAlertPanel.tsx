type RiskAlert = {
  id: string;
  message: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
};

type RiskAlertPanelProps = {
  alerts: RiskAlert[];
};

export default function RiskAlertPanel({ alerts }: RiskAlertPanelProps) {
  return (
    <section className="rounded border bg-white p-4">
      <h3 className="mb-3 text-lg font-semibold">Risk Alerts</h3>
      <ul className="space-y-2">
        {alerts.map((alert) => (
          <li key={alert.id} className="rounded border p-2">
            <p>{alert.message}</p>
            <p>Severity: {alert.severity}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
