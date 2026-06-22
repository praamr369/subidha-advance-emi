import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { EntityDrawer } from "@/shared/drawers/EntityDrawer";
import { FormFieldError } from "@/shared/forms/FormFieldError";
import { ServerErrorAlert } from "@/shared/forms/ServerErrorAlert";
import { ApiError } from "@/shared/api/api-error";
import { useCreateCustomer } from "../api/customer.mutations";
import { useUpdateCustomer } from "../api/customer.mutations";
import type { CustomerAdmin } from "../api/customer.types";

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(7, "Phone is required"),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  username: z.string().optional(),
  password: z.string().min(8, "Min 8 characters").or(z.literal("")).optional(),
});

const editSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(7, "Phone is required"),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
});

type CreateFormValues = z.infer<typeof createSchema>;
type EditFormValues = z.infer<typeof editSchema>;

type Props = {
  open: boolean;
  customer: CustomerAdmin | null;
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

export function CustomerFormDrawer({
  open,
  customer,
  onClose,
  onSuccess,
}: Props) {
  const isEdit = !!customer;
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const mutation = isEdit ? update : create;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateFormValues | EditFormValues>({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: isEdit
      ? {
          name: customer.name,
          phone: customer.phone,
          email: customer.email || "",
          address: customer.address || "",
          city: customer.city || "",
        }
      : { name: "", phone: "", email: "", address: "", city: "" },
  });

  useEffect(() => {
    if (open) {
      reset(
        isEdit
          ? {
              name: customer.name,
              phone: customer.phone,
              email: customer.email || "",
              address: customer.address || "",
              city: customer.city || "",
            }
          : { name: "", phone: "", email: "", address: "", city: "" },
      );
      mutation.reset();
    }
  }, [open, customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(values: CreateFormValues | EditFormValues) {
    if (isEdit) {
      update.mutate(
        { id: customer.id, ...values },
        { onSuccess: () => { onSuccess(); onClose(); } },
      );
    } else {
      create.mutate(values as CreateFormValues, {
        onSuccess: () => { onSuccess(); onClose(); },
      });
    }
  }

  const serverError =
    mutation.error instanceof ApiError
      ? (mutation.error.body as Record<string, unknown> | undefined)?.detail as
          string | undefined ?? "Request failed"
      : mutation.error
        ? "An unexpected error occurred"
        : null;

  return (
    <EntityDrawer
      open={open}
      title={isEdit ? `Edit ${customer.name}` : "New Customer"}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <ServerErrorAlert error={serverError} />

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            Name *
          </label>
          <input {...register("name")} className={fieldClass(!!errors.name)} />
          <FormFieldError message={errors.name?.message} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            Phone *
          </label>
          <input {...register("phone")} className={fieldClass(!!errors.phone)} />
          <FormFieldError message={errors.phone?.message} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            Email
          </label>
          <input
            type="email"
            {...register("email")}
            className={fieldClass(!!errors.email)}
          />
          <FormFieldError message={errors.email?.message} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            Address
          </label>
          <input {...register("address")} className={fieldClass(false)} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            City
          </label>
          <input {...register("city")} className={fieldClass(false)} />
        </div>

        {!isEdit && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">
                Username
              </label>
              <input
                {...register("username" as keyof CreateFormValues)}
                className={fieldClass(false)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">
                Password
              </label>
              <input
                type="password"
                {...register("password" as keyof CreateFormValues)}
                className={fieldClass(
                  !!(errors as Record<string, { message?: string }>).password,
                )}
              />
              <FormFieldError
                message={
                  (errors as Record<string, { message?: string }>).password
                    ?.message
                }
              />
            </div>
          </>
        )}

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
                : "Create Customer"}
          </button>
        </div>
      </form>
    </EntityDrawer>
  );
}
