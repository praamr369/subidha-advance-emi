import {
  type AsyncRouteSearchParams,
  redirectAliasToCanonicalPath,
} from "@/lib/route-redirect";

type PageProps = {
  searchParams?: AsyncRouteSearchParams;
};

export default async function AdminLuckyDrawHistoryRoute({ searchParams }: PageProps) {
  await redirectAliasToCanonicalPath("/admin/lucky-draw/history", searchParams);
}
