"use client";

import Link from "next/link";
import { useState } from "react";
import { formatRupee } from "@/lib/utils/currency";
import { ROUTES } from "@/lib/routes";

export interface CustomerDetails {
  id?: number | string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  customerSince?: string;
  status?: "active" | "inactive" | "suspended";
  verificationStatus?: "verified" | "pending" | "unverified";
  totalSpent?: number;
  lastOrderDate?: string;
}

interface CustomerDetailsCardProps {
  customer: CustomerDetails | null;
  isLoading?: boolean;
  onClose?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getStatusColor(status?: string) {
  switch (status) {
    case "active":
      return { bg: "bg-emerald-100", text: "text-emerald-800", dot: "bg-emerald-500" };
    case "inactive":
      return { bg: "bg-slate-100", text: "text-slate-800", dot: "bg-slate-500" };
    case "suspended":
      return { bg: "bg-red-100", text: "text-red-800", dot: "bg-red-500" };
    default:
      return { bg: "bg-blue-100", text: "text-blue-800", dot: "bg-blue-500" };
  }
}

export default function CustomerDetailsCard({
  customer,
  isLoading = false,
  onClose,
}: CustomerDetailsCardProps) {
  if (isLoading) {
    return (
      <div className="w-96 space-y-3 rounded-xl border border-border bg-background p-4 shadow-lg">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-3 w-48 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!customer) {
    return null;
  }

  const statusColor = getStatusColor(customer.status);
  const initials = getInitials(customer.name || "U");

  return (
    <div className="w-96 space-y-4 rounded-2xl border border-border bg-background p-5 shadow-xl ring-1 ring-black/5">
      {/* Header with close button */}
      <div className="flex items-start justify-between">
        <div className="text-xs font-bold uppercase text-muted-foreground">Customer Details</div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-muted transition"
          >
            <svg className="h-4 w-4 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {/* Customer Avatar & Name */}
      <Link href={customer.id ? `${ROUTES.admin.customers}/${customer.id}` : "#"} className="flex items-center gap-3 hover:opacity-80 transition">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full font-bold text-white ${
          customer.status === "active" ? "bg-gradient-to-br from-blue-500 to-blue-600" :
          customer.status === "suspended" ? "bg-gradient-to-br from-red-500 to-red-600" :
          "bg-gradient-to-br from-slate-500 to-slate-600"
        }`}>
          {initials}
        </div>
        <div className="flex-1">
          <div className="font-bold text-primary hover:underline">{customer.name || "Unknown"}</div>
          <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor.bg} ${statusColor.text} mt-1`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusColor.dot}`} />
            {(customer.status || "active").charAt(0).toUpperCase() + (customer.status || "active").slice(1)}
          </div>
        </div>
      </Link>

      {/* Contact Information */}
      <div className="space-y-3 border-t border-border pt-4">
        {/* Phone */}
        {customer.phone && (
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
              <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773c.358.577.888 1.379 1.613 2.104.725.726 1.527 1.256 2.104 1.613l.773-1.548a1 1 0 011.06-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 4 14.18 4 9.5V5a1 1 0 011-1h2.153z" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground">Phone</div>
              <a href={`tel:${customer.phone}`} className="text-sm font-medium text-blue-600 hover:underline">
                {customer.phone}
              </a>
            </div>
          </div>
        )}

        {/* Email */}
        {customer.email && (
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
              <svg className="h-4 w-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-muted-foreground">Email</div>
              <a href={`mailto:${customer.email}`} className="text-sm font-medium text-blue-600 hover:underline truncate">
                {customer.email}
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Address Information */}
      {(customer.address || customer.city || customer.pincode) && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100">
              <svg className="h-4 w-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-muted-foreground">Address</div>
              <div className="text-sm font-medium text-foreground">
                {customer.address && <div>{customer.address}</div>}
                {(customer.city || customer.state || customer.pincode) && (
                  <div className="text-xs text-muted-foreground">
                    {[customer.city, customer.state, customer.pincode]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Timeline & Stats */}
      {(customer.customerSince || customer.verificationStatus || customer.totalSpent) && (
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
          {customer.customerSince && (
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs font-semibold text-muted-foreground">Customer Since</div>
              <div className="mt-1 text-sm font-bold text-foreground">
                {new Date(customer.customerSince).toLocaleDateString("en-IN", {
                  year: "numeric",
                  month: "short",
                })}
              </div>
            </div>
          )}

          {customer.verificationStatus && (
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs font-semibold text-muted-foreground">Verification</div>
              <div className={`mt-1 inline-flex items-center gap-1 text-xs font-bold ${
                customer.verificationStatus === "verified" ? "text-emerald-600" :
                customer.verificationStatus === "pending" ? "text-amber-600" :
                "text-red-600"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  customer.verificationStatus === "verified" ? "bg-emerald-500" :
                  customer.verificationStatus === "pending" ? "bg-amber-500" :
                  "bg-red-500"
                }`} />
                {customer.verificationStatus.charAt(0).toUpperCase() + customer.verificationStatus.slice(1)}
              </div>
            </div>
          )}

          {customer.totalSpent && (
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs font-semibold text-muted-foreground">Total Spent</div>
              <div className="mt-1 text-sm font-bold text-foreground">
                {formatRupee(customer.totalSpent)}
              </div>
            </div>
          )}

          {customer.lastOrderDate && (
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs font-semibold text-muted-foreground">Last Order</div>
              <div className="mt-1 text-sm font-bold text-foreground">
                {new Date(customer.lastOrderDate).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer note */}
      <div className="border-t border-border pt-3 text-xs text-muted-foreground text-center">
        Click name to view full profile
      </div>
    </div>
  );
}
