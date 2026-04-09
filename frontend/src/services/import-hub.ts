import { request } from "@/services/api";

export type ImportPreviewRow = {
  row_number: number;
  valid: boolean;
  errors: string[];
  [key: string]: unknown;
};

export type ImportPreviewResponse = {
  columns: string[];
  preview_rows: ImportPreviewRow[];
  errors: ImportPreviewRow[];
  valid_count: number;
  invalid_count: number;
};

export type ImportPostResponse = {
  created: number;
  updated: number;
  skipped: number;
  message?: string;
};

async function uploadForm<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  return request<T>(path, {
    method: "POST",
    body: form,
  } as RequestInit);
}

export function previewChartOfAccountsImport(file: File) {
  return uploadForm<ImportPreviewResponse>("/accounting/imports/chart-of-accounts/preview/", file);
}

export function postChartOfAccountsImport(file: File) {
  return uploadForm<ImportPostResponse>("/accounting/imports/chart-of-accounts/post/", file);
}

export function previewVendorImport(file: File) {
  return uploadForm<ImportPreviewResponse>("/accounting/imports/vendors/preview/", file);
}

export function postVendorImport(file: File) {
  return uploadForm<ImportPostResponse>("/accounting/imports/vendors/post/", file);
}
