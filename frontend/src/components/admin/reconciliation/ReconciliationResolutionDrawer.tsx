"use client";

import { useMemo, useState } from "react";

import ActionButton from "@/components/ui/ActionButton";
import DrawerShell from "@/components/ui/DrawerShell";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  onSubmit: (payload: { action?: string; note: string }) => Promise<void> | void;
  mode: "resolve" | "reopen";
};

const resolveActions = [
  { value: "MARK_REVIEWED", label: "Mark reviewed" },
  { value: "MARK_FALSE_POSITIVE", label: "Mark false positive" },
  { value: "REQUEST_CORRECTION", label: "Request correction" },
  { value: "LINK_EXISTING_RECORD", label: "Link existing record" },
  { value: "ESCALATE", label: "Escalate" },
  { value: "CLOSE", label: "Close" },
];

export default function ReconciliationResolutionDrawer({ open, onClose, title, onSubmit, mode }: Props) {
  const [note, setNote] = useState("");
  const [action, setAction] = useState(resolveActions[0]?.value || "MARK_REVIEWED");
  const [saving, setSaving] = useState(false);

  const isValid = useMemo(() => note.trim().length > 0, [note]);

  return (
    <DrawerShell
      open={open}
      title={title}
      description={mode === "resolve" ? "Resolution changes only the reconciliation item status and adds an audit note. It does not change source records." : "Reopen returns the item to NEEDS_REVIEW and records an audit note."}
      onClose={() => {
        if (saving) return;
        onClose();
      }}
      disableClose={saving}
      footer={
        <div className="flex items-center justify-end gap-2">
          <ActionButton
            variant="ghost"
            onClick={() => {
              if (saving) return;
              onClose();
            }}
          >
            Cancel
          </ActionButton>
          <ActionButton
            variant="primary"
            disabled={!isValid || saving}
            loading={saving}
            onClick={async () => {
              if (!isValid || saving) return;
              setSaving(true);
              try {
                await onSubmit({ action: mode === "resolve" ? action : undefined, note: note.trim() });
                setNote("");
                onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            {mode === "resolve" ? "Resolve" : "Reopen"}
          </ActionButton>
        </div>
      }
    >
      <div className="space-y-4">
        {mode === "resolve" ? (
          <label className="block">
            <div className="text-xs font-semibold text-muted-foreground">Action</div>
            <select
              className={cn(
                "mt-2 h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]/40"
              )}
              value={action}
              onChange={(e) => setAction(e.target.value)}
              disabled={saving}
            >
              {resolveActions.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block">
          <div className="text-xs font-semibold text-muted-foreground">Note (required)</div>
          <textarea
            className={cn(
              "mt-2 min-h-28 w-full resize-y rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]/40"
            )}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
            placeholder="Explain what you reviewed and what action is needed next."
          />
        </label>
      </div>
    </DrawerShell>
  );
}

