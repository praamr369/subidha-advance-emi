import {
  type AsyncRouteSearchParams,
  redirectToCanonicalPath,
} from "@/lib/route-redirect";

type PageProps = {
  searchParams?: AsyncRouteSearchParams;
};

export default async function AdminPaymentHistoryRoute({ searchParams }: PageProps) {
  await redirectToCanonicalPath("/admin/payments", searchParams);
}
