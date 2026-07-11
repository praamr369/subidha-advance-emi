import { redirect } from "next/navigation";

// Vendor payments are now handled through the Unified Payment Center.
// This route is kept for backwards compatibility with bookmarks/links.
export default function VendorPaymentsRedirect() {
  redirect("/admin/payables?type=vendor_settlement");
}
