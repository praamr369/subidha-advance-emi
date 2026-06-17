# P3C — Customer Risk Scoring

**Phase**: P3C (Customer Risk Scoring)
**Status**: Implemented — advisory by default, enforcement opt-in.
**Branch**: update
**Migration**: `0096_customer_risk_profile_p3c`

---

## Overview

P3C adds a deterministic, per-customer risk score that aggregates existing data
sources (KYC status, document vault state, EMI/rent overdue history, contract
value, deposit percent, partner origin) into a single band:

| Band    | Score range | Meaning                         |
|---------|-------------|---------------------------------|
| LOW     | 0 – 24      | No concerns. Proceed normally.  |
| MEDIUM  | 25 – 49     | Advisory warning. No action required. |
| HIGH    | 50 – 74     | Elevated risk. Approval may be required. |
| BLOCKED | 75+         | Blocked from rent/lease if enforcement enabled. |

**Default mode is advisory only.** No existing workflow is gated or blocked
unless `CUSTOMER_RISK_ENFORCEMENT_ENABLED` is explicitly set to `true` via the
BusinessPolicy admin.

---

## Score Inputs

All inputs are read from existing model data. No external calls.

| Signal | Points | Reason code |
|--------|--------|-------------|
| KYC not provided / pending | +30 | `KYC_MISSING` |
| KYC rejected | +35 | `KYC_REJECTED` |
| KYC verified / approved | −10 | _(no code)_ |
| Address proof doc rejected | +15 | `ADDRESS_DOC_REJECTED` |
| Address proof doc expired | +10 | `ADDRESS_DOC_EXPIRED` |
| Overdue EMI (×count, max 30) | +12/each | `OVERDUE_EMIS:<n>` |
| Overdue rent/lease demand (×count, max 20) | +10/each | `OVERDUE_RENT_DEMANDS:<n>` |
| Completed/Won subscription (×count, max −20) | −8/each | _(no code)_ |
| Prior cancellation | +8 | `PRIOR_CANCELLATION` |
| Partner-created customer | +5 | `PARTNER_CREATED` |
| Unresolved CRITICAL control exception | +6 | `UNRESOLVED_CRITICAL_EXCEPTION` |
| High contract value (≥ ₹50,000) | +8 | `HIGH_CONTRACT_VALUE` _(contract-level)_ |
| Low deposit percent (< 20%) on rent/lease | +10 | `LOW_DEPOSIT_PERCENT` _(contract-level)_ |

Score is always clamped to ≥ 0. Contract-level signals (`HIGH_CONTRACT_VALUE`,
`LOW_DEPOSIT_PERCENT`) are only added in `evaluate_contract_risk()` and do not
affect the stored customer profile score.

---

## Risk Bands

Thresholds are configurable via BusinessPolicy. Defaults (safe-fallback if policy missing):

| Policy key | Default |
|------------|---------|
| `CUSTOMER_RISK_MEDIUM_THRESHOLD` | 25 |
| `CUSTOMER_RISK_HIGH_THRESHOLD` | 50 |
| `CUSTOMER_RISK_BLOCKED_THRESHOLD` | 75 |

---

## Advisory vs Enforcement Mode

| Policy key | Default | Effect when `True` |
|------------|---------|-------------------|
| `CUSTOMER_RISK_ENFORCEMENT_ENABLED` | **False** | Enables gating logic below |
| `HIGH_RISK_REQUIRES_APPROVAL` | True | HIGH band triggers ApprovalRequest on rent/lease activation |
| `BLOCKED_RISK_BLOCKS_RENT_LEASE` | True | BLOCKED band raises ValueError (HTTP 400) on rent/lease activation |

When `CUSTOMER_RISK_ENFORCEMENT_ENABLED` is **False** (the default):
- `assert_customer_risk_allows_contract()` is a **no-op** — returns the risk
  payload but never raises.
- `evaluate_contract_activation_readiness()` includes the risk payload in the
  response but adds **no blocker_codes** from risk.
- No legacy ACTIVE or HANDED_OVER contract is affected.

---

## Approval Behavior

When enforcement is enabled and the combined band is HIGH or BLOCKED:
- `_try_create_approval()` is called, which creates an `ApprovalRequest` via the
  P2A approval service.
- Action key: `RENT_LEASE_HIGH_RISK_CUSTOMER`.
- If the approval service is unavailable, the failure is logged as a WARNING and
  does **not** propagate — the contract call is not blocked by an approval
  infrastructure failure.

---

## What Blocks Rent/Lease

When `CUSTOMER_RISK_ENFORCEMENT_ENABLED=true` and `BLOCKED_RISK_BLOCKS_RENT_LEASE=true`:
- A customer with band=BLOCKED attempting to activate a **RENT or LEASE** contract
  receives a `ValueError` with code `CUSTOMER_RISK_BLOCKED`.
- EMI and DIRECT_SALE contracts are **never blocked** by risk scoring, regardless
  of band.
- `evaluate_contract_activation_readiness()` propagates `CUSTOMER_RISK_BLOCKED`
  into `blocker_codes` and sets `can_reach_active_or_handover=False`.

---

## Contract Activation Readiness Integration

`evaluate_contract_activation_readiness()` now includes a `risk` key in its response:

```json
{
  "plan_type": "RENT",
  "kyc_verified": true,
  "can_reach_active_or_handover": true,
  "blocker_codes": [],
  "risk": {
    "risk_score": 5,
    "risk_band": "LOW",
    "reason_codes": [],
    "enforcement_enabled": false,
    "approval_required": false,
    "blocker_codes": []
  }
}
```

All existing keys are preserved. The `risk` key is **additive only**.

---

## Admin API

### Read risk profile
```
GET /api/v1/admin/customers/{id}/risk-profile/
```
Returns the stored `CustomerRiskProfile` (or a transient LOW default if never
calculated). Requires ADMIN role.

### Recalculate
```
POST /api/v1/admin/customers/{id}/risk-profile/recalculate/
```
Recomputes and persists the risk profile. Returns the updated profile.
Writes an audit log entry. Requires ADMIN role.

**Access control**: ADMIN only. CUSTOMER and PARTNER roles receive HTTP 403.

---

## Model: CustomerRiskProfile

Table: `subscriptions_customer_risk_profiles`

| Field | Type | Notes |
|-------|------|-------|
| `customer` | OneToOne FK | Unique per customer |
| `risk_score` | PositiveSmallIntegerField | 0–∞, always ≥ 0 |
| `risk_band` | CharField | LOW/MEDIUM/HIGH/BLOCKED |
| `reason_codes` | JSONField (list) | Human-readable signal codes |
| `last_calculated_at` | DateTimeField (nullable) | UTC timestamp of last calculation |
| `metadata` | JSONField | Reserved for future enrichment |
| `created_at` | DateTimeField | Auto |

---

## Deferred Items

The following were explicitly excluded from P3C to keep the scope bounded:

| Item | Reason deferred |
|------|-----------------|
| `CustomerRiskEvent` / audit snapshot table | Not needed until scoring history is required |
| Automatic risk re-scoring on EMI payment | Requires event hook infrastructure |
| Frontend risk badge on customer profile | Frontend untouched in P3C |
| Partner-visible risk indicator | Out of scope; partner access blocked by design |
| Bulk recalculation job | Deferred; admin can trigger per-customer via POST |
| Score weights configurable via BusinessPolicy | Currently hardcoded; extractable later without DB migration |

---

## Financial / Audit Impact

- **No financial mutation**: P3C is read-only with respect to EMI, payment, waiver,
  commission, reconciliation, and accounting.
- **Audit log**: Every `recalculate_customer_risk_profile()` call writes an
  `AuditLog` entry with `event=CUSTOMER_RISK_RECALCULATED`.
- **Existing data**: All existing customers have no `CustomerRiskProfile` row until
  `recalculate_customer_risk_profile()` is called. `get_customer_risk_profile()`
  returns a transient LOW default in that case.

---

## Test Coverage

File: `backend/tests/subscriptions/test_customer_risk_scoring.py`

Run:
```bash
cd backend
source .venv/bin/activate
python manage.py test tests.subscriptions.test_customer_risk_scoring --verbosity=1
```

Also re-run the full subscription test suite to confirm no regressions:
```bash
python manage.py test tests.subscriptions --verbosity=1
```
