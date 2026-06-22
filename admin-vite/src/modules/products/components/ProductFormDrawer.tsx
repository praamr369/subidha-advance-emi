import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { EntityDrawer } from "@/shared/drawers/EntityDrawer";
import { FormFieldError } from "@/shared/forms/FormFieldError";
import { ServerErrorAlert } from "@/shared/forms/ServerErrorAlert";
import { ApiError } from "@/shared/api/api-error";
import { useCatalogOptions } from "../api/product.queries";
import { useCreateProduct, useUpdateProduct } from "../api/product.mutations";
import type { ProductAdmin, LifecycleStatus, PlanType } from "../api/product.types";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  product_code: z.string().min(1, "Product code is required"),
  base_price: z.string().min(1, "Price is required"),
  category_master: z.coerce.number().optional(),
  subcategory_master: z.coerce.number().optional(),
  sku: z.string().optional(),
  unit_of_measure: z.string().optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
  plan_type_default: z.string().optional(),
  lifecycle_status: z.string().optional(),
  is_emi_enabled: z.boolean().optional(),
  is_rent_enabled: z.boolean().optional(),
  is_lease_enabled: z.boolean().optional(),
  is_direct_sale_enabled: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  product: ProductAdmin | null;
  onClose: () => void;
  onSuccess: () => void;
};

function fieldClass(hasError: boolean) {
  return `w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors focus:ring-1 ${
    hasError
      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
      : "border-stone-300 focus:border-brand-500 focus:ring-brand-500"
  }`;
}

function extractServerErrors(error: Error | null) {
  if (!error || !(error instanceof ApiError)) {
    return {
      general: error ? "An unexpected error occurred" : null,
      fields: {} as Record<string, string[]>,
    };
  }
  const fields = error.fieldErrors;
  const body = error.body as Record<string, unknown> | undefined;
  const detail = typeof body?.detail === "string" ? body.detail : null;
  const hasFieldErrors = Object.keys(fields).length > 0;
  const general = detail ?? (!hasFieldErrors ? "Request failed" : null);
  return { general, fields };
}

export function ProductFormDrawer({ open, product, onClose, onSuccess }: Props) {
  const isEdit = !!product;
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const mutation = isEdit ? update : create;
  const { data: options } = useCatalogOptions();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(product),
  });

  useEffect(() => {
    if (open) {
      reset(defaults(product));
      mutation.reset();
    }
  }, [open, product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCategory = watch("category_master");

  function onSubmit(values: FormValues) {
    const payload = {
      ...values,
      category_master: values.category_master || null,
      subcategory_master: values.subcategory_master || null,
      plan_type_default: (values.plan_type_default || "EMI") as PlanType,
      lifecycle_status: (values.lifecycle_status || "ACTIVE") as LifecycleStatus,
    };

    if (isEdit) {
      update.mutate(
        { id: product.id, ...payload },
        { onSuccess: () => { onSuccess(); onClose(); } },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => { onSuccess(); onClose(); },
      });
    }
  }

  const { general: serverError, fields: serverFieldErrors } =
    extractServerErrors(mutation.error);

  function fieldError(name: string): string | undefined {
    return (
      (errors as Record<string, { message?: string }>)[name]?.message ??
      serverFieldErrors[name]?.join(". ")
    );
  }

  function hasFieldError(name: string): boolean {
    return !!(errors as Record<string, unknown>)[name] || !!serverFieldErrors[name];
  }

  const filteredSubcategories = options?.subcategories.filter(
    (s) => !selectedCategory || s.category_id === Number(selectedCategory),
  );

  return (
    <EntityDrawer
      open={open}
      title={isEdit ? `Edit ${product.name}` : "New Product"}
      onClose={onClose}
      width="w-[520px]"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <ServerErrorAlert error={serverError} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Name *
            </label>
            <input {...register("name")} className={fieldClass(hasFieldError("name"))} />
            <FormFieldError message={fieldError("name")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Product Code *
            </label>
            <input
              {...register("product_code")}
              className={fieldClass(hasFieldError("product_code"))}
            />
            <FormFieldError message={fieldError("product_code")} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Base Price *
            </label>
            <input
              {...register("base_price")}
              className={fieldClass(hasFieldError("base_price"))}
            />
            <FormFieldError message={fieldError("base_price")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              SKU
            </label>
            <input {...register("sku")} className={fieldClass(hasFieldError("sku"))} />
            <FormFieldError message={fieldError("sku")} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Category
            </label>
            <select
              {...register("category_master")}
              className={fieldClass(false)}
            >
              <option value="">None</option>
              {options?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Subcategory
            </label>
            <select
              {...register("subcategory_master")}
              className={fieldClass(false)}
            >
              <option value="">None</option>
              {filteredSubcategories?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Unit of Measure
            </label>
            <select {...register("unit_of_measure")} className={fieldClass(false)}>
              {options?.unit_of_measure_options.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Default Plan
            </label>
            <select {...register("plan_type_default")} className={fieldClass(false)}>
              <option value="EMI">EMI</option>
              <option value="RENT">Rent</option>
              <option value="LEASE">Lease</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            Lifecycle Status
          </label>
          <select {...register("lifecycle_status")} className={fieldClass(false)}>
            <option value="ACTIVE">Active</option>
            <option value="UPCOMING">Upcoming</option>
            <option value="DISCONTINUED">Discontinued</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            Description
          </label>
          <textarea
            {...register("description")}
            rows={3}
            className={fieldClass(false)}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-stone-700">Enabled Plans</p>
          <div className="flex flex-wrap gap-4">
            {(
              [
                ["is_emi_enabled", "EMI"],
                ["is_rent_enabled", "Rent"],
                ["is_lease_enabled", "Lease"],
                ["is_direct_sale_enabled", "Direct Sale"],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  {...register(field)}
                  className="accent-brand-700"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            {...register("is_active")}
            className="accent-brand-700"
          />
          Active
        </label>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {mutation.isPending
              ? "Saving..."
              : isEdit
                ? "Save Changes"
                : "Create Product"}
          </button>
        </div>
      </form>
    </EntityDrawer>
  );
}

function defaults(product: ProductAdmin | null): FormValues {
  if (!product) {
    return {
      name: "",
      product_code: "",
      base_price: "",
      sku: "",
      description: "",
      unit_of_measure: "PCS",
      plan_type_default: "EMI",
      lifecycle_status: "ACTIVE",
      is_active: true,
      is_emi_enabled: true,
      is_rent_enabled: false,
      is_lease_enabled: false,
      is_direct_sale_enabled: true,
    };
  }
  return {
    name: product.name,
    product_code: product.product_code,
    base_price: product.base_price,
    category_master: product.category_master ?? undefined,
    subcategory_master: product.subcategory_master ?? undefined,
    sku: product.sku ?? "",
    unit_of_measure: product.unit_of_measure || "PCS",
    description: product.description || "",
    plan_type_default: product.plan_type_default,
    lifecycle_status: product.lifecycle_status,
    is_active: product.is_active,
    is_emi_enabled: product.is_emi_enabled,
    is_rent_enabled: product.is_rent_enabled,
    is_lease_enabled: product.is_lease_enabled,
    is_direct_sale_enabled: product.is_direct_sale_enabled,
  };
}
