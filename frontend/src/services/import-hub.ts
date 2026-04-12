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
  source?: string;
  errors?: string[];
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

export function previewEmployeeImport(file: File) {
  return uploadForm<ImportPreviewResponse>("/accounting/imports/employees/preview/", file);
}

export function postEmployeeImport(file: File) {
  return uploadForm<ImportPostResponse>("/accounting/imports/employees/post/", file);
}

export function previewBranchImport(file: File) {
  return uploadForm<ImportPreviewResponse>("/branch-control/imports/branches/preview/", file);
}

export function postBranchImport(file: File) {
  return uploadForm<ImportPostResponse>("/branch-control/imports/branches/post/", file);
}

export function previewCounterImport(file: File) {
  return uploadForm<ImportPreviewResponse>("/branch-control/imports/counters/preview/", file);
}

export function postCounterImport(file: File) {
  return uploadForm<ImportPostResponse>("/branch-control/imports/counters/post/", file);
}

export function previewProductImport(file: File) {
  return uploadForm<ImportPreviewResponse>("/admin/products/import-preview/", file);
}

export function postProductImport(file: File) {
  return uploadForm<ImportPostResponse>("/admin/products/import-csv/", file);
}
