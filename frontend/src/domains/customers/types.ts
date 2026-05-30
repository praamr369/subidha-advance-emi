export type Customer = {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  kyc_status?: string;
  status?: string;
  created_at?: string | null;
};
