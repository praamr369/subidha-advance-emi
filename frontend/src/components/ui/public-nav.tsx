import Link from "next/link";

const links = [
  { href: "/", label: "Home" },

  { href: "/products", label: "Products" },

  { href: "/about", label: "About" },
  { href: "/lucky-plan", label: "Lucky Plan" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/vision-trust", label: "Vision & Trust" },

  { href: "/winners", label: "Winners" },
  { href: "/winner-history", label: "Winner History" },
  { href: "/contact", label: "Contact" },
  { href: "/register", label: "Register" },
 

 

  { href: "/auth/login", label: "Login" },

];

export default function PublicNav() {
  return (
    <nav style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
      {links.map((link) => (
        <Link key={link.href} href={link.href} style={{ color: "#1f2937", textDecoration: "none", fontWeight: 600 }}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
