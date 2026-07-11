"use client";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";

const BACKUP_SCHEDULE = [
  { type: "Full Database Backup", frequency: "Daily at 2:00 AM IST", retention: "30 days", storage: "Encrypted VPS + off-site" },
  { type: "Transaction Logs", frequency: "Every 15 minutes", retention: "7 days", storage: "Encrypted VPS" },
  { type: "Media Files (Documents, KYC)", frequency: "Daily at 3:00 AM IST", retention: "90 days", storage: "Encrypted VPS" },
  { type: "Application Config", frequency: "On every deployment", retention: "Indefinite", storage: "Git repository (secrets excluded)" },
];

const RESTORE_SLA = [
  { scenario: "Single record recovery", rto: "< 1 hour", rpo: "< 15 minutes" },
  { scenario: "Table-level restore", rto: "< 4 hours", rpo: "< 1 hour" },
  { scenario: "Full database restore", rto: "< 8 hours", rpo: "< 24 hours" },
  { scenario: "Disaster recovery", rto: "< 24 hours", rpo: "< 24 hours" },
];

export default function BackupRestorePage() {
  return (
    <ERPPageShell
      title="Backup & Restore Policy"
      subtitle="Data backup schedules, retention periods, and recovery procedures"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Settings", href: "/admin/settings" },
        { label: "Backup & Restore" },
      ]}
    >
      <div className="space-y-6">
        <WorkspaceSection title="Backup Schedule">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500 text-left">
                  <th className="pb-3 pr-4">Backup Type</th>
                  <th className="pb-3 pr-4">Frequency</th>
                  <th className="pb-3 pr-4">Retention</th>
                  <th className="pb-3">Storage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {BACKUP_SCHEDULE.map((b) => (
                  <tr key={b.type}>
                    <td className="py-3 pr-4 font-medium">{b.type}</td>
                    <td className="py-3 pr-4">{b.frequency}</td>
                    <td className="py-3 pr-4">{b.retention}</td>
                    <td className="py-3 text-gray-500 text-xs">{b.storage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Recovery Objectives (RTO / RPO)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500 text-left">
                  <th className="pb-3 pr-4">Recovery Scenario</th>
                  <th className="pb-3 pr-4">RTO (Recovery Time)</th>
                  <th className="pb-3">RPO (Data Loss Tolerance)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {RESTORE_SLA.map((r) => (
                  <tr key={r.scenario}>
                    <td className="py-3 pr-4 font-medium">{r.scenario}</td>
                    <td className="py-3 pr-4 text-green-700">{r.rto}</td>
                    <td className="py-3 text-blue-700">{r.rpo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Recovery Procedure">
          <ol className="text-sm space-y-2 list-decimal list-inside text-blue-800 dark:text-blue-200">
            <li>Identify incident scope (which tables/data affected)</li>
            <li>Stop write operations if data integrity is at risk</li>
            <li>Notify DPO if personal data is involved (DPDP 2023)</li>
            <li>Contact system admin: restore from most recent clean backup</li>
            <li>Validate restored data integrity against audit logs</li>
            <li>Resume operations and document incident</li>
          </ol>
          <div className="mt-4 p-3 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Emergency Contact</p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              For production data recovery: contact the system administrator. Recovery credentials and backup locations are documented in the internal operations runbook (not stored in this UI).
            </p>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Security Standards">
          <ul className="space-y-2 text-sm">
            {[
              "All backups are AES-256 encrypted at rest",
              "Backup keys are stored separately from data (never co-located)",
              "Access to backups requires two-factor authentication",
              "Backup integrity is verified weekly via checksum",
              "Off-site copy maintained per IT Act 2000 Section 43A",
              "7-year retention for financial records (ITA 1961)",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
