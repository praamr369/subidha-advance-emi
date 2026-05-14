"use client";

import { useEffect, useState } from "react";

import PageHeader from "@/components/ui/PageHeader";
import {
  exportSetupSnapshot,
  getSetupReadiness,
  importSetupSnapshot,
  resetLocalSandbox,
  seedLocalSandbox,
} from "@/services/local-sandbox";
import type { SetupReadiness } from "@/types/local-sandbox";

const CONFIRM = "RESET LOCAL SANDBOX";
const SCOPE_KEYS = ["customers","partners","subscriptions","payments","direct_sales","purchases","inventory","rent_lease","deliveries","service_desk","commissions","payouts","crm","sandbox_only"];

export default function LocalSandboxPage() {
  const [readiness, setReadiness] = useState<SetupReadiness | null>(null);
  const [disabledMsg, setDisabledMsg] = useState<string | null>(null);
  const [snapshotText, setSnapshotText] = useState("");
  const [confirm, setConfirm] = useState("");
  const [admin, setAdmin] = useState("subidhafurniture");
  const [scopes, setScopes] = useState<string[]>(["sandbox_only"]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void getSetupReadiness()
      .then(setReadiness)
      .catch((e: Error) => setDisabledMsg(e.message));
  }, []);

  async function runExport() {
    const payload = await exportSetupSnapshot();
    setSnapshotText(JSON.stringify(payload, null, 2));
  }

  async function runImport(dryRun: boolean) {
    const payload = JSON.parse(snapshotText || "{}");
    const res = await importSetupSnapshot(payload, dryRun, !dryRun);
    setResult(res);
  }

  async function runSeed() {
    const res = await seedLocalSandbox(true);
    setResult(res);
  }

  async function runReset(dryRun: boolean) {
    if (confirm.trim() !== CONFIRM) {
      setDisabledMsg(`Type ${CONFIRM} exactly.`);
      return;
    }
    const res = await resetLocalSandbox({
      scopes: scopes.filter((s) => s !== "sandbox_only"),
      preserve_admin_username: admin,
      preserve_setup: true,
      confirm_phrase: CONFIRM,
      dry_run: dryRun,
      sandbox_only: scopes.includes("sandbox_only"),
    });
    setResult(res);
  }

  if (disabledMsg && !readiness) {
    return <div className="space-y-4"><PageHeader title="Local Sandbox" description="Local-only testing controls" /><div className="rounded-xl border p-4 text-sm">{disabledMsg}. Sandbox tools are disabled in production-like environments.</div></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Local Sandbox" description="Safe local setup snapshot + demo seed + selective reset." />
      {readiness ? <pre className="rounded-xl bg-muted p-3 text-xs">{JSON.stringify(readiness, null, 2)}</pre> : null}

      <section className="rounded-xl border p-4 space-y-2">
        <div className="font-semibold">Setup Snapshot</div>
        <div className="flex gap-2">
          <button className="rounded border px-3 py-1" onClick={() => void runExport()}>Export setup snapshot</button>
          <button className="rounded border px-3 py-1" onClick={() => void runImport(true)}>Import preview</button>
          <button className="rounded border px-3 py-1" onClick={() => void runImport(false)}>Import apply</button>
        </div>
        <textarea className="h-44 w-full rounded border p-2 text-xs" value={snapshotText} onChange={(e) => setSnapshotText(e.target.value)} />
      </section>

      <section className="rounded-xl border p-4 space-y-2">
        <div className="font-semibold">Seed Demo Data</div>
        <button className="rounded border px-3 py-1" onClick={() => void runSeed()}>Seed sandbox data</button>
      </section>

      <section className="rounded-xl border p-4 space-y-2">
        <div className="font-semibold">Selective Reset</div>
        <div className="grid grid-cols-2 gap-2">
          {SCOPE_KEYS.map((key) => (
            <label key={key} className="text-sm"><input type="checkbox" checked={scopes.includes(key)} onChange={(e) => setScopes((prev) => e.target.checked ? [...prev, key] : prev.filter((x) => x !== key))} /> {key}</label>
          ))}
        </div>
        <input className="rounded border px-2 py-1" value={admin} onChange={(e) => setAdmin(e.target.value)} placeholder="preserve admin" />
        <input className="rounded border px-2 py-1" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={CONFIRM} />
        <div className="flex gap-2">
          <button className="rounded border px-3 py-1" onClick={() => void runReset(true)}>Dry-run preview</button>
          <button className="rounded border px-3 py-1" onClick={() => void runReset(false)}>Execute reset</button>
        </div>
      </section>

      {result ? <pre className="rounded-xl bg-muted p-3 text-xs">{JSON.stringify(result, null, 2)}</pre> : null}
    </div>
  );
}
