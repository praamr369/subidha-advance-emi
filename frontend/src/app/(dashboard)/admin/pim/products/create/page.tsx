"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function PimCreateProductRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Consolidating product creation to a single canonical route as per user request
    router.replace(ROUTES.admin.products + "/create");
  }, [router]);

  return null;
}
