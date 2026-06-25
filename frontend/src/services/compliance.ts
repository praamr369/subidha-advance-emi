import { apiFetch } from "@/lib/api";
import type {
  BusinessTaxProfile,
  BusinessRulePolicyPayload,
  BusinessRulePolicyReadiness,
  ComplianceAlert,
  ComplianceTaxProfilePayload,
  ComplianceTaxReadiness,
  PartyTaxProfile,
  ProductTaxProfile,
  TaxProfileSnapshot,
  TurnoverSummary,
} from "@/types/compliance";

export async function getBusinessRulePolicy() {
  return apiFetch<BusinessRulePolicyReadiness>("/admin/settings/legal-controls/");
}

export async function updateBusinessRulePolicy(payload: BusinessRulePolicyPayload) {
  return apiFetch<BusinessRulePolicyReadiness>("/admin/settings/legal-controls/", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getComplianceTaxProfile() {
  return apiFetch<{
    active: BusinessTaxProfile;
    snapshot: TaxProfileSnapshot;
    history: BusinessTaxProfile[];
  }>("/admin/compliance/tax-profile/");
}

export async function activateComplianceTaxProfile(payload: ComplianceTaxProfilePayload) {
  return apiFetch<{ activated: boolean; tax_profile: BusinessTaxProfile }>(
    "/admin/compliance/tax-profile/activate/",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function getComplianceTaxReadiness() {
  return apiFetch<ComplianceTaxReadiness>("/admin/compliance/tax-readiness/");
}

export async function getComplianceTurnoverSummary(params?: {
  start_date?: string;
  end_date?: string;
}) {
  const query = new URLSearchParams();
  if (params?.start_date) query.set("start_date", params.start_date);
  if (params?.end_date) query.set("end_date", params.end_date);
  return apiFetch<{
    summary: TurnoverSummary;
    alerts: ComplianceAlert[];
  }>(`/admin/compliance/turnover-summary/${query.toString() ? `?${query.toString()}` : ""}`);
}

export async function listProductTaxProfiles() {
  return apiFetch<{ count: number; results: ProductTaxProfile[] }>("/admin/compliance/product-tax-profiles/");
}

export async function createProductTaxProfile(payload: Omit<ProductTaxProfile, "id">) {
  return apiFetch<ProductTaxProfile>("/admin/compliance/product-tax-profiles/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listPartyTaxProfiles() {
  return apiFetch<{ count: number; results: PartyTaxProfile[] }>("/admin/compliance/party-tax-profiles/");
}

export async function createPartyTaxProfile(payload: Omit<PartyTaxProfile, "id">) {
  return apiFetch<PartyTaxProfile>("/admin/compliance/party-tax-profiles/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
