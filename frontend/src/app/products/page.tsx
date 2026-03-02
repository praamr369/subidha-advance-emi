import PublicNav from "@/components/ui/public-nav";
import PortalPage from "@/components/ui/portal-page";

const products = [
  ["Wooden Bed", "₹35,000", "₹2,333/mo", "Yes"],
  ["Steel Bed", "₹18,000", "₹1,200/mo", "Yes"],
  ["Sofa", "₹42,000", "₹2,800/mo", "Yes"],
  ["Almirah", "₹22,000", "₹1,467/mo", "Yes"],
  ["Dressing Table", "₹14,000", "₹933/mo", "No"],
];

export default function ProductsPage() {
  return (
    <PortalPage title="Product Catalog" subtitle="Furniture products with EMI preview and Lucky Plan eligibility.">
      <PublicNav />
      <table border={1} cellPadding={8} cellSpacing={0}>
        <thead><tr><th>Product</th><th>Price</th><th>EMI</th><th>Lucky Plan</th></tr></thead>
        <tbody>
          {products.map((p) => <tr key={p[0]}>{p.map((c) => <td key={c}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </PortalPage>
  );
}
