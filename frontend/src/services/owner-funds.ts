import { apiFetch } from "@/lib/api";

export type InjectionType = "CAPITAL" | "LOAN";
export type InterestType = "FLAT" | "REDUCING" | "NONE";
export type RepaymentFrequency = "MONTHLY" | "QUARTERLY" | "LUMP_SUM";

export type OwnerLoanRepayment = {
  id: number;
  amount: string;
  date: string;
  finance_account_id: number;
  finance_account_name: string;
  notes: string;
  journal_entry_no: string | null;
};

export type OwnerFundInjection = {
  id: number;
  injection_type: InjectionType;
  injection_type_display: string;
  amount: string;
  date: string;
  finance_account_id: number;
  finance_account_name: string;
  description: string;
  reference: string;
  status: "DRAFT" | "POSTED";
  loan_outstanding: string;
  tenure_months: number | null;
  interest_rate: string | null;
  interest_type: InterestType;
  repayment_frequency: RepaymentFrequency;
  repayment_start_date: string | null;
  total_interest: string;
  journal_entry_no: string | null;
  repayments: OwnerLoanRepayment[];
  created_at: string;
};

export type OwnerFundsSummary = {
  total_capital_injected: string;
  total_loan_injected: string;
  total_loan_outstanding: string;
  total_loan_repaid: string;
  total_funds_in: string;
};

export type OwnerFundsListResponse = {
  results: OwnerFundInjection[];
  count: number;
  summary: OwnerFundsSummary;
};

export type ScheduleLine = {
  installment: number;
  due_date: string;
  principal: string;
  interest: string;
  total: string;
  balance: string;
};

export type ScheduleResponse = {
  schedule: ScheduleLine[];
  summary: {
    principal: string;
    total_interest: string;
    total_payable: string;
    tenure_months: number;
    interest_rate: string;
    interest_type: InterestType;
    repayment_frequency: RepaymentFrequency;
    loan_outstanding?: string;
  };
};

export async function listOwnerFunds(params?: { type?: InjectionType }): Promise<OwnerFundsListResponse> {
  const qs = params?.type ? `?type=${params.type}` : "";
  return apiFetch(`/admin/finance/owner-funds/${qs}`);
}

export async function createOwnerFundInjection(payload: {
  injection_type: InjectionType;
  amount: string;
  date: string;
  finance_account_id: number;
  description?: string;
  reference?: string;
  tenure_months?: number | null;
  interest_rate?: string | null;
  interest_type?: InterestType;
  repayment_frequency?: RepaymentFrequency;
  repayment_start_date?: string | null;
}): Promise<OwnerFundInjection> {
  return apiFetch("/admin/finance/owner-funds/", { method: "POST", body: payload });
}

export async function getOwnerFundInjection(id: number): Promise<OwnerFundInjection> {
  return apiFetch(`/admin/finance/owner-funds/${id}/`);
}

export async function previewRepaymentSchedule(payload: {
  amount: string;
  tenure_months: number;
  interest_rate: string;
  interest_type: InterestType;
  repayment_frequency: RepaymentFrequency;
  repayment_start_date?: string;
}): Promise<ScheduleResponse> {
  return apiFetch("/admin/finance/owner-funds/schedule-preview/", { method: "POST", body: payload });
}

export async function getRepaymentSchedule(id: number): Promise<ScheduleResponse> {
  return apiFetch(`/admin/finance/owner-funds/${id}/schedule/`);
}

export async function recordOwnerLoanRepayment(
  id: number,
  payload: {
    amount: string;
    date: string;
    finance_account_id: number;
    notes?: string;
  }
): Promise<OwnerFundInjection> {
  return apiFetch(`/admin/finance/owner-funds/${id}/repay/`, { method: "POST", body: payload });
}
