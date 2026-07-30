"use client";

import { useState, useEffect } from "react";

interface PincodeInputProps {
  value: string;
  onChange: (pincode: string) => void;
  onValidated?: (data: PincodeData | null) => void;
  error?: string;
  disabled?: boolean;
}

interface PincodeData {
  postal_code: string;
  city: string;
  district: string;
  state: string;
}

export default function PincodeInput({
  value,
  onChange,
  onValidated,
  error,
  disabled,
}: PincodeInputProps) {
  const [loading, setLoading] = useState(false);
  const [validated, setValidated] = useState(false);

  useEffect(() => {
    if (value.length === 6 && /^\d{6}$/.test(value)) {
      setLoading(true);
      fetch(`/api/v1/pincode/${value}/details/`)
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error("Invalid pincode");
        })
        .then((data) => {
          setValidated(true);
          onValidated?.(data);
        })
        .catch(() => {
          setValidated(false);
          onValidated?.(null);
        })
        .finally(() => setLoading(false));
    } else {
      setValidated(false);
      onValidated?.(null);
    }
  }, [value, onValidated]);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Postal Code (PIN)
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter 6-digit PIN"
          maxLength={6}
          pattern="\d{6}"
          disabled={disabled || loading}
          className={`flex-1 px-3 py-2 rounded-lg border ${
            error ? "border-red-300" : "border-gray-300"
          } focus:outline-none focus:ring-2 focus:ring-blue-500`}
        />
        {loading && <div className="text-blue-500">Validating...</div>}
        {validated && <div className="text-green-500">✓ Valid</div>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
