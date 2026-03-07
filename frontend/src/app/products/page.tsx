import PublicNav from "@/components/ui/public-nav";
import PortalPage from "@/components/ui/portal-page";
import { API_BASE_URL } from "@/lib/constants";

type PublicProduct = {
  id: number;
  product_code: string;
  name: string;
  base_price: string;
};

type ProductResponse = {
  count?: number;
  results?: PublicProduct[];
};

async function getProducts(): Promise<{ products: PublicProduct[]; count: number; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/public/products/`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        products: [],
        count: 0,
        error: "Unable to load products right now.",
      };
    }

    const data = (await response.json()) as ProductResponse;
    const products = Array.isArray(data.results) ? data.results : [];

    return {
      products,
      count: data.count ?? products.length,
      error: null,
    };
  } catch {
    return {
      products: [],
      count: 0,
      error: "Unable to connect to product service.",
    };
  }
}

export default async function ProductsPage() {
  const { products, count, error } = await getProducts();

  return (
    <PortalPage
      title="Product Catalog"
      subtitle={`Showing ${count} products from your backend catalog.`}
    >
      <PublicNav />
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Code</th>
            <th>Product</th>
            <th>Base Price</th>
          </tr>
        </thead>
        <tbody>
          {products.length > 0 ? (
            products.map((product) => (
              <tr key={product.id}>
                <td>{product.id}</td>
                <td>{product.product_code}</td>
                <td>{product.name}</td>
                <td>₹{product.base_price}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4}>No products found. Please import products from CSV in backend.</td>
            </tr>
          )}
        </tbody>
      </table>
    </PortalPage>
  );
}
