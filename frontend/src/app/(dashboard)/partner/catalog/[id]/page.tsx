import CatalogProductDetailPage from "@/domains/products/pages/CatalogProductDetailPage";

export default async function PartnerCatalogProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <CatalogProductDetailPage
      role="partner"
      id={id}
      backHref="/partner/catalog"
    />
  );
}
