import { apiFetch } from "@/lib/api";

export type PODStatus = "CAPTURED" | "VERIFIED" | "ARCHIVED";

export interface PODRecord {
  pod_id: number;
  delivery_id: number;
  subscription_id: number;
  contract_ref: string;
  customer_name: string;
  delivery_date: string;
  driver_name: string;
  status: PODStatus;
  photos: number;
  signature: boolean;
}

export interface PODDetail {
  pod_id: number;
  delivery_id: number;
  subscription_id: number;
  contract_ref: string;
  customer_name: string;
  delivery_date: string;
  driver_name: string;
  driver_phone: string;
  customer_signature_name: string;
  gps_latitude: string | null;
  gps_longitude: string | null;
  notes: string;
  photo_1_url: string | null;
  photo_2_url: string | null;
  signature_image_url: string | null;
  status: PODStatus;
  created_at: string;
}

export interface PODCapture {
  delivery_date: string;
  driver_name: string;
  driver_phone?: string;
  customer_signature_name: string;
  photo_1: File;
  photo_2?: File;
  signature_image: File;
  gps_latitude?: string;
  gps_longitude?: string;
  notes?: string;
}

export interface PODCaptureResult {
  success: boolean;
  pod_id: number;
  delivery_id: number;
  delivery_date: string;
  status: PODStatus;
  message: string;
}

export interface PODListResponse {
  count: number;
  results: PODRecord[];
}

export function capturePOD(deliveryId: number, payload: PODCapture): Promise<PODCaptureResult> {
  const formData = new FormData();
  formData.append("delivery_date", payload.delivery_date);
  formData.append("driver_name", payload.driver_name);
  formData.append("driver_phone", payload.driver_phone || "");
  formData.append("customer_signature_name", payload.customer_signature_name);
  formData.append("photo_1", payload.photo_1);
  if (payload.photo_2) formData.append("photo_2", payload.photo_2);
  formData.append("signature_image", payload.signature_image);
  if (payload.gps_latitude) formData.append("gps_latitude", payload.gps_latitude);
  if (payload.gps_longitude) formData.append("gps_longitude", payload.gps_longitude);
  formData.append("notes", payload.notes || "");

  return apiFetch(`/admin/delivery/${deliveryId}/pod/capture/`, {
    method: "POST",
    body: formData,
  });
}

export function listPOD(params: { year?: number; month?: number } = {}): Promise<PODListResponse> {
  const q = new URLSearchParams();
  if (params.year) q.set("year", String(params.year));
  if (params.month) q.set("month", String(params.month));
  return apiFetch(`/admin/delivery/pod/?${q}`);
}

export function getPODDetail(podId: number): Promise<PODDetail> {
  return apiFetch(`/admin/delivery/pod/${podId}/`);
}

export function exportPODYear(year: number): Promise<Blob> {
  return apiFetch(`/admin/delivery/pod/export/`, {
    method: "POST",
    body: JSON.stringify({ year }),
  }).then((res) => {
    if (res instanceof Blob) return res;
    return new Blob([JSON.stringify(res)], { type: "application/json" });
  });
}
