"use client";

import { useEffect, useState } from "react";

import { PipelineBoard } from "@/components/admin/erp/PipelineBoard";
import Phase7Guidance from "@/components/admin/workflow/Phase7Guidance";
import { WorkspaceShell } from "@/components/admin/erp/WorkspaceShell";
import { ErpCardsOperationalWorkspace } from "@/components/workspace/ErpCardsOperationalWorkspace";
import { ROUTES } from "@/lib/routes";
import type { WorkspacePayload } from "@/services/admin-erp";

export function WorkspaceCardsPage({
  title,
  subtitle,
  loader,
  boardTitle,
  operationalWorkspace,
}: {
  title: string;
  subtitle: string;
  boardTitle: string;
  loader: () => Promise<WorkspacePayload>;
  operationalWorkspace?: {
    storageKey: string;
    persistLayout?: boolean;
  };
}) {
  const [payload, setPayload] = useState<WorkspacePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loader()
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load workspace.");
      });
    return () => {
      active = false;
    };
  }, [loader]);

  return (
    <WorkspaceShell title={title} subtitle={subtitle}>
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {title === "Sales Workspace" ? (
        <Phase7Guidance
          items={[
            {
              label: "Create Direct Sale",
              href: ROUTES.admin.billingDirectSaleCreate,
              note: "Start the retail sale and invoice draft in one controlled workflow.",
              warning: "Delivery and invoice posting stay separate from payment collection.",
            },
            {
              label: "Collect Payment",
              href: ROUTES.admin.financeCollect,
              note: "Use the finance collection route for customer payment posting.",
            },
          ]}
        />
      ) : null}
      {title === "Delivery Workspace" ? (
        <Phase7Guidance
          items={[
            {
              label: "Create Delivery",
              href: ROUTES.admin.deliveryCreate,
              note: "Open delivery from a real subscription or direct-sale source.",
              warning: "Cannot complete stock-sensitive delivery while stock is unavailable.",
            },
            {
              label: "Process Return",
              href: ROUTES.admin.deliveryReturns,
              note: "Route rent/lease returns into the return inspection queue.",
            },
          ]}
        />
      ) : null}
      {payload ? (
        operationalWorkspace ? (
          <ErpCardsOperationalWorkspace
            storageKey={operationalWorkspace.storageKey}
            persistLayout={operationalWorkspace.persistLayout ?? true}
            boardTitle={boardTitle}
            cards={payload.cards}
          />
        ) : (
          <PipelineBoard title={boardTitle} cards={payload.cards} />
        )
      ) : (
        <div className="rounded-xl border border-slate-200 bg-card px-4 py-3 text-sm text-muted-foreground">
          Loading workspace...
        </div>
      )}
    </WorkspaceShell>
  );
}
