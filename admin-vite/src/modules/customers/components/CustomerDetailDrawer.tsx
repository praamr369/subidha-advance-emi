import { EntityDrawer } from "@/shared/drawers/EntityDrawer";
import { formatMoney } from "@/shared/money/format";
import { DateCell } from "@/shared/ui/DateCell";
import { KycBadge, ActiveBadge } from "./CustomerStatusBadge";
import type { CustomerAdmin } from "../api/customer.types";

type Props = {
  customer: CustomerAdmin | null;
  onClose: () => void;
  onEdit: (customer: CustomerAdmin) => void;
  onKycAction: (customer: CustomerAdmin) => void;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-stone-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-stone-700">{children || "—"}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-stone-100 pb-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">
        {title}
      </h3>
      {children}
    </div>
  );
}

export function CustomerDetailDrawer({
  customer,
  onClose,
  onEdit,
  onKycAction,
}: Props) {
  if (!customer) return null;

  return (
    <EntityDrawer
      open={!!customer}
      title={customer.name}
      onClose={onClose}
      width="w-[520px]"
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          {customer.profile_photo_url ? (
            <img
              src={customer.profile_photo_url}
              alt=""
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700">
              {customer.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-lg font-semibold text-stone-800">
              {customer.name}
            </p>
            <p className="text-sm text-stone-500">{customer.phone}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onEdit(customer)}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Edit
          </button>
          <button
            onClick={() => onKycAction(customer)}
            className="rounded-md border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            KYC Decision
          </button>
        </div>

        <Section title="Identity">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Username">{customer.user_username}</Field>
            <Field label="Email">{customer.email}</Field>
            <Field label="Phone">{customer.phone}</Field>
            <Field label="Customer Code">{customer.customer_code}</Field>
            <Field label="Address">{customer.address}</Field>
            <Field label="City">{customer.city}</Field>
            <Field label="Source">{customer.customer_source}</Field>
            <Field label="GSTIN">{customer.gstin}</Field>
          </dl>
        </Section>

        <Section title="Status">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Account Status">
              <ActiveBadge status={customer.status} />
            </Field>
            <Field label="KYC Status">
              <KycBadge status={customer.kyc_status} />
            </Field>
            {customer.kyc_reviewed_by_username && (
              <Field label="Reviewed By">
                {customer.kyc_reviewed_by_username}
              </Field>
            )}
            {customer.kyc_reviewed_at && (
              <Field label="Reviewed At">
                <DateCell date={customer.kyc_reviewed_at} />
              </Field>
            )}
            {customer.kyc_rejection_reason && (
              <Field label="Rejection Reason">
                <span className="text-red-600">
                  {customer.kyc_rejection_reason}
                </span>
              </Field>
            )}
            <Field label="Created">
              <DateCell date={customer.created_at} format="long" />
            </Field>
          </dl>
        </Section>

        <Section title="Subscriptions">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Active">{customer.active_subscription_count}</Field>
            <Field label="Historical">
              {customer.historical_subscription_count}
            </Field>
            <Field label="Cancelled">
              {customer.cancelled_subscription_count}
            </Field>
            <Field label="Total Value">
              {formatMoney(customer.total_subscription_value)}
            </Field>
            <Field label="Active Contract">
              {formatMoney(customer.active_contract_value)}
            </Field>
            <Field label="Historical Contract">
              {formatMoney(customer.historical_contract_value)}
            </Field>
          </dl>
        </Section>

        <Section title="Outstanding">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="EMI Due">
              {formatMoney(customer.active_subscription_due)}
            </Field>
            <Field label="Direct Sale">
              {formatMoney(customer.active_direct_sale_outstanding)}
            </Field>
            <Field label="Invoice">
              {formatMoney(customer.active_invoice_outstanding)}
            </Field>
          </dl>
        </Section>
      </div>
    </EntityDrawer>
  );
}
