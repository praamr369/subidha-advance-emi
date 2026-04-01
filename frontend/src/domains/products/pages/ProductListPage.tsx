"use client";

import EnterpriseListPage from "@/components/enterprise/EnterpriseListPage";
import { buildColumns } from "@/components/enterprise/columns";

const columns = buildColumns(["id", "product_code", "name", "base_price"]);

export default function ProductListPage() {
  return (
    <EnterpriseListPage
      title="Products"
      subtitle="Manage product catalog for EMI subscriptions."
      resourcePath="/admin/products/"
      columns={columns}
    />
  );
}
