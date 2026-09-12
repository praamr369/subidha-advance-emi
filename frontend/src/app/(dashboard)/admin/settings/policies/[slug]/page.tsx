import { redirect } from "next/navigation";

export default async function RedirectPolicySlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/admin/settings/compliance-policies/${slug}`);
}
