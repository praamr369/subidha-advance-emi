/**
 * Admin Data Type Handlers
 * Provides formatting, validation, and interaction utilities for different data types
 */

import {
  Mail,
  Phone,
  Link as LinkIcon,
  Wallet,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export type DataType =
  | "text"
  | "number"
  | "currency"
  | "percentage"
  | "email"
  | "phone"
  | "url"
  | "date"
  | "datetime"
  | "time"
  | "status"
  | "boolean"
  | "json"
  | "array"
  | "file";

export interface DataTypeHandler {
  format: (value: any) => string;
  copy: (value: any) => string;
  validate: (value: any) => boolean;
  getIcon: () => any;
  getPreview: (value: any) => string;
  open?: (value: any) => void;
}

export const dataTypeHandlers: Record<DataType, DataTypeHandler> = {
  // Text Handler
  text: {
    format: (value) => String(value || "—"),
    copy: (value) => String(value || ""),
    validate: (value) => typeof value === "string" || typeof value === "number",
    getIcon: () => null,
    getPreview: (value) => {
      const str = String(value || "");
      return str.length > 100 ? str.substring(0, 100) + "..." : str;
    },
  },

  // Number Handler
  number: {
    format: (value) => {
      if (value === null || value === undefined) return "—";
      return Number(value).toLocaleString("en-IN");
    },
    copy: (value) => String(Number(value || 0)),
    validate: (value) => !isNaN(Number(value)),
    getIcon: () => null,
    getPreview: (value) => Number(value || 0).toLocaleString("en-IN"),
  },

  // Currency Handler
  currency: {
    format: (value) => {
      if (value === null || value === undefined) return "Rs. —";
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(Number(value));
    },
    copy: (value) => String(Number(value || 0)),
    validate: (value) => !isNaN(Number(value)),
    getIcon: () => Wallet,
    getPreview: (value) => {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(Number(value || 0));
    },
  },

  // Percentage Handler
  percentage: {
    format: (value) => {
      if (value === null || value === undefined) return "—";
      const num = Number(value);
      return `${num.toFixed(2)}%`;
    },
    copy: (value) => String(Number(value || 0)),
    validate: (value) => !isNaN(Number(value)),
    getIcon: () => null,
    getPreview: (value) => `${Number(value || 0).toFixed(2)}%`,
  },

  // Email Handler
  email: {
    format: (value) => String(value || "—"),
    copy: (value) => String(value || ""),
    validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)),
    getIcon: () => Mail,
    getPreview: (value) => String(value || ""),
    open: (value) => {
      window.location.href = `mailto:${value}`;
    },
  },

  // Phone Handler
  phone: {
    format: (value) => {
      const phone = String(value || "").replace(/\D/g, "");
      if (phone.length === 10) {
        return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
      }
      return String(value || "");
    },
    copy: (value) => String(value || "").replace(/\D/g, ""),
    validate: (value) => /^[0-9+\-\s()]{7,}$/.test(String(value)),
    getIcon: () => Phone,
    getPreview: (value) => {
      const phone = String(value || "").replace(/\D/g, "");
      return phone.length === 10 ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : String(value || "");
    },
    open: (value) => {
      const phone = String(value || "").replace(/\D/g, "");
      window.location.href = `tel:+91${phone}`;
    },
  },

  // URL Handler
  url: {
    format: (value) => {
      const url = String(value || "");
      try {
        const parsed = new URL(url);
        return parsed.hostname;
      } catch {
        return url;
      }
    },
    copy: (value) => String(value || ""),
    validate: (value) => {
      try {
        new URL(String(value));
        return true;
      } catch {
        return false;
      }
    },
    getIcon: () => LinkIcon,
    getPreview: (value) => String(value || ""),
    open: (value) => {
      window.open(String(value), "_blank");
    },
  },

  // Date Handler
  date: {
    format: (value) => {
      if (!value) return "—";
      const date = new Date(String(value));
      return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    },
    copy: (value) => String(value || ""),
    validate: (value) => !isNaN(Date.parse(String(value))),
    getIcon: () => Calendar,
    getPreview: (value) => {
      if (!value) return "";
      const date = new Date(String(value));
      return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    },
  },

  // DateTime Handler
  datetime: {
    format: (value) => {
      if (!value) return "—";
      const date = new Date(String(value));
      return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    copy: (value) => String(value || ""),
    validate: (value) => !isNaN(Date.parse(String(value))),
    getIcon: () => Clock,
    getPreview: (value) => {
      if (!value) return "";
      const date = new Date(String(value));
      return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
  },

  // Time Handler
  time: {
    format: (value) => {
      if (!value) return "—";
      const date = new Date(`2000-01-01T${value}`);
      return date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    copy: (value) => String(value || ""),
    validate: (value) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]/.test(String(value)),
    getIcon: () => Clock,
    getPreview: (value) => {
      if (!value) return "";
      const date = new Date(`2000-01-01T${value}`);
      return date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    },
  },

  // Status Handler
  status: {
    format: (value) => {
      const status = String(value || "").toUpperCase();
      return status;
    },
    copy: (value) => String(value || ""),
    validate: (value) => typeof value === "string",
    getIcon: () => {
      return AlertCircle;
    },
    getPreview: (value) => String(value || ""),
  },

  // Boolean Handler
  boolean: {
    format: (value) => (value ? "Yes" : "No"),
    copy: (value) => String(value ? "true" : "false"),
    validate: (value) => typeof value === "boolean" || value === "true" || value === "false" || value === 1 || value === 0,
    getIcon: () => CheckCircle2,
    getPreview: (value) => (value ? "Yes" : "No"),
  },

  // JSON Handler
  json: {
    format: (value) => {
      if (typeof value === "string") return value;
      return JSON.stringify(value, null, 2);
    },
    copy: (value) => {
      return typeof value === "string" ? value : JSON.stringify(value);
    },
    validate: (value) => {
      try {
        if (typeof value === "string") JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    },
    getIcon: () => null,
    getPreview: (value) => {
      const str = typeof value === "string" ? value : JSON.stringify(value);
      return str.length > 50 ? str.substring(0, 50) + "..." : str;
    },
  },

  // Array Handler
  array: {
    format: (value) => {
      if (!Array.isArray(value)) return "—";
      return `[${value.length} items]`;
    },
    copy: (value) => {
      return Array.isArray(value) ? value.join(", ") : "";
    },
    validate: (value) => Array.isArray(value),
    getIcon: () => null,
    getPreview: (value) => {
      if (!Array.isArray(value)) return "";
      return `[${value.length} items]`;
    },
  },

  // File Handler
  file: {
    format: (value) => {
      if (!value) return "—";
      const file = value as File;
      return `${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
    },
    copy: (value) => {
      if (!value) return "";
      const file = value as File;
      return file.name;
    },
    validate: (value) => value instanceof File,
    getIcon: () => null,
    getPreview: (value) => {
      if (!value) return "";
      const file = value as File;
      return `${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
    },
    open: (value) => {
      if (value instanceof File) {
        const url = URL.createObjectURL(value);
        window.open(url, "_blank");
      }
    },
  },
};

// Status Badge Colors
export const statusBadgeColors: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
  draft: "bg-gray-100 text-gray-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
  hold: "bg-orange-100 text-orange-800",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
  info: "bg-blue-100 text-blue-800",
};

// Get status icon
export function getStatusIcon(status: string) {
  const statusLower = String(status).toLowerCase();
  if (statusLower.includes("success") || statusLower.includes("completed") || statusLower.includes("approved")) {
    return CheckCircle2;
  }
  if (statusLower.includes("failed") || statusLower.includes("error") || statusLower.includes("rejected")) {
    return XCircle;
  }
  return AlertCircle;
}

// Get status color
export function getStatusColor(status: string) {
  const statusLower = String(status).toLowerCase();
  return statusBadgeColors[statusLower] || statusBadgeColors.info;
}

// Format data by type
export function formatDataByType(value: any, type: DataType): string {
  const handler = dataTypeHandlers[type];
  if (!handler) return String(value || "—");
  return handler.format(value);
}

// Copy data by type
export async function copyDataByType(value: any, type: DataType) {
  const handler = dataTypeHandlers[type];
  if (!handler) return;
  const text = handler.copy(value);
  await navigator.clipboard.writeText(text);
}

// Get preview by type
export function getPreviewByType(value: any, type: DataType): string {
  const handler = dataTypeHandlers[type];
  if (!handler) return String(value || "—");
  return handler.getPreview(value);
}

// Open data by type (for clickable data)
export function openDataByType(value: any, type: DataType) {
  const handler = dataTypeHandlers[type];
  if (!handler || !handler.open) return;
  handler.open(value);
}
