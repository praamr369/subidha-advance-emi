"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import RoleGuard from "@/components/auth/RoleGuard";
import Link from "next/link";

export default function BatchesPage() {
  const [batches, setBatches] = useState<any[]>([]);

  useEffect(() => {
    apiFetch("/admin/batches/")
      .then((res: any) => setBatches(res));
  }, []);

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Batch Management</h1>

        <table className="w-full border">
          <thead>
            <tr>
              <th>Code</th>
              <th>Status</th>
              <th>Slots</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{b.batch_code}</td>
                <td>{b.status}</td>
                <td>{b.total_slots}</td>
                <td>
                  <Link href={`/admin/batches/${b.id}`}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RoleGuard>
  );
}