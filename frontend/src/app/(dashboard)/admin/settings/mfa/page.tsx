"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { API_BASE_URL } from "@/lib/constants";

export default function MFASetupPage() {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadMfa() {
      if (!accessToken) return;
      try {
        const res = await fetch(`${API_BASE_URL.replace(/\/api\/v1\/?$/, "")}/api/v1/auth/mfa/setup/`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!res.ok) throw new Error("Failed to load MFA details.");
        const data = await res.json();
        setQrCode(data.qr_code);
        setIsVerified(data.is_verified);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading MFA details");
      }
    }
    loadMfa();
  }, [accessToken]);

  const verifyMfa = async () => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL.replace(/\/api\/v1\/?$/, "")}/api/v1/auth/mfa/setup/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mfa_code: mfaCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to verify MFA.");
      setSuccess("MFA verified successfully!");
      setIsVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Multi-Factor Authentication</h1>
      
      {isVerified ? (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          MFA is successfully configured and active for your account.
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-gray-600">
            Scan the QR code below using Google Authenticator or Authy.
          </p>
          
          {qrCode && (
            <div className="bg-white p-4 border rounded-lg inline-block">
              <img src={qrCode} alt="MFA QR Code" />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Verification Code</label>
            <input
              type="text"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="6-digit code"
              className="w-full h-10 px-3 border rounded-md"
            />
          </div>

          <button
            onClick={verifyMfa}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
          >
            Verify and Enable MFA
          </button>

          {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
          {success && <div className="text-green-600 text-sm mt-2">{success}</div>}
        </div>
      )}
    </div>
  );
}

