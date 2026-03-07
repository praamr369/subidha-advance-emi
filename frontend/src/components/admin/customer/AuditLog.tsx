type AuditLogItem = {
  id: string;
  actor: string;
  action: string;
  timestamp: string;
};

type AuditLogProps = {
  logs: AuditLogItem[];
};

export default function AuditLog({ logs }: AuditLogProps) {
  return (
    <section className="rounded border bg-white p-4">
      <h3 className="mb-3 text-lg font-semibold">Audit Log</h3>
      <ul className="space-y-2">
        {logs.map((log) => (
          <li key={log.id} className="rounded border p-2">
            <p>{log.actor}</p>
            <p>{log.action}</p>
            <p>{log.timestamp}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
