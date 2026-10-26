import type { AmendmentType } from "@/services/amendments";

/**
 * Human-friendly field schema for amendment requests.
 *
 * Customers, partners, and admins fill labelled inputs instead of raw JSON.
 * `buildRequestedValues` turns the field values into the `requested_values`
 * object the backend expects. Keys here match the backend's whitelisted keys
 * (see contract_amendment_service.py Phase 3/4 configs).
 */
export type AmendmentField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "tel" | "number";
  placeholder?: string;
  help?: string;
  required?: boolean;
};

const NOTE_FIELD: AmendmentField = {
  key: "note",
  label: "What you want changed",
  type: "textarea",
  placeholder: "Describe the change you are requesting in plain words.",
  help: "An admin will review this request. Your contract does not change until it is approved.",
  required: true,
};

export const AMENDMENT_FIELD_SCHEMA: Partial<Record<AmendmentType, AmendmentField[]>> = {
  ADDRESS_CHANGE: [
    { key: "address", label: "New address", type: "textarea", placeholder: "House / street / area", required: true },
    { key: "city", label: "City", type: "text", placeholder: "Asansol", required: true },
  ],
  CONTACT_CORRECTION: [
    { key: "phone", label: "Corrected phone number", type: "tel", placeholder: "10-digit mobile number", required: true },
  ],
  PRODUCT_CHANGE: [
    {
      key: "approved_product_name",
      label: "Requested product",
      type: "text",
      placeholder: "Name / model of the product you want",
      required: true,
    },
    {
      key: "note",
      label: "Reason / details",
      type: "textarea",
      placeholder: "Any details the admin should know about the product change.",
      help: "Product changes are only possible before a lucky draw and only for a same-price product. Admin will confirm eligibility.",
    },
  ],
  LEGAL_DOCUMENT_CORRECTION: [
    { key: "note", label: "Document correction needed", type: "textarea", placeholder: "Which document/detail is wrong and what it should be.", required: true },
  ],
  SCHEDULE_CORRECTION: [
    { key: "note", label: "Schedule correction needed", type: "textarea", placeholder: "Which date/instalment needs correcting and why.", required: true },
  ],
  TENURE_EXTENSION: [
    {
      key: "requested_tenure_extension_months",
      label: "Additional tenure extension (months)",
      type: "number",
      placeholder: "e.g. 3, 6, 12",
      help: "How many additional months you wish to extend the rental or lease contract.",
      required: true,
    },
    {
      key: "note",
      label: "Extension reason / payment preference",
      type: "textarea",
      placeholder: "Specify why you want to extend this contract and any payment terms.",
      required: true,
    },
  ],
};

export function amendmentFieldsFor(type: AmendmentType, contractType?: string): AmendmentField[] {
  if (type === "PRODUCT_CHANGE" && contractType === "RENT_LEASE") {
    return [
      {
        key: "item_action",
        label: "Item Action (RETURN, CLOSE, UPGRADE, ADD)",
        type: "text",
        placeholder: "RETURN, CLOSE, UPGRADE, or ADD",
        help: "Flexible rent/lease amendment action on multi-product contract.",
        required: true,
      },
      {
        key: "contract_item_id",
        label: "Target Contract Item ID (optional if 1 item)",
        type: "number",
        placeholder: "ID of the contract item line",
      },
      {
        key: "quantity",
        label: "Quantity (for return or add)",
        type: "number",
        placeholder: "Units to return / add",
      },
      {
        key: "new_product_id",
        label: "New Product ID (for upgrade or add)",
        type: "number",
        placeholder: "Target Product ID",
      },
      {
        key: "note",
        label: "Amendment details / offline request notes",
        type: "textarea",
        placeholder: "Specific offline or customer request details",
        required: true,
      },
    ];
  }
  return AMENDMENT_FIELD_SCHEMA[type] ?? [NOTE_FIELD];
}

export function buildRequestedValues(type: AmendmentType, values: Record<string, string>, contractType?: string): Record<string, unknown> {
  const fields = amendmentFieldsFor(type, contractType);
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = (values[field.key] ?? "").trim();
    if (!raw) continue;
    out[field.key] = field.type === "number" ? Number(raw) : raw;
  }
  if (contractType === "RENT_LEASE" && type === "PRODUCT_CHANGE" && out.item_action) {
    out.action = String(out.item_action).toUpperCase();
  }
  return out;
}

export function validateRequestedValues(type: AmendmentType, values: Record<string, string>, contractType?: string): string | null {
  for (const field of amendmentFieldsFor(type, contractType)) {
    if (field.required && !(values[field.key] ?? "").trim()) {
      return `${field.label} is required.`;
    }
  }
  return null;
}
