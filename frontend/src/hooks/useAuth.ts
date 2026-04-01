import { useAuth as useAuthProvider } from "@/providers/AuthProvider";

export function useAuth() {
  return useAuthProvider();
}
