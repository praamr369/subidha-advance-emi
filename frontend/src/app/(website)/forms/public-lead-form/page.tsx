"use client";

import { useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch } from "@/lib/api";

const publicLeadSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().regex(/^[0-9]{10}$/, "Enter a valid 10-digit phone number"),
  email: z.string().email("Enter a valid email address"),
  city: z.string().min(1, "City is required"),
  interested_product: z.string().optional().default(""),
  preferred_emi_amount: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

type PublicLeadFormValues = z.infer<typeof publicLeadSchema>;

export default function PublicLeadFormPage() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedPhone, setSubmittedPhone] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<PublicLeadFormValues>({
    resolver: zodResolver(publicLeadSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      city: "",
      interested_product: "",
      preferred_emi_amount: "",
      notes: "",
    },
  });

  async function onSubmit(data: PublicLeadFormValues) {
    setLoading(true);
    setError(null);

    try {
      await apiFetch("/api/v1/public/leads/", {
        method: "POST",
        body: data,
      });

      setSubmittedPhone(data.phone);
      setSubmitted(true);
      reset();
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
            <strong>{submittedPhone}</strong>.
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
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" aria-label="Product enquiry form">
            {/* Name */}
            <div>
              <label htmlFor="lead-name" className="block text-sm font-medium text-gray-700 mb-2">
                Full Name *
              </label>
              <input
                id="lead-name"
                type="text"
                {...register("name")}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your name"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-600">{errors.name?.message}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="lead-phone" className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number * (10 digits)
              </label>
              <input
                id="lead-phone"
                type="tel"
                {...register("phone")}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="9876543210"
              />
              {errors.phone && (
                <p className="mt-1 text-xs text-red-600">{errors.phone?.message}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="lead-email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address *
              </label>
              <input
                id="lead-email"
                type="email"
                {...register("email")}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="your@email.com"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">{errors.email?.message}</p>
              )}
            </div>

            {/* City */}
            <div>
              <label htmlFor="lead-city" className="block text-sm font-medium text-gray-700 mb-2">
                City *
              </label>
              <input
                id="lead-city"
                type="text"
                {...register("city")}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your city"
              />
              {errors.city && (
                <p className="mt-1 text-xs text-red-600">{errors.city?.message}</p>
              )}
            </div>

            {/* Product Interest */}
            <div>
              <label htmlFor="lead-product" className="block text-sm font-medium text-gray-700 mb-2">
                Product/Service Interest
              </label>
              <input
                id="lead-product"
                type="text"
                {...register("interested_product")}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="E.g., Laptop, Phone, Electronics"
              />
              {errors.interested_product && (
                <p className="mt-1 text-xs text-red-600">{errors.interested_product?.message}</p>
              )}
            </div>

            {/* EMI Amount */}
            <div>
              <label htmlFor="lead-emi" className="block text-sm font-medium text-gray-700 mb-2">
                Preferred Monthly EMI (Optional)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-3 text-gray-500" aria-hidden="true">₹</span>
                <input
                  id="lead-emi"
                  type="number"
                  {...register("preferred_emi_amount")}
                  className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="5000"
                />
              </div>
              {errors.preferred_emi_amount && (
                <p className="mt-1 text-xs text-red-600">{errors.preferred_emi_amount?.message}</p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="lead-notes" className="block text-sm font-medium text-gray-700 mb-2">
                Additional Comments
              </label>
              <textarea
                id="lead-notes"
                {...register("notes")}
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Tell us more about your requirements..."
              />
              {errors.notes && (
                <p className="mt-1 text-xs text-red-600">{errors.notes?.message}</p>
              )}
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
