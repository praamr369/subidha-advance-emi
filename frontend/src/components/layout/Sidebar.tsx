"use client";

import Link from "next/link";

export default function Sidebar({ links }: { links: { href: string; label: string }[] }) {
  return (
    <aside style={{ width: 220, borderRight: "1px solid #e5e7eb", padding: 12 }}>
      {links.map((link) => (
        <div key={link.href} style={{ marginBottom: 8 }}>
          <Link href={link.href}>{link.label}</Link>
        </div>
      ))}
    </aside>
  );
}
