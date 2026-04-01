"use client";

import EnterpriseListPage from "@/components/enterprise/EnterpriseListPage";
import { buildColumns } from "@/components/enterprise/columns";

const columns = buildColumns(["id", "batch_code", "status", "total_slots", "duration_months", "draw_day"]);

export default function BatchListPage() {
  return (
    <EnterpriseListPage
      title="Batches"
      subtitle="Track batch lifecycle and draw readiness."
      resourcePath="/admin/batches/"
      columns={columns}
    />
  );
}
