# Vendor sourcing workflow

## Purpose

The admin **Vendor sourcing** workspace suggests suppliers from the vendor register based on fulfilment geography and optional catalog filters. It produces a **read-only ranking** to support procurement decisions. It never creates purchases, payable documents, inventory movements, or customer billing.

## When to use

- A customer enquiry or informal order requires a supplier shortlist aligned to delivery location.
- Procurement wants to compare incumbent vendors against geographic fit and documented score signals.
- Staff wish to initiate **VendorQuoteRequest** (RFQ) records for explicit vendor picks.

## Steps

1. Open **Admin → Vendors & Procurement → Vendor Sourcing** (`/admin/vendors/sourcing`).
2. Enter delivery geography at minimum (**pincode** and/or city, district, state). Optional **branch / location hint** is stored only in suggestion context (`context_echo.branch_hint`) for audit and future branch rules—not used to filter vendors today.
3. Optionally narrow suppliers with **internal product ID**, **product name** (substring), **category text** (case-insensitive exact on vendor SKU lines), and **material** (substring).
4. Toggle **Include footprints outside geography** only when deliberately considering vendors outside matched service areas.
5. Click **Run sourcing** to POST `admin/vendor-sourcing/suggest/` and review ranked rows.
6. Use **Show score breakdown** to see capped contributions (location, price, quality, delivery, warranty, reliability).
7. Actions per row:
   - **Open vendor** — vendor profile detail.
   - **Request quote** — opens Vendor quotes create form with **prefill_vendor** selecting that vendor checkbox.
   - **Compare quotes** — opens the Vendor quotes registry.
8. Optionally **Request quotes from checked vendors** to POST `admin/vendor-sourcing/request-quotes/`, creating **VendorQuoteRequest** payloads only (same semantics as Phase 3 manual RFQ creation). No PO, GRN, payable, payment, sale, direct sale, or stock posting.

## What is explicitly not automated

- No purchase orders, goods receipt, supplier bills, or vendor payments.
- No EMI, payment posting, reconciliation, waiver, lucky draw, commission, or payout side effects.

## References

- Business rules: [vendor-sourcing-policy.md](../business-rules/vendor-sourcing-policy.md)
