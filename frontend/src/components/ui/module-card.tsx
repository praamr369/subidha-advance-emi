import Link from "next/link";

type ModuleCardProps = {
  title: string;
  description: string;
  href: string;
  cta?: string;
};

export default function ModuleCard({
  title,
  description,
  href,
  cta = "Open",
}: ModuleCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <Link
        href={href}
        className="mt-4 inline-flex rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white"
      >
        {cta}
      </Link>
    </article>
  );
}
