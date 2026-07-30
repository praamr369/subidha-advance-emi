# Product ↔ PIM ↔ Inventory Merge Plan

**Status:** PLAN ONLY — no code written yet. Review and confirm before build.
**Date:** 2026-07-25

---

## 1. The problem, in one line

You have **one operational product record** (`subscriptions.Product`) that drives every action (inventory, subscription, EMI, rent, lease, direct sale) but **can't do rich editing**, and a **separate PIM catalogue** (`products_pim`) that *can* do rich editing (attributes, profiles, variants) but doesn't drive any operations. They live in two disconnected tables, so you edit in one place and operate from another. That split is the confusion.

**Goal:** create → edit → finalize a product in **one place** with full PIM richness, in **one linked database**, then flow it into inventory (stock, movements, valuation) and switch on sell/subscription/EMI/rent/lease.

---

## 2. What exists today (verified against your live DB)

| Layer | Model | Count | What it does | What it lacks |
|---|---|---:|---|---|
| **Operational master** | `subscriptions.Product` | 257 | `product_code`, price, GST/HSN, `base_specs` (plain JSON), and all action flags: `is_emi_enabled`, `is_rent_enabled`, `is_lease_enabled`, `is_direct_sale_enabled`, `lifecycle_status`, `inventory_profile`, warranty | No structured attributes, no attribute profiles, no SKU variants |
| **PIM catalogue** | `products_pim.PimProduct` | 257 | Rich editing machinery (below) | Drives no operations; no FK to the master |
| **Inventory** | `inventory.InventoryItem` | 257 | Stock on hand, movements, valuation | — (already FK-linked 1:1 to `Product`) |

**PIM machinery (the editing power you want):**
```
ProductCategory → ProductSubcategory
   → CategoryAttribute (defines which attributes a category has, + data_type)
        → AttributeOption (allowed values for that attribute)
PimProduct
   → ProductAttribute      (this product's attribute values)
   → ProductVariant (sku, barcode)
        → VariantAttributeValue (variant-level attribute values)
```

**Current linkage:**
- Inventory ↔ Product: **hard FK** (`InventoryItem.product`), 1:1, 257↔257. Solid.
- PIM ↔ Product: **no FK** — matched only by `code` string, 257↔257 today, but drift-prone (rename a code and the twin silently orphans).

---

## 3. Recommended architecture — "Link, then embed"

**Keep `subscriptions.Product` as the single operational master.** Attach PIM's editing machinery to it, and edit everything from the Product module. This is the smallest, lowest-risk path with zero data loss (the 257 already match by code).

### 3a. Schema change (one FK + backfill)
1. Add `PimProduct.source_product = ForeignKey(subscriptions.Product, null=True, on_delete=PROTECT, related_name="pim")`.
2. **Data migration**: backfill by matching `PimProduct.code == Product.product_code` (verified: 257 matched, 0 orphans → clean backfill).
3. After backfill, `Product.pim` gives every product its PIM record with attributes + variants. No PimProduct data is moved or deleted.

*Why not fully unify onto one table?* That means re-pointing `ProductAttribute`, `ProductVariant`, `CategoryAttribute` at `Product` and retiring `PimProduct` — a much larger migration touching every PIM endpoint and page, for the same end-user result. The FK link gets you "one product, one place to edit" without that risk. (This was option "Unify"; the plan recommends "Link".)

### 3b. Backend
- Auto-create/link a `PimProduct` whenever a `Product` is created (signal or service), so every new product is immediately PIM-editable. Uses the existing `sync_from_register` logic you already have.
- Expose the PIM attribute/variant editing endpoints keyed by `product_id` (thin wrappers over the existing `products_pim` viewsets), so the Product module frontend can read/write attributes and variants for a product without knowing the PimProduct id.
- Keep all operational writes (price, flags, lifecycle, inventory profile) on `Product` where they already are.

### 3c. Frontend — one edit experience
- **Product create** (`/admin/products/create`): after the core fields, embed the PIM category-attribute form (driven by `CategoryAttribute` for the chosen category) + a variants section. One save writes the Product **and** its PIM attributes/variants.
- **Product edit** (`/admin/products/[id]/edit`): same embedded PIM editor inline — this is the "I can't edit like PIM" gap, closed.
- **`/admin/pim/products`**: becomes a redirect into the Product module (same pattern as the vendors consolidation), OR is kept as an advanced bulk-attribute view — your call. Recommendation: redirect, so there is exactly one product surface.
- **CSV import** (`/admin/products/import`): extend to also populate PIM attributes from columns, so your existing CSV list loads with attributes in one pass.

### 3d. The flow (this is the part you said you'll describe — see §5)
Proposed default, to be replaced by your description:
```
Create (draft, PIM attributes) → Edit freely → Finalize (lock master)
   → Assign inventory profile → stock goes live (qty, movements, valuation)
   → Switch on actions: direct sale / subscription / EMI / rent / lease
```

---

## 4. Build steps (once approach + flow are confirmed)

1. Migration: add `source_product` FK + backfill 257 by code. *(reversible)*
2. Auto-link service + signal on Product create.
3. Backend: product-keyed attribute/variant read+write endpoints.
4. Frontend: embed PIM attribute/variant editor into product create + edit.
5. CSV import: map attribute columns.
6. Lifecycle gating per your §5 description.
7. Redirect `/admin/pim/products` → product module (optional, confirm).
8. Tests: backfill correctness, create→attributes→finalize→inventory flow, no orphan PIM rows.

Each step is independently verifiable; nothing is deleted until the linked flow is proven.

---

## 5. OPEN — the lifecycle flow (your input needed)

You chose to describe this yourself. Please spell out the exact stages and gates, e.g.:
- What states does a product move through? (Draft → Finalized → Inventory-ready → Live?)
- What must be true to **finalize**? (all required category attributes filled? price set?)
- Does **finalize lock** the master, or stay editable?
- What makes it **inventory-ready** / go live in stock?
- Which actions unlock when (direct sale vs subscription vs EMI vs rent vs lease)?

I'll fold your answer into §3d and §4.6 and produce the final build-ready plan.

---

## 6. Risks & safeguards
- **Migration is additive + reversible** — a nullable FK and a backfill; no column drops, no PimProduct deletion.
- **Drift eliminated** — after the FK, code renames can't orphan a PIM twin.
- **Operational truth unchanged** — all `is_*_enabled` / inventory / subscription behavior stays on `Product`; we only *add* editing.
- **Rollback** — drop the FK; PIM and Product return to code-matched independence.

---

## 7. What I need from you to finalize
1. Confirm **"Link, then embed"** (recommended) vs "Unify onto one model".
2. Describe the **lifecycle flow** (§5).
3. Confirm whether `/admin/pim/products` should **redirect** into the product module or stay as an advanced view.
