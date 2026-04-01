"use client";

import EnterpriseListPage from "@/components/enterprise/EnterpriseListPage";
import { buildColumns } from "@/components/enterprise/columns";

const columns = buildColumns(["id", "name", "phone", "kyc_status", "created_at"]);

export default function CustomerListPage() {
  return (
    <EnterpriseListPage
      title="Customers"
      subtitle="Search and manage customer records."
      resourcePath="/admin/customers/"
      columns={columns}
    />
  );
}
