import { useState } from "react";
import type { ZodTypeAny, z } from "zod";

/**
 * Minimal client-side validation for pages that build a payload by hand.
 *
 * Most forms here are plain `useState` fields posted with `apiFetch`, not
 * react-hook-form. Converting them all to a form library would be a large,
 * risky change for a small gain, so this gives them the part that actually
 * matters — an error attached to the field that caused it — without changing
 * how they are written.
 *
 * WHAT THIS IS NOT: a security boundary. The backend validates every one of
 * these payloads and remains the authority. This exists so a mistyped phone
 * number is caught beside the input instead of returning as a raw API error
 * with no field attached, several hundred milliseconds later.
 *
 * Keep each schema in step with the server's rule. A client rule looser than
 * the server's only moves the error later; one that is stricter silently
 * rejects data the business would have accepted, which is worse because
 * nobody sees a bug — just a customer who cannot complete a form.
 */
export function useFieldErrors<TSchema extends ZodTypeAny>(schema: TSchema) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /**
   * Returns parsed data on success, or null after recording the messages.
   * Null rather than throwing, so a caller reads as a plain early return.
   */
  function validate(input: unknown): z.infer<TSchema> | null {
    const result = schema.safeParse(input);
    if (result.success) {
      setFieldErrors({});
      return result.data;
    }
    setFieldErrors(
      Object.fromEntries(
        result.error.issues.map((issue) => [
          // Only the first path segment: these forms are flat, and a nested
          // key would never match an input's name anyway.
          String(issue.path[0] ?? "_"),
          issue.message,
        ])
      )
    );
    return null;
  }

  /**
   * Props that make an error reach assistive technology rather than being
   * conveyed by a red border alone — which is a WCAG 1.4.1 failure, and also
   * just invisible to anyone not looking directly at the field.
   */
  function fieldProps(name: string) {
    return {
      "aria-invalid": Boolean(fieldErrors[name]),
      "aria-describedby": fieldErrors[name] ? `${name}-error` : undefined,
    };
  }

  return { fieldErrors, setFieldErrors, validate, fieldProps };
}
