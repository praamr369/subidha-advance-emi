import { useQuery } from "@tanstack/react-query";
import { fetchCurrentUser, type CurrentUser } from "./auth-client";
import { tokenStore } from "./token-store";

export function useCurrentUser() {
  return useQuery<CurrentUser>({
    queryKey: ["auth", "me"],
    queryFn: fetchCurrentUser,
    enabled: !!tokenStore.getAccessToken(),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
