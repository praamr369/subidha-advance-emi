import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

// UPI is merged into the single Bank/UPI holding account. This route now
// redirects to the combined Bank/UPI Book so old links/bookmarks keep working.
export default function AccountingUpiBookRedirect() {
  redirect(ROUTES.admin.accountingBooksBank);
}
