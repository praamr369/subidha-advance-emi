import { EntityDrawer } from "@/shared/drawers/EntityDrawer";
import { formatMoney } from "@/shared/money/format";
import { DateCell } from "@/shared/ui/DateCell";
import { LifecycleBadge, ActiveBadge, InventoryBadge } from "./ProductStatusBadge";
import type { ProductAdmin } from "../api/product.types";

type Props = {
  product: ProductAdmin | null;
  onClose: () => void;
  onEdit: (product: ProductAdmin) => void;
  onDeactivate: (product: ProductAdmin) => void;
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

function PlanFlags({ product }: { product: ProductAdmin }) {
  const flags = [
    { label: "EMI", enabled: product.is_emi_enabled },
    { label: "Rent", enabled: product.is_rent_enabled },
    { label: "Lease", enabled: product.is_lease_enabled },
    { label: "Direct Sale", enabled: product.is_direct_sale_enabled },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {flags.map((f) => (
        <span
          key={f.label}
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            f.enabled
              ? "bg-emerald-50 text-emerald-700"
              : "bg-stone-100 text-stone-400 line-through"
          }`}
        >
          {f.label}
        </span>
      ))}
    </div>
  );
}

export function ProductDetailDrawer({
  product,
  onClose,
  onEdit,
  onDeactivate,
}: Props) {
  if (!product) return null;

  return (
    <EntityDrawer
      open={!!product}
      title={product.name}
      onClose={onClose}
      width="w-[520px]"
    >
      <div className="space-y-5">
        {product.image && (
          <img
            src={product.image}
            alt={product.name}
            className="h-40 w-full rounded-lg object-contain bg-stone-50"
          />
        )}

        <div className="flex gap-2">
          <button
            onClick={() => onEdit(product)}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Edit
          </button>
          {product.is_active && (
            <button
              onClick={() => onDeactivate(product)}
              className="rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
            >
              Deactivate
            </button>
          )}
        </div>

        <Section title="Identity">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Product Code">{product.product_code}</Field>
            <Field label="SKU">{product.sku}</Field>
            <Field label="Category">
              {product.category_master_name || product.category}
            </Field>
            <Field label="Subcategory">
              {product.subcategory_master_name || product.subcategory}
            </Field>
            <Field label="Unit">{product.unit_of_measure}</Field>
            <Field label="Created">
              <DateCell date={product.created_at} format="long" />
            </Field>
          </dl>
          {product.description && (
            <p className="mt-3 text-sm text-stone-600">{product.description}</p>
          )}
        </Section>

        <Section title="Pricing & Plans">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Base Price">{formatMoney(product.base_price)}</Field>
            <Field label="Default Plan">{product.plan_type_default}</Field>
          </dl>
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-stone-400">
              Enabled Plans
            </p>
            <PlanFlags product={product} />
          </div>
        </Section>

        <Section title="Status">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Active">
              <ActiveBadge isActive={product.is_active} />
            </Field>
            <Field label="Lifecycle">
              <LifecycleBadge status={product.lifecycle_status} />
            </Field>
          </dl>
        </Section>

        <Section title="Inventory">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Inventory Profile">
              <InventoryBadge ready={product.inventory_ready} />
            </Field>
            {product.inventory_profile_id && (
              <>
                <Field label="Stock Tracking">
                  {product.inventory_stock_tracking_enabled ? "Enabled" : "Disabled"}
                </Field>
                <Field label="Delivery Bridge">
                  {product.inventory_delivery_stock_bridge_enabled
                    ? "Enabled"
                    : "Disabled"}
                </Field>
              </>
            )}
          </dl>
        </Section>
      </div>
    </EntityDrawer>
  );
}
