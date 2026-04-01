import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <Link href="/" className="mt-3 inline-block rounded border px-3 py-1">Go Home</Link>
      </div>
    </div>
  );
}
