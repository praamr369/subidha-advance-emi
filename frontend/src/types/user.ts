export type UserRole = "customer" | "partner" | "admin";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}
