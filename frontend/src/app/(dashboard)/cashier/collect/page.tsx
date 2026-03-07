"use client";

import { useState } from "react";

import RoleGuard from "@/components/auth/RoleGuard";
import { apiFetch } from "@/lib/api";

type Emi = {
  id: number;
  month_no: number;
  due_date: string;
  amount: number;
  status: string;
};

type PendingEmiResponse = {
  customer: string;
  emis: Array<{
    id: number;
    month_no: number;
    due_date: string;
    amount: string | number;
    status: string;
  }>;
};

export default function CashierCollectPage() {
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [emis, setEmis] = useState<Emi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedEmi, setSelectedEmi] = useState<Emi | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [referenceNo, setReferenceNo] = useState("");
  const [processing, setProcessing] = useState(false);

  const handleSearch = async () => {
    if (!phone.trim()) {
      setError("Phone is required.");
      return;
    }

    try {
      setError("");
      setLoading(true);

      const data = (await apiFetch(
        `/cashier/pending-emis/?phone=${phone}`
      )) as PendingEmiResponse;

      if (!data?.emis || data.emis.length === 0) {
        setCustomerName("");
        setEmis([]);
        setError("No pending EMIs found.");
        return;
      }

      const normalized: Emi[] = data.emis.map((emi) => ({
        id: emi.id,
        month_no: emi.month_no,
        due_date: emi.due_date,
        amount: Number(emi.amount),
        status: emi.status,
      }));

      setCustomerName(data.customer || "");
      setEmis(normalized);
    } catch {
      setCustomerName("");
      setEmis([]);
      setError("Customer not found.");
    } finally {
      setLoading(false);
    }
  };

  const openPaymentModal = (emi: Emi) => {
    setSelectedEmi(emi);
    setPaymentAmount(String(emi.amount));
    setPaymentMethod("CASH");
    setReferenceNo("");
  };

  const closeModal = () => {
    setSelectedEmi(null);
    setPaymentAmount("");
    setReferenceNo("");
  };

  const submitPayment = async () => {
    if (!selectedEmi) return;

    const amount = Number(paymentAmount);

    if (Number.isNaN(amount) || amount <= 0) {
      alert("Invalid amount.");
      return;
    }

    if (amount > selectedEmi.amount) {
      alert("Amount exceeds remaining balance.");
      return;
    }

    if (paymentMethod !== "CASH" && !referenceNo.trim()) {
      alert("Reference number is required for UPI/BANK.");
      return;
    }

    try {
      setProcessing(true);

      await apiFetch("/cashier/collect-payment/", {
        method: "POST",
        body: JSON.stringify({
          emi_id: selectedEmi.id,
          amount,
          method: paymentMethod,
          reference_no: referenceNo || "",
          payment_date: new Date().toISOString().split("T")[0],
        }),
      });

      alert("Payment recorded successfully.");
      closeModal();
      await handleSearch();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Payment failed.";
      alert(message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["CASHIER", "ADMIN"]}>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">EMI Collection</h1>

        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Enter customer phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="border rounded px-3 py-2 w-full"
          />
          <button
            onClick={handleSearch}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Search
          </button>
        </div>

        {error && <p className="text-red-600">{error}</p>}
        {loading && <p>Loading...</p>}

        {customerName && emis.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mt-4">Customer: {customerName}</h2>

            <table className="w-full border mt-4 text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2">Month</th>
                  <th className="border p-2">Due Date</th>
                  <th className="border p-2">Balance</th>
                  <th className="border p-2">Action</th>
                </tr>
              </thead>

              <tbody>
                {emis.map((emi) => (
                  <tr key={emi.id}>
                    <td className="border p-2">{emi.month_no}</td>
                    <td className="border p-2">{emi.due_date}</td>
                    <td className="border p-2">₹ {emi.amount}</td>
                    <td className="border p-2">
                      <button
                        onClick={() => openPaymentModal(emi)}
                        className="text-blue-600"
                      >
                        Collect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedEmi && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
            <div className="bg-white p-6 rounded w-96 space-y-4">
              <h2 className="text-lg font-semibold">Collect EMI - Month {selectedEmi.month_no}</h2>

              <p>Total Due: ₹ {selectedEmi.amount}</p>

              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="border rounded px-3 py-2 w-full"
                placeholder="Enter amount"
              />

              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="border rounded px-3 py-2 w-full"
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK">Bank</option>
              </select>

              {paymentMethod !== "CASH" && (
                <input
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  className="border rounded px-3 py-2 w-full"
                  placeholder="Reference Number"
                />
              )}

              <div className="flex justify-end gap-3">
                <button onClick={closeModal} className="px-4 py-2 border rounded">
                  Cancel
                </button>

                <button
                  onClick={submitPayment}
                  disabled={processing}
                  className="px-4 py-2 bg-green-600 text-white rounded"
                >
                  {processing ? "Processing..." : "Submit Payment"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
