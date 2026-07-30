import {
  type AsyncRouteSearchParams,
  redirectToCanonicalPath,
} from "@/lib/route-redirect";

type PageProps = {
  searchParams?: AsyncRouteSearchParams;
};

// Vendor master data now lives in the single /admin/vendors hub. This accounting
// path used to carry a second vendor create/edit surface, which duplicated the
// hub and confused operators. It is kept as a canonical redirect so existing
// links and bookmarks keep working. Vendor payables live at
// /admin/vendors/outstanding and the vendor ledger at /admin/vendors/ledger.
export default async function AdminAccountingVendorsRedirectPage({
  searchParams,
}: PageProps) {
  await redirectToCanonicalPath("/admin/vendors", searchParams);
}
