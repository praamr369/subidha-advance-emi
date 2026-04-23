// frontend/src/app/unauthorized/page.tsx
import { ShieldAlert } from "lucide-react";

import { AuthBrand } from "@/components/auth";
import ActionButton from "@/components/ui/ActionButton";

export default function UnauthorizedPage() {
  return (
    <div className="public-app flex min-h-screen items-center justify-center p-4">
      <div className="auth-stage w-full max-w-3xl">
        <div className="auth-shell overflow-hidden p-7 sm:p-8">
          <AuthBrand compact className="mb-5 flex justify-center" />

          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.4rem] border border-red-200 bg-red-50 text-red-700 shadow-[0_18px_38px_-30px_rgba(127,29,29,0.42)]">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h1 className="text-center text-2xl font-semibold text-slate-900">Access denied</h1>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm leading-6 text-slate-600">
            You do not have permission to view this page. Please contact your administrator if you believe this is a mistake.
          </p>

          <div className="workspace-filter-bar mx-auto mt-6 max-w-2xl p-4 text-left">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Why you are here</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The current session does not match the required role or allowed route scope. Existing auth, role guard, and redirect rules remain unchanged.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <ActionButton href="/login" variant="primary" size="lg">
              Sign in
            </ActionButton>
            <ActionButton href="/" variant="outline" size="lg">
              Go to Home
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}
