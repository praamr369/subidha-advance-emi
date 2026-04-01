"use client";

import EnterpriseListPage from "@/components/enterprise/EnterpriseListPage";
import { buildColumns } from "@/components/enterprise/columns";

const columns = buildColumns(["id", "subscription", "month_no", "due_date", "amount", "status"]);

export default function PendingEmiPage() {
  return (
    <EnterpriseListPage
      title="Pending EMIs"
      subtitle="Pending collections queue."
      resourcePath="/admin/emis/"
      columns={columns}
      statusOptions={[
        { label: "Pending", value: "PENDING" },
        { label: "All", value: "" },
      ]}
    />
  );
}
