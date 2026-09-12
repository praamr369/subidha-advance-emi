"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/api";
import { formatRupee } from "@/lib/utils/currency";

// Mirrors backend GET /accounting/finance-accounts/{id}/position/.
type FinanceAccountPosition = {
  account_id: number;
  name: string;
  kind: string;
  opening_balance: string;
  inflow: string;
  outflow: string;
  closing_balance: string;
  last_movement_date: string | null;
};

function shortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Lazy "account positions" toggle for contra vouchers (money movements between
 * the business's own finance accounts). There is no customer or vendor on a
 * contra entry, so the counterpart of the customer/vendor position is the
 * balance of each account involved — shown side by side, fetched only when
 * opened.
 */
export default function FinanceAccountPositionToggle({
  accountIds,
  label = "account positions",
}: {
  accountIds: Array<number | null | undefined>;
  label?: string;
}) {
  const ids = accountIds.filter((id): id is number => typeof id === "number" && id > 0);
  const [open, setOpen] = useState(false);
  const [positions, setPositions] = useState<FinanceAccountPosition[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  if (ids.length === 0) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || positions || state === "loading") return;
    setState("loading");
    Promise.all(
      ids.map((id) =>
        apiFetch<FinanceAccountPosition>(`/accounting/finance-accounts/${id}/position/`, { cache: "no-store" })
      )
    )
      .then((rows) => {
        setPositions(rows);
        setState("idle");
      })
      .catch(() => {
        setPositions(null);
        setState("error");
      });
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
      >
        {open ? `Hide ${label}` : `Show ${label}`}
      </button>
      {open ? (
        <div className="mt-2">
          {state === "loading" ? (
            <p className="text-sm text-muted-foreground">Loading account positions…</p>
          ) : state === "error" || !positions ? (
            <p className="text-sm text-muted-foreground">Account positions are unavailable right now.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {positions.map((position, index) => (
                <div key={position.account_id} className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="text-xs font-semibold text-foreground">
                    {ids.length === 2 ? (index === 0 ? "From · " : "To · ") : null}
                    {position.name}
                    <span className="ml-1 font-normal text-muted-foreground">({position.kind})</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Opening (month start)</div>
                      <div className="font-semibold tabular-nums">{formatRupee(position.opening_balance)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Balance now</div>
                      <div
                        className={`font-semibold tabular-nums ${Number(position.closing_balance) < 0 ? "text-red-600" : "text-foreground"}`}
                      >
                        {formatRupee(position.closing_balance)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">In this month</div>
                      <div className="font-semibold tabular-nums text-emerald-600">{formatRupee(position.inflow)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Out this month</div>
                      <div className="font-semibold tabular-nums">{formatRupee(position.outflow)}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Last movement {shortDate(position.last_movement_date)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
