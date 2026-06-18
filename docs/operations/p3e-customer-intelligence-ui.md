# P3E — Customer Intelligence UI

Read-only admin panels surfacing the P3 customer intelligence layer in admin UI.

## Phase

P3E — additive frontend only. No backend changes. No migrations.

---

## Pages and Panels Added

### Admin Customer Detail Page
`/admin/customers/[id]`

Two new read-only panels are appended after the KYC Document panel:

| Panel | Component | Section |
|-------|-----------|---------|
| Customer Risk Profile | `CustomerRiskPanel` | After KYC documents |
| Customer Operational Timeline | `CustomerTimelinePanel` | After risk panel |

### Admin Subscription Detail Page
`/admin/subscriptions/[id]`

Two new read-only panels are conditionally rendered for RENT and LEASE subscriptions only (hidden for EMI):

| Panel | Component | Condition |
|-------|-----------|-----------|
| Document Vault Readiness | `DocumentReadinessPanel` | `!isEmiSubscription` |
| Rental Asset Readiness | `RentalAssetReadinessPanel` | `!isEmiSubscription` |

---

## Endpoints Used

| Panel | Endpoint | Phase |
|-------|----------|-------|
| CustomerRiskPanel | `GET /api/v1/admin/customers/{id}/risk-profile/` | P3C |
| CustomerTimelinePanel | `GET /api/v1/admin/customers/{id}/timeline/` | P3D |
| DocumentReadinessPanel | `GET /api/v1/admin/subscriptions/{id}/document-readiness/` | P3A |
| RentalAssetReadinessPanel | `GET /api/v1/admin/rental-assets/subscription-readiness/{subscription_pk}/` | P3B |

All endpoints are admin-only (HTTP 403 for customer and partner roles).

---

## Service Functions

File: `frontend/src/services/customer-intelligence.ts`

| Function | Endpoint |
|----------|----------|
| `fetchCustomerRiskProfile(customerId)` | `/admin/customers/{id}/risk-profile/` |
| `fetchCustomerTimeline(customerId, params?)` | `/admin/customers/{id}/timeline/` |
| `fetchSubscriptionRentalAssetReadiness(subscriptionId)` | `/admin/rental-assets/subscription-readiness/{subscription_pk}/` |

`fetchDocumentReadiness` was already available in `frontend/src/services/kyc-readiness.ts` (P3A) and is used unchanged.

---

## Types Added

File: `frontend/src/services/customer-intelligence.ts`

- `CustomerRiskBand` — `"LOW" | "MEDIUM" | "HIGH" | "BLOCKED"`
- `CustomerRiskProfile` — risk score, band, reason codes, metadata
- `CustomerTimelineEventSeverity` — `"INFO" | "WARNING" | "HIGH" | "CRITICAL"`
- `CustomerTimelineEvent` — event_id, event_type, event_date, title, description, source_model, status, severity
- `CustomerTimelineResponse` — `{ count, results }`
- `CustomerTimelineParams` — optional filter params for timeline queries
- `RentalAssetSummary` — id, asset_code, status, condition_grade
- `RentalAssetReadiness` — subscription_id, plan_type, has_before_handover_snapshot, linked_assets, activation_readiness

---

## Components Added

All under `frontend/src/components/customer-intelligence/`:

| File | Description |
|------|-------------|
| `CustomerRiskBadge.tsx` | Compact band + score badge (LOW/MEDIUM/HIGH/BLOCKED) |
| `CustomerRiskPanel.tsx` | Full risk profile read-only panel |
| `CustomerTimelinePanel.tsx` | Aggregated timeline panel, newest first, limit 50 |
| `DocumentReadinessPanel.tsx` | Per-document vault status panel (uses existing `VaultDocumentItem` type) |
| `RentalAssetReadinessPanel.tsx` | Asset linkage and activation readiness panel |

---

## Read-Only Scope

All P3E UI is strictly read-only:

- No approve/reject buttons
- No upload capability
- No recalculate trigger
- No asset state mutation (reserve/hand-over/return)
- No open/close actions
- No write operations of any kind

---

## What Operators Can See

### Customer Risk Profile
- Risk band (LOW / MEDIUM / HIGH / BLOCKED)
- Risk score (integer)
- Reason codes explaining the band
- Last calculated timestamp
- Whether the profile has been persisted (vs. default LOW transient)

### Customer Operational Timeline
- Event type and title
- Severity (INFO / WARNING / HIGH / CRITICAL)
- Source model
- Operational status
- Event date/time
- Up to 50 most recent events, newest first

### Document Vault Readiness (subscription)
- Per-document label and required/optional flag
- Status: MISSING / PRESENT / VERIFIED / REJECTED / EXPIRED / NOT_REQUIRED
- Signed status (SIGNED / UNSIGNED)
- Access level indicator (SENSITIVE / HIGHLY_SENSITIVE shown as label only, not file URL)
- Expiry date
- Blocker code
- Overall readiness flag and blocker codes

### Rental Asset Readiness (subscription)
- Linked asset codes, status, and condition grade
- Before-handover snapshot presence
- Activation readiness flag
- Blocker codes and missing documents

---

## Privacy Notes

- Sensitive KYC file URLs are never exposed in timeline event metadata (enforced by backend P3D service).
- HIGHLY_SENSITIVE documents show label and status only; no file URL is surfaced.
- Timeline `action_url` and `metadata` fields are not rendered in the UI.
- Customer/partner public UI is completely out of scope.

---

## Actions Deferred to Future Phases

- Risk recalculation trigger (POST `/risk-profile/recalculate/`)
- Document upload, verify, reject
- Asset reserve, hand-over, return
- Customer/partner self-service intelligence portal
- Risk band enforcement toggle
- Timeline date-range filtering UI (backend supports it; frontend deferred)
