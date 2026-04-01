"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useQueryState(key: string) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const value = params.get(key) || "";
  function setValue(next: string) { const sp = new URLSearchParams(params.toString()); if (!next) sp.delete(key); else sp.set(key, next); router.replace(`${pathname}?${sp.toString()}`); }
  return [value, setValue] as const;
}
