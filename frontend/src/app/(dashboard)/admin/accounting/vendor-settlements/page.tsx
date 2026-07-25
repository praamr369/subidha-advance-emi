import {
  type AsyncRouteSearchParams,
  redirectToCanonicalPath,
} from "@/lib/route-redirect";

type PageProps = {
  searchParams?: AsyncRouteSearchParams;
};

// Vendor settlements now live under the /admin/vendors hub alongside the vendor
// register, outstanding, and ledger. This accounting path is kept as a canonical
// redirect so existing links and bookmarks keep working.
export default async function AdminAccountingVendorSettlementsRedirectPage({
  searchParams,
}: PageProps) {
  await redirectToCanonicalPath("/admin/vendors/settlements", searchParams);
}
