export type EmiStatus = "pending" | "paid" | "overdue";

export interface EmiInstallment {
  id: string;
  dueDate: string;
  amount: string;
  status: EmiStatus;
}
