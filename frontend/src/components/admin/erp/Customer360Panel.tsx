"use client";

import { LinkedRecordCard } from "@/components/admin/erp/LinkedRecordCard";
import type { CrmWorkspacePayload } from "@/services/admin-erp";

export function Customer360Panel({ customers }: { customers: CrmWorkspacePayload["customer_360"] }) {
  return (
    <section className="rounded-2xl border border-white/80 bg-white/80 p-5">
      <h2 className="text-base font-semibold text-foreground">Party 360</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Canonical customer profile with linked contracts, payments, delivery, support, and KYC status.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {customers.map((item) => (
          <LinkedRecordCard
            key={item.customer_id}
            title={item.name}
            subtitle={`${item.phone} · Subs ${item.subscription_count} · Pay ${item.payment_count} · KYC ${item.kyc_status}`}
            status={`Risk ${item.risk_status}`}
            href={item.deep_link}
          />
        ))}
      </div>
    </section>
  );
}
