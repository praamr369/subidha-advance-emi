# P5C — Partner Performance Dashboard

## Summary

Adds a read-only admin API and frontend page for viewing partner activity summaries: referral counts, collection totals, overdue EMI counts, commission earned/paid/pending, and risk flags. "Partner" in SUBIDHA CORE is a `User` with `role="PARTNER"`. No Commission, Payout, Payment, Subscription, EMI, or any financial record is created or mutated.

---

## Files Changed

### New Service
- `backend/subscriptions/services/partner_performance_service.py`

### New API Views
- `backend/api/v1/views/admin_partner_performance.py`

### New URL Routes
- `backend/api/v1/routes/admin_partner_performance.py`

### URL Registration
- `backend/api/v1/urls.py` — added `path("admin/", include("api.v1.routes.admin_partner_performance"))`

### Frontend Page Updated
- `frontend/src/app/(dashboard)/admin/growth/partner-performance/page.tsx` — full implementation (was stub)

### Tests
- `backend/tests/subscriptions/test_partner_performance.py` — covers service + API

---

## Data Model

No new models. All data is read from existing:
- `Subscription` (filtered by `partner=partner` FK to `AUTH_USER_MODEL`)
- `Payment` (filtered via `subscription__partner=partner`, `status="CONFIRMED"`)
- `Emi` (filtered via `subscription__partner=partner`, `status=OVERDUE`)
- `Commission` (filtered by `partner=partner`)
- `CustomerGrowthRequest` (filtered by `customer_id__in=[...]`)

---

## API Contract

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/growth/partner-performance/` | List all active partners with snapshots |
| GET | `/api/v1/admin/growth/partner-performance/{id}/` | Detail for one partner (User with role=PARTNER) |

All endpoints: `IsAdmin` only. Customer/partner → HTTP 403. Non-partner user ID → HTTP 404.

### Response shape (per partner)

```json
{
  "partner_id": 12,
  "partner_name": "Ravi Kumar",
  "as_of": "2026-06-21",
  "total_subscriptions": 15,
  "active_subscriptions": 11,
  "completed_subscriptions": 4,
  "referred_customer_count": 13,
  "collections_total": "183000.00",
  "overdue_customer_count": 2,
  "commission_earned": "18300.00",
  "commission_approved": "15000.00",
  "commission_paid": "12000.00",
  "pending_commission": "6300.00",
  "growth_request_count": 3,
  "risk_flags": [
    {
      "code": "OVERDUE_CUSTOMERS",
      "severity": "WARNING",
      "message": "2 referred subscription(s) have overdue EMIs."
    }
  ]
}
```

---

## Risk Flags

| Code | Severity | Trigger |
|------|----------|---------|
| `OVERDUE_CUSTOMERS` | WARNING (< 5 overdue) / HIGH (≥ 5 overdue) | Any overdue EMI on partner's referred subscriptions |
| `HIGH_PENDING_COMMISSION` | INFO | Pending commission > ₹10,000 |

Risk flags are advisory only. No payout is blocked, no Commission record is modified.

---

## Financial Integrity

All service functions are strictly read-only. Verified in tests:
- `Subscription.count()` unchanged after list/detail call
- `Emi.count()` unchanged
- `Payment.count()` unchanged
- `Commission.count()` unchanged

---

## Test Commands

```bash
python manage.py test tests.subscriptions.test_partner_performance --verbosity=1
```

---

## Existing Data Impact

- Zero. No migration required. All data is read from existing tables.
- No existing commission, payout, payment, or subscription row is touched.

---

## Risks

- Performance: `list_partner_performance` iterates all active PARTNER users and runs multiple queries per partner. For large partner bases (> 100), consider caching or pagination.
- Commission.amount field name is assumed to be `commission_amount` based on existing model. Verify against `Commission` model if the field name differs.
