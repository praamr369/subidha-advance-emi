# P5B — Growth Request Workflow

## Summary

Adds a controlled lifecycle for tracking customer upgrade, renewal, exchange, and conversion requests. No subscription, EMI, payment, journal entry, or financial record is created or mutated. All service functions operate on `CustomerGrowthRequest`, `GrowthRequestDecision`, and `GrowthRequestLine` rows only.

---

## Files Changed

### New Models
- `backend/subscriptions/models_growth_requests.py` — `CustomerGrowthRequest`, `GrowthRequestLine`, `GrowthRequestDecision`
- `backend/subscriptions/apps.py` — added `import subscriptions.models_growth_requests`

### New Migration
- `backend/subscriptions/migrations/0098_growth_requests_p5b.py` — creates `growth_customer_requests`, `growth_request_lines`, `growth_request_decisions` tables; depends on 0097

### New Service
- `backend/subscriptions/services/growth_request_service.py`

### New API Views
- `backend/api/v1/views/admin_growth_requests.py`

### New URL Routes
- `backend/api/v1/routes/admin_growth_requests.py`

### URL Registration
- `backend/api/v1/urls.py` — added `path("admin/", include("api.v1.routes.admin_growth_requests"))`

### New Frontend Page
- `frontend/src/app/(dashboard)/admin/growth/requests/page.tsx`

### Tests
- `backend/tests/subscriptions/test_growth_requests.py` — 28 tests, all passing

---

## Model Summary

### `CustomerGrowthRequest`
Table: `growth_customer_requests`

| Field | Type | Notes |
|-------|------|-------|
| `request_number` | CharField (unique) | GR26-XXXXXX format |
| `customer` | FK Customer | required |
| `source_subscription` | FK Subscription | nullable |
| `request_type` | TextChoices | RENEWAL/UPGRADE/EXCHANGE/PLAN_CONVERSION/EARLY_DELIVERY_INTEREST/RENT_TO_LEASE_INTEREST/LEASE_TO_PURCHASE_INTEREST |
| `status` | TextChoices | DRAFT/SUBMITTED/UNDER_REVIEW/APPROVED/REJECTED/CANCELLED/CONVERTED |
| `priority` | TextChoices | LOW/NORMAL/HIGH/URGENT |
| `expected_value` | DecimalField | advisory, does not affect pricing |
| `risk_snapshot` | JSONField | captured at creation time |
| `approval_required` | BooleanField | auto-set if HIGH/BLOCKED risk or expected_value > 50,000 |

### `GrowthRequestDecision`
Table: `growth_request_decisions`

Immutable audit log of each lifecycle decision (APPROVE/REJECT/REQUEST_MORE_INFO/CANCEL). One record per action.

### `GrowthRequestLine`
Table: `growth_request_lines`

Optional line items attached to a request (PRODUCT/SERVICE/DISCOUNT/NOTE). Informational only.

---

## API Contract

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/growth/requests/` | List all requests; filter by `status`, `request_type`, `customer_id` |
| POST | `/api/v1/admin/growth/requests/` | Create DRAFT request |
| GET | `/api/v1/admin/growth/requests/{id}/` | Get request detail |
| PATCH | `/api/v1/admin/growth/requests/{id}/` | Update mutable fields (blocked if terminal) |
| POST | `/api/v1/admin/growth/requests/{id}/submit/` | DRAFT → SUBMITTED |
| POST | `/api/v1/admin/growth/requests/{id}/approve/` | → APPROVED + decision record |
| POST | `/api/v1/admin/growth/requests/{id}/reject/` | → REJECTED + decision record |
| GET | `/api/v1/admin/growth/requests/{id}/preview/` | Full preview + evaluation advisory |

All endpoints: `IsAdmin` only (cashier, customer, partner → HTTP 403).

---

## Lifecycle

```
DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED
                                 → REJECTED
                   → CANCELLED
                   → CONVERTED
```

Terminal statuses: `APPROVED`, `REJECTED`, `CANCELLED`, `CONVERTED`. PATCH is blocked in terminal state.

---

## Approval Logic

`approval_required` is auto-set to `True` at creation time when:
- Customer risk band is `HIGH` or `BLOCKED`, OR
- `expected_value > 50,000`

This flag is advisory only. It does NOT auto-create an `ApprovalRequest` or block the workflow. Admins still manually call the approve endpoint.

---

## Financial Integrity

**Nothing financial is touched.** Verified in tests:
- `Subscription.count()` unchanged after create/submit/approve/reject
- `Emi.count()` unchanged
- `Payment.count()` unchanged
- `JournalEntry.count()` unchanged
- `Commission.count()` unchanged

---

## Risk Snapshot

At creation, the customer's current `CustomerRiskProfile` is captured into `risk_snapshot` JSON:
```json
{
  "risk_band": "HIGH",
  "risk_score": 65,
  "reason_codes": ["OVERDUE_EMI"],
  "snapshot_at": "2026-06-21T06:45:00+05:30"
}
```

If no risk profile exists, defaults to `{"risk_band": "LOW", "risk_score": 0}`. The snapshot is immutable after creation.

---

## Test Commands

```bash
python manage.py test tests.subscriptions.test_growth_requests --verbosity=1
# → 28 tests, 0 failures
```

---

## Existing Data Impact

- Zero. No existing row in any table is read for mutation or modified.
- Migration 0098 is additive (new tables only, no ALTER on existing tables).

---

## Risks

- `approval_required` is advisory. Admins can approve high-risk/high-value requests without additional challenge. Enforcement would require a future gating step.
- No notification is sent on status change (email/SMS/WhatsApp integration is outside P5 scope).
