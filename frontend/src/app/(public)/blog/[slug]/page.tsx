import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import BlogArticle from "@/components/public/BlogArticle";
import BlogCard from "@/components/public/BlogCard";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import {
  getAllBlogPosts,
  getBlogPostBySlug,
  getReadingTimeMinutes,
  getRelatedBlogPosts,
} from "@/lib/blog-data";
import { ROUTES } from "@/lib/routes";

type BlogDetailPageProps = {
  params: Promise<{ slug: string }>;
};

function formatPublishedAt(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export async function generateStaticParams() {
  return getAllBlogPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: BlogDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) {
    return {
      title: "Article Not Found",
      description: "The requested blog article could not be found.",
    };
  }

  return {
    title: post.title,
    description: post.description,
  };
}

export default async function BlogDetailPage({ params }: BlogDetailPageProps) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();

  const readingTime = getReadingTimeMinutes(post);
  const related = getRelatedBlogPosts(slug, 3);

  return (
    <PublicPageShell
      title={post.title}
      subtitle={post.description}
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Blog", href: ROUTES.public.blog },
        { label: "Article" },
      ]}
      actions={[
        { label: "Browse Products", href: ROUTES.public.products, variant: "secondary" },
        { label: "Apply", href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <section className="rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {formatPublishedAt(post.publishedAt)} · {readingTime} min read
          </div>
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full border border-white/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      <BlogArticle blocks={post.blocks} />

      <section className="space-y-4 rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <SectionHeader
          eyebrow="Next"
          title="Related articles"
          description="More plain-language guidance on Lucky Plan rules and customer trust."
        />
        <div className="grid gap-6 lg:grid-cols-3">
          {related.map((relatedPost) => (
            <BlogCard key={relatedPost.slug} post={relatedPost} />
          ))}
        </div>
        <div>
          <Link
            href={ROUTES.public.blog}
            className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-white"
          >
            Back to blog index
          </Link>
        </div>
      </section>
    </PublicPageShell>
  );
}

