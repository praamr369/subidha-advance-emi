"use client";

import { useState } from "react";
import PincodeInput from "./PincodeInput";

interface AddressFormProps {
  onSubmit: (address: AddressPayload) => Promise<void>;
  loading?: boolean;
  error?: string;
}

export interface AddressPayload {
  postal_code: string;
  address_line1: string;
  address_line2?: string;
  address_type: "RESIDENTIAL" | "COMMERCIAL" | "BILLING";
  is_primary?: boolean;
}

interface PincodeData {
  postal_code: string;
  city: string;
  district: string;
  state: string;
}

export default function AddressForm({
  onSubmit,
  loading,
  error,
}: AddressFormProps) {
  const [pincode, setPincode] = useState("");
  const [pincodeData, setPincodeData] = useState<PincodeData | null>(null);
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [addressType, setAddressType] = useState<"RESIDENTIAL" | "COMMERCIAL" | "BILLING">(
    "RESIDENTIAL"
  );
  const [isPrimary, setIsPrimary] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pincodeData || !line1.trim()) return;

    setSubmitting(true);
    try {
      await onSubmit({
        postal_code: pincode,
        address_line1: line1.trim(),
        address_line2: line2.trim() || undefined,
        address_type: addressType,
        is_primary: isPrimary,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = pincodeData && line1.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg border border-gray-200">
      <div className="space-y-4">
        <PincodeInput
          value={pincode}
          onChange={setPincode}
          onValidated={setPincodeData}
          disabled={submitting || loading}
        />

        {pincodeData && (
          <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800">
            <div className="font-medium">{pincodeData.city}</div>
            <div className="text-xs text-blue-700">
              {pincodeData.district}, {pincodeData.state}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Address Line 1 (Required)
          </label>
          <input
            type="text"
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
            placeholder="Street address, building name, etc."
            disabled={submitting || loading}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Address Line 2 (Optional)
          </label>
          <input
            type="text"
            value={line2}
            onChange={(e) => setLine2(e.target.value)}
            placeholder="Apartment, suite, etc."
            disabled={submitting || loading}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Address Type
          </label>
          <select
            value={addressType}
            onChange={(e) =>
              setAddressType(e.target.value as "RESIDENTIAL" | "COMMERCIAL" | "BILLING")
            }
            disabled={submitting || loading}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="RESIDENTIAL">Residential</option>
            <option value="COMMERCIAL">Commercial</option>
            <option value="BILLING">Billing</option>
          </select>
        </div>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            disabled={submitting || loading}
            className="w-4 h-4 rounded border-gray-300 cursor-pointer"
          />
          <span className="text-sm text-gray-700">Set as primary address</span>
        </label>
      </div>

      {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

      <button
        type="submit"
        disabled={!isValid || submitting || loading}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
      >
        {submitting || loading ? "Saving..." : "Add Address"}
      </button>
    </form>
  );
}
