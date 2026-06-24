"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import {
  ERPPageShell,
  ERPSectionShell,
  ERPAuditNote,
} from "@/components/erp";
import ActionButton from "@/components/ui/ActionButton";
import { createCustomerReferral } from "@/services/customer";

interface FormData {
  referred_customer_id: number;
  notes: string;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to create referral. Please try again.";
}

export default function CreateReferralPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    referred_customer_id: 0,
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.referred_customer_id) {
      setError("Please provide a customer ID");
      return;
    }

    try {
      setLoading(true);
      await createCustomerReferral({
        referred_customer_id: formData.referred_customer_id,
        notes: formData.notes,
      });
      setSuccess(true);
      setTimeout(() => {
        router.push("/customer/referrals");
      }, 1500);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ERPPageShell title="Create New Referral">
      <div className="space-y-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <ERPSectionShell>
          <form onSubmit={handleSubmit} className="space-y-6">
            {success && (
              <div className="rounded-lg bg-green-50 p-4 border border-green-200">
                <p className="text-sm text-green-800">
                  Referral created successfully! Redirecting...
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 p-4 border border-red-200">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">
                Customer ID <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.referred_customer_id || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    referred_customer_id: parseInt(e.target.value) || 0,
                  })
                }
                placeholder="Enter the ID of the customer you're referring"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                The customer ID of the person you are referring to our service
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Notes <span className="text-gray-500">(optional)</span>
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Add any notes about this referral"
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <ActionButton
                type="submit"
                disabled={loading}
                label={loading ? "Creating..." : "Create Referral"}
              />
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </ERPSectionShell>

        <ERPAuditNote
          icon="info"
          title="How Referrals Work"
          description="When you refer a customer, they can place an order using your referral. Once their order is confirmed and payment is received, you'll be eligible to earn commission. Commission amounts vary based on the order value."
        />
      </div>
    </ERPPageShell>
  );
}
