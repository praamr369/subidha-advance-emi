"use client";

import { useMemo, useState, type FormEvent } from "react";

import PortalPage from "@/components/ui/PortalPage";
import { createResource } from "@/services/admin";
import { normalizeApiError } from "@/services/api/errors";

type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "date";
  required?: boolean;
};

type Props = {
  title: string;
  subtitle: string;
  resourcePath: string;
  fields: Field[];
};

export default function EnterpriseCreatePage({
  title,
  subtitle,
  resourcePath,
  fields,
}: Props) {
  const initialValues = useMemo(
    () => Object.fromEntries(fields.map((field) => [field.name, ""])) as Record<string, string>,
    [fields]
  );

  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      if (!field.required) continue;
      if (!values[field.name]?.trim()) {
        nextErrors[field.name] = `${field.label} is required`;
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitMessage(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await createResource(resourcePath, values as Record<string, unknown>);
      setSubmitMessage("Record saved successfully.");
      setValues(initialValues);
      setErrors({});
    } catch (error) {
      setSubmitMessage(normalizeApiError(error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PortalPage title={title} subtitle={subtitle}>
      <section className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <form className="space-y-4" onSubmit={onSubmit}>
          {fields.map((field) => (
            <div key={field.name}>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor={field.name}>
                {field.label}
              </label>
              <input
                id={field.name}
                type={field.type || "text"}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
              />
              {errors[field.name] ? <p className="mt-1 text-xs text-red-600">{errors[field.name]}</p> : null}
            </div>
          ))}

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Save"}
          </button>

          {submitMessage ? <p className="text-sm text-emerald-600">{submitMessage}</p> : null}
        </form>
      </section>
    </PortalPage>
  );
}
