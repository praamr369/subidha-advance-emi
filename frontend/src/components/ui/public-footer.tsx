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
    <footer className="border-t border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
        <div className="max-w-xl">
          <BrandLockup
            subtitle={`${brandConfig.publicProgramName} public catalogue, enquiry capture, and winner transparency`}
          />
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Public information, product browsing, application capture, and winner
            transparency for the Subidha Furniture Lucky Plan in{" "}
            {brandConfig.publicBranchLocation}.
          </p>
        </div>

        <div className="grid gap-2 text-sm">
          <div className="font-medium text-foreground">Quick links</div>
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground transition hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="max-w-sm text-sm">
          <div className="font-medium text-foreground">Visit the branch</div>
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
