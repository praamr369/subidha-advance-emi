import { redirect } from "next/navigation";

export default function PimProductsRedirectPage() {
  redirect("/admin/products?tab=pim");
}
