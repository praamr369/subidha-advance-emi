import { SearchInput } from "@/shared/filters/SearchInput";
import { FilterBar } from "@/shared/filters/FilterBar";
import type { KycStatus, CustomerStatus } from "../api/customer.types";

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  kycStatus: KycStatus | "";
  onKycStatusChange: (v: KycStatus | "") => void;
  status: CustomerStatus | "";
  onStatusChange: (v: CustomerStatus | "") => void;
};

const kycOptions: { value: KycStatus | ""; label: string }[] = [
  { value: "", label: "All KYC" },
  { value: "PENDING", label: "Pending" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "APPROVED", label: "Approved" },
  { value: "VERIFIED", label: "Verified" },
  { value: "REJECTED", label: "Rejected" },
];

const statusOptions: { value: CustomerStatus | ""; label: string }[] = [
  { value: "", label: "All Status" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

export function CustomerFilters({
  search,
  onSearchChange,
  kycStatus,
  onKycStatusChange,
  status,
  onStatusChange,
}: Props) {
  return (
    <FilterBar>
      <div className="w-72">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder="Search name, phone, email, code..."
        />
      </div>
      <select
        value={kycStatus}
        onChange={(e) => onKycStatusChange(e.target.value as KycStatus | "")}
        className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      >
        {kycOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={status}
        onChange={(e) => onStatusChange(e.target.value as CustomerStatus | "")}
        className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      >
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FilterBar>
  );
}
