import type { Metadata } from "next";

import BlogCard from "@/components/public/BlogCard";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import { getAllBlogPosts } from "@/lib/blog-data";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Plain-language articles about Lucky Plan rules, monthly winner transparency, and choosing furniture with a structured payment plan.",
};

export default function BlogIndexPage() {
  const posts = getAllBlogPosts();

  return (
    <PublicPageShell
      title="Blog"
      subtitle="Clear, practical writing about the Lucky Plan model, winner transparency, and choosing furniture with a monthly plan."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Blog" },
      ]}
      actions={[
        { label: "Browse Products", href: ROUTES.public.products, variant: "secondary" },
        { label: "Contact", href: ROUTES.public.contact, variant: "primary" },
      ]}
    >
      <section className="space-y-4 rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <SectionHeader
          eyebrow="Articles"
          title="Helpful guides, not hype"
          description="No fake testimonials, no inflated statistics—just useful explanations that match how Lucky Plan works in the real shop workflow."
        />
        <div className="grid gap-6 lg:grid-cols-3">
          {posts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      </section>
    </PublicPageShell>
  );
}

