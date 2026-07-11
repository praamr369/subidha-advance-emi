import { redirect } from "next/navigation";

// Vendor payables are now handled through the Unified Payment Center.
// This route is kept for backwards compatibility with bookmarks/links.
export default function VendorPayablesRedirect() {
  redirect("/admin/payables?type=vendor_settlement");
}
