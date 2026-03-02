export type CommissionStatus = "calculated" | "approved" | "paid";

export interface Commission {
  id: string;
  partnerId: string;
  amount: string;
  status: CommissionStatus;
  calculatedAt: string;
}
