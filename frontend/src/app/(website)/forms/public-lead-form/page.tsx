"use client";

import { useState } from "react";
import Link from "next/link";

export default function PublicLeadFormPage() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    city: "",
    interested_product: "",
    preferred_emi_amount: "",
    notes: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/crm-pipeline/leads/public/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error("Failed to submit form");
      }

      setSubmitted(true);
      setFormData({
        name: "",
        phone: "",
        email: "",
        city: "",
        interested_product: "",
        preferred_emi_amount: "",
        notes: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <div className="text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Thank you!</h1>
          <p className="text-gray-600 mb-6">
            Your enquiry has been received. Our team will contact you soon at{" "}
            <strong>{formData.phone}</strong>.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Expected response time: 24-48 hours
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Product Enquiry Form
          </h1>
          <p className="text-gray-600 mb-8">
            Tell us about your interest. We'll provide a personalized quote within 24 hours.
          </p>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your name"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number * (10 digits)
              </label>
              <input
                type="tel"
                required
                pattern="[0-9]{10}"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="9876543210"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="your@email.com"
              />
            </div>

            {/* City */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                City *
              </label>
              <input
                type="text"
                required
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your city"
              />
            </div>

            {/* Product Interest */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Product/Service Interest
              </label>
              <input
                type="text"
                value={formData.interested_product}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    interested_product: e.target.value,
                  })
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="E.g., Laptop, Phone, Electronics"
              />
            </div>

            {/* EMI Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preferred Monthly EMI (Optional)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-3 text-gray-500">₹</span>
                <input
                  type="number"
                  value={formData.preferred_emi_amount}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      preferred_emi_amount: e.target.value,
                    })
                  }
                  className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="5000"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Comments
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Tell us more about your requirements..."
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition"
            >
              {loading ? "Submitting..." : "Submit Enquiry"}
            </button>

            <p className="text-xs text-gray-500 text-center">
              We'll never share your information. See our{" "}
              <Link href="/privacy" className="text-blue-600 hover:underline">
                privacy policy
              </Link>
              .
            </p>
          </form>
        </div>

        {/* FAQ Section */}
        <div className="mt-12 grid gap-6">
          <div className="bg-white rounded-xl p-6 shadow">
            <h3 className="font-semibold text-gray-900 mb-2">
              How long does it take to get a quote?
            </h3>
            <p className="text-gray-600 text-sm">
              Our team reviews all enquiries within 24-48 hours and sends a personalized quote.
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow">
            <h3 className="font-semibold text-gray-900 mb-2">
              Do I need to create an account?
            </h3>
            <p className="text-gray-600 text-sm">
              Not yet! We'll contact you first. Once you're interested, you can register to accept quotes and process orders.
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow">
            <h3 className="font-semibold text-gray-900 mb-2">
              Can I change my requirements later?
            </h3>
            <p className="text-gray-600 text-sm">
              Absolutely! You can modify your preferences when discussing with our team.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
