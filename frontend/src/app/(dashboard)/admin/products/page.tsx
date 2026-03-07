"use client";

import { type FormEvent, useEffect, useState } from "react";

import PortalPage from "@/components/ui/portal-page";
import { apiFetch, toArray } from "@/lib/api";

type Product = {
  id: number;
  product_code: string;
  name: string;
  base_price: string;
};

type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  source?: string;
};

const defaultForm = {
  product_code: "",
  name: "",
  base_price: "",
};

function toError(error: unknown): string {
  if (!(error instanceof Error)) return "Request failed";
  const msg = error.message?.trim() || "Request failed";
  try {
    const parsed = JSON.parse(msg) as Record<string, string[] | string>;
    const first = Object.values(parsed)[0];
    if (Array.isArray(first) && first[0]) return first[0];
    if (typeof first === "string") return first;
  } catch {
    return msg;
  }
  return msg;
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  async function loadProducts(): Promise<void> {
    const response = await apiFetch("/admin/products/");
    setProducts(toArray<Product>(response));
  }

  useEffect(() => {
    let cancelled = false;

    loadProducts()
      .catch((fetchError) => {
        if (cancelled) return;
        setError(toError(fetchError));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      await apiFetch("/admin/products/", {
        method: "POST",
        body: JSON.stringify({
          product_code: form.product_code.trim(),
          name: form.name.trim(),
          base_price: Number(form.base_price),
        }),
      });

      setForm(defaultForm);
      await loadProducts();
    } catch (submitError) {
      setError(toError(submitError));
    } finally {
      setSaving(false);
    }
  }

  async function onImportCsv(): Promise<void> {
    setError(null);
    setImportMessage(null);
    setImporting(true);

    try {
      const formData = new FormData();
      if (csvFile) formData.append("file", csvFile);

      const result = (await apiFetch("/admin/products/import-csv/", {
        method: "POST",
        body: formData,
      })) as ImportResult;

      await loadProducts();

      setImportMessage(
        `CSV import completed (${result.source ?? "unknown"}): ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`
      );
    } catch (importError) {
      setError(toError(importError));
    } finally {
      setImporting(false);
    }
  }

  return (
    <PortalPage title="Products" subtitle="Upload products.csv and manage product list.">
      <section style={{ marginBottom: 16, border: "1px solid #e5e7eb", borderRadius: 8, padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>Bulk Import</h2>
        <p style={{ marginTop: 4, color: "#4b5563" }}>
          Upload CSV from frontend (or import default <code>backend/products.csv</code> when no file selected).
        </p>

        <input type="file" accept=".csv,text/csv" onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)} />
        <button type="button" onClick={onImportCsv} disabled={importing}>
          {importing ? "Importing CSV..." : "Upload & Import CSV via API"}
        </button>

        {importMessage ? <p style={{ color: "#166534" }}>{importMessage}</p> : null}
      </section>

      <section style={{ marginBottom: 16, border: "1px solid #e5e7eb", borderRadius: 8, padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>Add Product</h2>

        <form onSubmit={onCreate} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <input
            required
            placeholder="Product code"
            value={form.product_code}
            onChange={(event) => setForm((prev) => ({ ...prev, product_code: event.target.value }))}
          />
          <input required placeholder="Product name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
          <input
            required
            type="number"
            min={1}
            placeholder="Base price"
            value={form.base_price}
            onChange={(event) => setForm((prev) => ({ ...prev, base_price: event.target.value }))}
          />
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Product"}
          </button>
        </form>
      </section>

      {loading ? <p>Loading products...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {!loading && !error ? (
        <>
          <p style={{ marginTop: 0, color: "#374151" }}>
            Total products: <b>{products.length}</b>
          </p>

          <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Code</th>
                <th>Name</th>
                <th>Base Price</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.id}</td>
                  <td>{product.product_code}</td>
                  <td>{product.name}</td>
                  <td>₹{product.base_price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </PortalPage>
  );
}