import Link from "next/link";
import { AlertCircle } from "lucide-react";

import PublicFooter from "@/components/ui/public-footer";
import PublicNav from "@/components/ui/public-nav";
import { ROUTES } from "@/lib/routes";

export default function ProductNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicNav />
      <main className="container mx-auto flex-1 px-4 py-16 text-center">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Product Not Found</h1>
          <p className="mt-2 text-muted-foreground">
            The product you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
          <Link
            href={ROUTES.public.products}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground transition hover:opacity-95"
          >
            Browse Products
          </Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
