"use client";

import { useState, useEffect } from "react";

export interface Address {
  id: number;
  postal_code: string;
  city: string;
  district: string;
  state: string;
  address_line1: string;
  address_line2?: string;
  address_type: "RESIDENTIAL" | "COMMERCIAL" | "BILLING";
  is_primary: boolean;
  created_at: string;
}

interface AddressSelectorProps {
  onSelect: (address: Address) => void;
  selectedId?: number;
  loading?: boolean;
  error?: string;
}

export default function AddressSelector({
  onSelect,
  selectedId,
  loading,
  error,
}: AddressSelectorProps) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAddresses = async () => {
      try {
        const res = await fetch("/api/v1/customer/addresses/");
        if (!res.ok) throw new Error("Failed to fetch addresses");
        const data = await res.json();
        setAddresses(data.results || []);
        setFetchError(null);
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "Error fetching addresses");
      } finally {
        setFetching(false);
      }
    };

    fetchAddresses();
  }, []);

  if (fetching) {
    return <div className="text-center py-4 text-gray-500">Loading addresses...</div>;
  }

  if (addresses.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500">
        <p>No addresses on file. Please add one below.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Select Delivery Address
      </label>

      <div className="space-y-2">
        {addresses.map((addr) => (
          <label
            key={addr.id}
            className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition ${
              selectedId === addr.id
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <input
              type="radio"
              name="address"
              checked={selectedId === addr.id}
              onChange={() => onSelect(addr)}
              disabled={loading}
              className="mt-1 w-4 h-4 cursor-pointer"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{addr.address_line1}</span>
                {addr.is_primary && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                    Primary
                  </span>
                )}
                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                  {addr.address_type}
                </span>
              </div>
              {addr.address_line2 && (
                <div className="text-sm text-gray-600">{addr.address_line2}</div>
              )}
              <div className="text-sm text-gray-500">
                {addr.city}, {addr.district}, {addr.state} {addr.postal_code}
              </div>
            </div>
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
      {fetchError && <p className="text-sm text-red-600 font-medium">{fetchError}</p>}
    </div>
  );
}
