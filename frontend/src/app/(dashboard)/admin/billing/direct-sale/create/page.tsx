import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";

export default function AdminDirectSaleCreateRoutePage() {
  redirect(`${ROUTES.admin.billingDirectSaleWorkspace}?mode=create`);
}
