import Link from "next/link";

import BrandLockup from "@/components/public/BrandLockup";
import { brandConfig } from "@/config/brand";
import { ROUTES } from "@/lib/routes";

const footerLinks = [
  { href: ROUTES.public.products, label: "Products" },
  { href: ROUTES.public.apply, label: "Apply" },
  { href: ROUTES.public.winnerHistory, label: "Winner History" },
  { href: ROUTES.public.contact, label: "Contact" },
  { href: ROUTES.public.login, label: "Login" },
  { href: ROUTES.public.register, label: "Register" },
];

export default function PublicFooter() {
  return (
    <footer className="border-t border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.94))]">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.25fr_0.75fr_0.9fr] lg:px-8">
        <div className="max-w-xl rounded-2xl border border-white/75 bg-white/82 p-4 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.5)]">
          <BrandLockup
            subtitle={`${brandConfig.publicProgramName} public catalogue, enquiry capture, and winner transparency`}
          />
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Public information, product browsing, application capture, and winner
            transparency for the Subidha Furniture Lucky Plan in{" "}
            {brandConfig.publicBranchLocation}.
          </p>
        </div>

        <div className="rounded-2xl border border-white/75 bg-white/82 p-4 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.5)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Quick links
          </div>
          <div className="mt-3 grid gap-2 text-sm">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-2 py-1.5 text-muted-foreground transition hover:bg-[var(--surface-muted)] hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="max-w-sm rounded-2xl border border-white/75 bg-white/82 p-4 text-sm shadow-[0_16px_34px_-24px_rgba(15,23,42,0.5)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Visit the branch
          </div>
          <p className="mt-2 text-muted-foreground">
            {brandConfig.companyName}
            <br />
            {brandConfig.publicBranchLocation}
          </p>
          <p className="mt-3 text-muted-foreground">
            Need a new enrollment or product enquiry? Use the online application
            form, or visit the branch with your product preference and phone number.
          </p>
        </div>
      </div>
    </footer>
  );
}
