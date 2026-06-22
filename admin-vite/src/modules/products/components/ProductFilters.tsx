import { SearchInput } from "@/shared/filters/SearchInput";
import { FilterBar } from "@/shared/filters/FilterBar";
import { useCatalogOptions } from "../api/product.queries";

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
};

export function ProductFilters({
  search,
  onSearchChange,
  category,
  onCategoryChange,
}: Props) {
  const { data: options } = useCatalogOptions();

  return (
    <FilterBar>
      <div className="w-72">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder="Search name, code, SKU..."
        />
      </div>
      <select
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      >
        <option value="">All Categories</option>
        {options?.categories.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>
    </FilterBar>
  );
}
