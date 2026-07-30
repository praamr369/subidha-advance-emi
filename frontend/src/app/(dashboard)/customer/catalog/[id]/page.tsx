import CatalogProductDetailPage from "@/domains/products/pages/CatalogProductDetailPage";

export default async function CustomerCatalogProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <CatalogProductDetailPage
      role="customer"
      id={id}
      backHref="/customer/catalog"
    />
  );
}
