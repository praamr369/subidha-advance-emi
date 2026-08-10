"use client";
import { Controller, useFormContext } from "react-hook-form";
import { ProductCreationFormData } from "@/lib/schemas/product-creation";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { AlertCircle } from "lucide-react";

export default function FulfillmentTab() {
  const { control, formState: { errors }, watch } = useFormContext<ProductCreationFormData>();
  const itemType = watch("item_type");

  const isEmiEligible = itemType === "FINISHED_GOOD";
  const isSaleItem = itemType === "FINISHED_GOOD" || itemType === "ADD_ON" || itemType === "ACCESSORY";

  return (
    <div className="space-y-6">
      <ERPSectionShell
        title="EMI (Equated Monthly Installment)"
        description="Enable customers to purchase using installment payment plans."
      >
        {!isEmiEligible && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3 flex gap-2 text-sm text-amber-900">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>EMI is only available for Finished Goods</p>
          </div>
        )}
        <div className="space-y-3">
          <Controller
            name="is_emi_enabled"
            control={control}
            render={({ field }) => (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={field.value} onChange={field.onChange} name={field.name} onBlur={field.onBlur} ref={field.ref}
                  disabled={!isEmiEligible}
                  className="h-4 w-4 rounded border-border disabled:opacity-50"
                />
                <span className={`text-sm ${!isEmiEligible ? "text-muted-foreground" : ""}`}>
                  Allow EMI payments
                </span>
              </label>
            )}
          />
          <p className="text-xs text-muted-foreground ml-6">
            Customers can split the price into monthly installments
          </p>
        </div>
      </ERPSectionShell>

      <ERPSectionShell
        title="Rent"
        description="Enable customers to rent this product for short-term use."
      >
        {!isEmiEligible && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3 flex gap-2 text-sm text-amber-900">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>Rent is only available for Finished Goods</p>
          </div>
        )}
        <div className="space-y-3">
          <Controller
            name="is_rent_enabled"
            control={control}
            render={({ field }) => (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={field.value} onChange={field.onChange} name={field.name} onBlur={field.onBlur} ref={field.ref}
                  disabled={!isEmiEligible}
                  className="h-4 w-4 rounded border-border disabled:opacity-50"
                />
                <span className={`text-sm ${!isEmiEligible ? "text-muted-foreground" : ""}`}>
                  Allow rent (short-term lease)
                </span>
              </label>
            )}
          />
          <p className="text-xs text-muted-foreground ml-6">
            Customers can rent this product for specific durations
          </p>
        </div>
      </ERPSectionShell>

      <ERPSectionShell
        title="Lease"
        description="Enable customers to lease this product for long-term use."
      >
        {!isEmiEligible && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3 flex gap-2 text-sm text-amber-900">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>Lease is only available for Finished Goods</p>
          </div>
        )}
        <div className="space-y-3">
          <Controller
            name="is_lease_enabled"
            control={control}
            render={({ field }) => (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={field.value} onChange={field.onChange} name={field.name} onBlur={field.onBlur} ref={field.ref}
                  disabled={!isEmiEligible}
                  className="h-4 w-4 rounded border-border disabled:opacity-50"
                />
                <span className={`text-sm ${!isEmiEligible ? "text-muted-foreground" : ""}`}>
                  Allow lease (long-term lease)
                </span>
              </label>
            )}
          />
          <p className="text-xs text-muted-foreground ml-6">
            Customers can lease this product for extended periods
          </p>
        </div>
      </ERPSectionShell>

      <ERPSectionShell
        title="Direct Sale"
        description="Enable customers to purchase this product outright."
      >
        {!isSaleItem && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3 flex gap-2 text-sm text-amber-900">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>Direct sale is not available for {itemType}</p>
          </div>
        )}
        <div className="space-y-3">
          <Controller
            name="is_direct_sale_enabled"
            control={control}
            render={({ field }) => (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={field.value} onChange={field.onChange} name={field.name} onBlur={field.onBlur} ref={field.ref}
                  disabled={!isSaleItem}
                  className="h-4 w-4 rounded border-border disabled:opacity-50"
                />
                <span className={`text-sm ${!isSaleItem ? "text-muted-foreground" : ""}`}>
                  Allow outright purchase
                </span>
              </label>
            )}
          />
          <p className="text-xs text-muted-foreground ml-6">
            Customers can buy this product at the listed price
          </p>
        </div>
      </ERPSectionShell>

      <ERPSectionShell
        title="Fulfillment Summary"
        description="Quick overview of enabled fulfillment modes."
      >
        <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2 text-sm">
          <p className="text-muted-foreground">
            Product Type: <span className="font-semibold text-foreground">{itemType}</span>
          </p>
          <p className="text-muted-foreground">
            Available Options:
            <span className="font-semibold text-foreground ml-1">
              {isEmiEligible || isSaleItem ? (
                [
                  isEmiEligible && "EMI",
                  isEmiEligible && "Rent",
                  isEmiEligible && "Lease",
                  isSaleItem && "Direct Sale",
                ].filter(Boolean).join(" • ") || "None"
              ) : (
                "None available for this product type"
              )}
            </span>
          </p>
        </div>
      </ERPSectionShell>
    </div>
  );
}
