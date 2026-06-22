import { useState, useCallback } from "react";
import { UserPlus } from "lucide-react";
import { PageHeader } from "@/shared/ui/PageHeader";
import { ErrorState } from "@/shared/ui/ErrorState";
import { PaginationBar } from "@/shared/tables/PaginationBar";
import { CustomerFilters } from "../components/CustomerFilters";
import { CustomerTable } from "../components/CustomerTable";
import { CustomerDetailDrawer } from "../components/CustomerDetailDrawer";
import { CustomerFormDrawer } from "../components/CustomerFormDrawer";
import { KycDecisionDialog } from "../components/KycDecisionDialog";
import { useCustomers } from "../api/customer.queries";
import type {
  CustomerAdmin,
  CustomerListParams,
  KycStatus,
  CustomerStatus,
} from "../api/customer.types";

const PAGE_SIZE = 20;

export function CustomersPage() {
  const [params, setParams] = useState<CustomerListParams>({
    page: 1,
    page_size: PAGE_SIZE,
    search: "",
    kyc_status: "",
    status: "",
  });

  const { data, isLoading, isError, refetch } = useCustomers(params);

  const [selected, setSelected] = useState<CustomerAdmin | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomerAdmin | null>(null);
  const [kycTarget, setKycTarget] = useState<CustomerAdmin | null>(null);

  const updateFilter = useCallback(
    (patch: Partial<CustomerListParams>) =>
      setParams((prev) => ({ ...prev, ...patch, page: 1 })),
    [],
  );

  function openCreate() {
    setEditTarget(null);
    setFormOpen(true);
  }

  function openEdit(customer: CustomerAdmin) {
    setEditTarget(customer);
    setFormOpen(true);
    setSelected(null);
  }

  function openKyc(customer: CustomerAdmin) {
    setKycTarget(customer);
    setSelected(null);
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Manage customer records, KYC status, and profiles"
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
          >
            <UserPlus size={16} />
            New Customer
          </button>
        }
      />

      <CustomerFilters
        search={params.search ?? ""}
        onSearchChange={(v) => updateFilter({ search: v })}
        kycStatus={(params.kyc_status as KycStatus | "") ?? ""}
        onKycStatusChange={(v) => updateFilter({ kyc_status: v })}
        status={(params.status as CustomerStatus | "") ?? ""}
        onStatusChange={(v) => updateFilter({ status: v })}
      />

      {isError ? (
        <ErrorState
          title="Failed to load customers"
          message="Could not fetch customer data from the server."
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <CustomerTable
            data={data?.results ?? []}
            isLoading={isLoading}
            onSelect={setSelected}
          />
          {data && (
            <PaginationBar
              page={params.page ?? 1}
              pageSize={PAGE_SIZE}
              total={data.count}
              onPageChange={(p) => setParams((prev) => ({ ...prev, page: p }))}
            />
          )}
        </>
      )}

      <CustomerDetailDrawer
        customer={selected}
        onClose={() => setSelected(null)}
        onEdit={openEdit}
        onKycAction={openKyc}
      />

      <CustomerFormDrawer
        open={formOpen}
        customer={editTarget}
        onClose={() => setFormOpen(false)}
        onSuccess={() => refetch()}
      />

      <KycDecisionDialog
        customer={kycTarget}
        onClose={() => setKycTarget(null)}
      />
    </div>
  );
}
