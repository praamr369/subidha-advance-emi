"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { listPublicProducts } from "@/services/public";
import type { PublicProduct } from "@/services/public";
import { ROUTES } from "@/lib/routes";

// Static routes that can be searched locally
const STATIC_PAGES = [
  { title: "FAQ & Help", href: ROUTES.public.faq, type: "Page" },
  { title: "Contact Us", href: ROUTES.public.contact, type: "Page" },
  { title: "About Subidha", href: ROUTES.public.about, type: "Page" },
  { title: "Legal Disclaimer", href: ROUTES.public.legalDisclaimer, type: "Policy" },
  { title: "How it Works", href: ROUTES.public.howItWorks, type: "Page" },
];

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search for products
  useEffect(() => {
    if (!query.trim()) {
      setProducts([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const res = await listPublicProducts({ search: query, limit: 5 });
        setProducts(res.products);
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const filteredStatic = STATIC_PAGES.filter(
    (page) =>
      page.title.toLowerCase().includes(query.toLowerCase()) ||
      page.type.toLowerCase().includes(query.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setIsOpen(false);
      // Navigate to products page with search query
      router.push(`${ROUTES.public.products}?search=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <div className="relative w-full max-w-xl" ref={containerRef}>
      <form
        onSubmit={handleSubmit}
        className="flex h-11 w-full items-center overflow-hidden rounded-full border border-border/80 bg-background focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all shadow-sm"
      >
        <div className="flex h-full items-center justify-center pl-4 pr-2 text-muted-foreground">
          <Search className="h-5 w-5" />
        </div>
        <input
          type="text"
          placeholder="Search for furniture, appliances, or help..."
          className="h-full w-full bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setProducts([]);
            }}
            className="flex h-full items-center justify-center px-4 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {/* Autocomplete Dropdown */}
      {isOpen && query.trim() && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-50 w-full min-w-[300px] sm:min-w-[450px] max-w-[100vw] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="max-h-[70vh] overflow-y-auto p-2">
            
            {isLoading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="ml-2 text-sm">Searching catalog...</span>
              </div>
            )}

            {!isLoading && products.length > 0 && (
              <div className="mb-2">
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Products
                </div>
                {products.map((p) => (
                  <Link
                    key={p.id}
                    href={`${ROUTES.public.products}/${p.id}`}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted"
                  >
                    {p.image ? (
                      <img src={p.image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                        <Search className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{p.category}</span>
                    </div>
                  </Link>
                ))}
                <Link
                  href={`${ROUTES.public.products}?search=${encodeURIComponent(query.trim())}`}
                  onClick={() => setIsOpen(false)}
                  className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  View all results for "{query}"
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}

            {!isLoading && filteredStatic.length > 0 && (
              <div>
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Pages & Information
                </div>
                {filteredStatic.map((page) => (
                  <Link
                    key={page.href}
                    href={page.href}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-muted"
                  >
                    <span className="text-sm font-medium text-foreground">{page.title}</span>
                    <span className="text-xs text-muted-foreground">{page.type}</span>
                  </Link>
                ))}
              </div>
            )}

            {!isLoading && products.length === 0 && filteredStatic.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No results found for "{query}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
