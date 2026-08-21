import { redirect } from "next/navigation";

export default function RedirectPolicySlugPage({ params }: { params: { slug: string } }) {
  redirect(`/admin/settings/compliance-policies/${params.slug}`);
}
