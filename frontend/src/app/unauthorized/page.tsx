// frontend/src/app/unauthorized/page.tsx
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { AuthBrand } from "@/components/auth";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-lg rounded-[28px] border border-slate-300 bg-white p-7 text-center shadow-[0_26px_60px_-42px_rgba(15,23,42,0.36)] sm:p-8">
        <AuthBrand compact className="mb-5 flex justify-center" />

        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-700">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">Access denied</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          You do not have permission to view this page. Please contact your administrator if you believe this is a mistake.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Sign in
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
          >
            Go to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
