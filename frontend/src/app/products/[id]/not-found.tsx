import Link from "next/link";
import { AlertCircle } from "lucide-react";

import PublicFooter from "@/components/ui/public-footer";
import PublicNav from "@/components/ui/public-nav";
import { ROUTES } from "@/lib/routes";

export default function ProductNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]">
      <PublicNav />
      <main className="mx-auto flex w-full max-w-[1320px] flex-1 px-4 py-16 text-center sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md rounded-[2rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-8 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.78)]">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-red-200/80 bg-red-50 text-destructive shadow-[0_18px_40px_-30px_rgba(15,23,42,0.62)]">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Product Not Found</h1>
          <p className="mt-2 text-muted-foreground">
            The product you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
          <Link
            href={ROUTES.public.products}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-6 text-sm font-medium text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.84)] transition hover:-translate-y-0.5"
          >
            Browse Products
          </Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
