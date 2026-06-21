# P5D — Customer Retention Intelligence

## Summary

Adds a read-only admin API and frontend page for surfacing retention signals per customer: overdue EMIs, upcoming EMIs (≤7 days), overdue rent/lease demands, high-risk flags, rejected required KYC documents, expiring contracts (≤30 days), and pending growth requests. All signals are advisory. No Payment, EMI, Subscription, Document, StockLedger, LuckyDraw, Commission, or Payout record is created or mutated. No SMS/WhatsApp/email notification is sent.

---

## Files Changed

### New Service
- `backend/subscriptions/services/customer_retention_intelligence_service.py`

### New API Views
- `backend/api/v1/views/admin_retention_intelligence.py`

### New URL Routes
- `backend/api/v1/routes/admin_retention_intelligence.py`

### URL Registration
- `backend/api/v1/urls.py` — added `path("admin/", include("api.v1.routes.admin_retention_intelligence"))`

### Frontend Page Updated
- `frontend/src/app/(dashboard)/admin/growth/retention/page.tsx` — full implementation (was stub)

### Tests
- `backend/tests/subscriptions/test_retention_intelligence.py` — covers service + API

---

## Signal Types

| Signal Type | Severity | Source | Trigger |
|-------------|----------|--------|---------|
| `OVERDUE_EMI` | HIGH | `Emi` | `status=OVERDUE` on any active subscription |
| `UPCOMING_EMI` | INFO | `Emi` | `status=PENDING`, `due_date` within 7 days |
| `RENT_LEASE_DEMAND_OVERDUE` | HIGH | `RentLeaseBillingDemand` | `status=OVERDUE or PENDING` |
| `HIGH_RISK` | HIGH (or CRITICAL if BLOCKED) | `CustomerRiskProfile` | `risk_band=HIGH or BLOCKED` |
| `REJECTED_REQUIRED_DOCUMENT` | WARNING | `KycDocument` | `is_required=True`, `status=REJECTED` |
| `RENEWAL_OPPORTUNITY` | INFO | `Subscription` | Active/handed-over, `end_date` within 30 days |
| `PENDING_GROWTH_REQUEST` | INFO | `CustomerGrowthRequest` | `status=SUBMITTED or UNDER_REVIEW` |

Signals are sorted by severity: CRITICAL → HIGH → WARNING → INFO within each customer profile.

---

## API Contract

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/growth/retention/` | List all customers with ≥1 signal, sorted by severity |
| GET | `/api/v1/admin/customers/{id}/retention/` | Retention profile for one customer |

Both endpoints support optional `?as_of=YYYY-MM-DD` query param. Invalid date → HTTP 400.

All endpoints: `IsAdmin` only. Customer/partner → HTTP 403. Non-existent customer → HTTP 404.

### Response shape (customer profile)

```json
{
  "customer_id": 42,
  "as_of": "2026-06-21",
  "signal_count": 3,
  "has_critical": false,
  "has_high": true,
  "signals": [
    {
      "signal_type": "OVERDUE_EMI",
      "severity": "HIGH",
      "due_date": "2026-06-10",
      "source_model": "Emi",
      "source_id": 1234,
      "subscription_id": 88,
      "suggested_action": "Follow up on overdue EMI payment."
    },
    ...
  ]
}
```

### List response

```json
{
  "results": [...],
  "total": 7
}
```

---

## Sorting Guarantee

- `list_retention_opportunities` returns customers sorted by:
  1. CRITICAL before HIGH before others
  2. Higher signal_count within same severity tier

---

## Financial Integrity

All service functions are strictly read-only. Verified in tests:
- `Subscription.count()` unchanged
- `Emi.count()` unchanged
- `Payment.count()` unchanged

Signal classifiers use `try/except` guards so a missing related model (e.g. `RentLeaseBillingDemand` not present) silently produces zero signals for that type rather than raising an exception.

---

## Test Commands

```bash
python manage.py test tests.subscriptions.test_retention_intelligence --verbosity=1
```

---

## Existing Data Impact

- Zero. No migration required. All data is read from existing tables.
- No record is created or modified.

---

## Risks

- Performance: `list_retention_opportunities` iterates ALL customers with `Customer.objects.all().iterator(chunk_size=200)`. For large installations (> 1000 customers), this may be slow. Consider adding a fast-path filter (e.g. customers with any overdue EMI) before calling the full signal builder.
- `RentLeaseBillingDemand` signal is guarded by `try/except`: if the model doesn't exist in the installed apps (e.g. rent/lease feature is disabled), the signal type is silently skipped.
- `KycDocument` filter uses `is_required=True`. If KYC schema changes, update the filter.
