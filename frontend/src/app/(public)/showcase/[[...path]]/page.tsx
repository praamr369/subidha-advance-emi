import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * Public showcase redirect handler.
 * Gracefully routes showroom QR codes and legacy /showcase/ links to canonical /products/ pages.
 * Handles patterns such as:
 * - /showcase/code/[code] -> /products/[code]
 * - /showcase/pim/[id] -> /products/[id]
 * - /showcase/[code] -> /products/[code]
 */
export default async function ShowcaseCatchAllPage({ params, searchParams }: Props) {
  const { path = [] } = await params;
  const resolvedSearchParams = await searchParams;

  let targetCode = "";

  if (path.length > 0) {
    if (path[0] === "code" && path[1]) {
      targetCode = path.slice(1).join("/");
    } else if (path[0] === "pim" && path[1]) {
      targetCode = path.slice(1).join("/");
    } else {
      targetCode = path.join("/");
    }
  }

  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(resolvedSearchParams)) {
    if (typeof val === "string") qs.set(key, val);
  }
  const queryStr = qs.toString();

  if (targetCode) {
    redirect(`/products/${encodeURIComponent(targetCode)}${queryStr ? `?${queryStr}` : ""}`);
  }

  redirect("/products");
}
