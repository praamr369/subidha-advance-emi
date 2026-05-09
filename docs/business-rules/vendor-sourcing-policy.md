# Vendor sourcing policy

## Scope

Vendor sourcing is **recommendation-only**. It ranks registered **ACTIVE** vendors using geography, optional vendor-product catalogue filters, and stored vendor score signals. Procurement staff retain full responsibility for supplier selection and for creating downstream documents.

## Ranking inputs

Suggestions accept (all optional unless noted):

| Field | Role |
| --- | --- |
| `customer_pincode`, `customer_city`, `customer_district`, `customer_state` | Matched against each vendor's **service areas** |
| `customer_branch` | **Informational only** (`context_echo.branch_hint`); reserved for future branch-aware rules |
| `product_id` | Limits vendor catalogue lines by internal product link |
| `product_name`, `category_text`, `material` | Substring/exact filters on vendor product rows when any filter is active |
| `quantity`, `required_by`, `budget_amount` | Echoed in `context_echo` for UI alignment; **no transactional effect** |
| `include_out_of_area` | Default **false**. When false, vendors with service areas defined that do **not** overlap customer geography are **excluded**. When true, they may appear scored as **OUT_OF_AREA** |

### Service-area and geography semantics

For each vendor, active service rows are scanned for pincode equality (string match after strip), city, district, and state equality (case-insensitive for locality fields).

- **Tiered location contribution** applies when hierarchy matches pincode → city → district → state (`SAME_*` labels).
- Vendors **with zero service-area rows** are treated as eligible for hierarchical matching (fallback: `in_service_geo` true path) consistent with permissive onboarding of vendors without footprints.
- **`include_out_of_area=false`** (default): exclude vendors whose service areas exist but do not intersect customer geography hierarchy.
- **`include_out_of_area=true`**: include those vendors at **lower location points** (`OUT_OF_AREA`).

### Catalogue filters gate

When any of `product_id`, non-blank category, material, or substantive product-name filter is active, vendors **without** at least one matching **active VendorProduct** after filters are **dropped**. When filters are inactive, geography-only filtering applies.

## Scoring caps (additive, max 100 from components)

Contribution **caps** (weights):

| Factor | Cap (pts) |
| --- | ---: |
| Location | 30 |
| Price posture (`price_score` on vendor profile) | 20 |
| Delivery (`delivery_score`) | 15 |
| Quality (`quality_score`) | 15 |
| Warranty (`warranty_score`) | 10 |
| Reliability (`rating`) | 10 |

**Location points** inside footprint (descending tiers): SAME_PINCODE 30, SAME_CITY 24, SAME_DISTRICT 16, SAME_STATE 8. **`include_out_of_area`**: capped **4** location points only when hierarchical match absent.

Vendor raw scores are normalized null-safely: missing → **0** contribution; numeric values are capped at **100** raw then scaled linearly into each factor's cap above.

## API (admin-only)

- `POST /api/v1/admin/vendor-sourcing/suggest/` — body per `VendorSourcingSuggestSerializer`; returns `{ results: [...] }` ranked by `overall_score` descending.

- `POST /api/v1/admin/vendor-sourcing/request-quotes/` — body per `VendorQuoteRequestCreateSerializer` (bulk `vendor_ids`, etc.). Creates RFQ artefacts only via existing Phase 3 quote workflow. **Forbidden** paths: PO, payable, accounting journal impact beyond quote module, inventory, EMI, payments.

## Behaviour boundaries

| Allowed | Forbidden |
| --- | --- |
| Rank vendors, expose action URLs (`request_quote`, `open_vendor`, `compare_quotes`) | Auto-create PO, supplier bill, stock movement |
| Optionally create VendorQuoteRequest + vendor invites | Customer sale, direct sale posting, EMI schedule change |

EMI schedules, payment posting, reconciliation policies, waiver application, lucky draw jobs, commissions, payouts, reversals/refunds/stock-return posting pipelines are **unchanged** by this module.
