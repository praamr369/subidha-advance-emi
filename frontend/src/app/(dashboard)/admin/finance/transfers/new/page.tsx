import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function NewFinanceTransferRedirectPage() {
  redirect(`${ROUTES.admin.financeTransfers}?tab=new`);
}
