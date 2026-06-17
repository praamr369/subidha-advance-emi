# P2B — Cash Counter Session and Daily Close

Backend-only. No frontend changes. Additive to P0, P1, and P2A.

## What was added

Two groups of primitives: cash-desk session discipline (open / close / variance approval) and a daily close readiness + execution engine, both wired to nine new admin API endpoints.

---

## 1. CashCounterSession

**Table:** `control_cash_counter_sessions`

**Purpose:** Track one cashier's shift on one cash counter for one date. Enforces that every shift is opened, its expected cash is computed from Payment records, the cashier declares the physical cash, and any variance routes through the P2A approval workflow.

### Statuses

```
OPEN → CLOSED                          (zero variance)
     → VARIANCE_PENDING_APPROVAL        (non-zero variance + policy on)
         → APPROVED_VARIANCE            (admin approves)
     → CANCELLED                        (admin cancels before close)
```

`CLOSED`, `APPROVED_VARIANCE`, and `CANCELLED` are immutable.

### Rules

| Rule | Enforcement |
|------|-------------|
| One OPEN session per (counter, cashier, date) | DB UniqueConstraint on OPEN status |
| Only assigned cashier or admin can close | service guard |
| Self-variance approval blocked | service guard |
| Only admin can approve variance | service guard |
| Immutable after close | service guard on save |
| Variance creates P2A ApprovalRequest | controlled by `CASH_VARIANCE_REQUIRES_APPROVAL` policy |

### Expected cash formula

```
expected_cash = opening_cash
              + SUM of Payment(method=CASH, cash_counter=counter, payment_date=date)
              - SUM of DirectSaleReturn(refund_method=CASH_REFUND, status=APPROVED/POSTED, …)
```

Refund subtraction is best-effort — fails silently to ZERO if the billing query errors.

### Service API

```python
from subscriptions.services.control_cash_counter_service import (
    open_cash_counter_session,
    close_cash_counter_session,
    approve_cash_variance,
    get_cash_counter_session_status,
    calculate_cash_counter_expected_cash,
)

session = open_cash_counter_session(
    cash_counter=counter,
    cashier=cashier_user,
    session_date=date.today(),
    opening_cash=Decimal("5000.00"),
    opened_by=admin_user,
)

closed = close_cash_counter_session(
    session=session,
    declared_cash=Decimal("5200.00"),
    closed_by=cashier_user,
)
# If CASH_VARIANCE_REQUIRES_APPROVAL=True → status = VARIANCE_PENDING_APPROVAL
# If zero variance or policy off → status = CLOSED

approved = approve_cash_variance(session=closed, approved_by=other_admin)
```

---

## 2. DailyCloseRun + DailyCloseCheckResult

**Tables:** `control_daily_close_runs`, `control_daily_close_check_results`

**Purpose:** Run a battery of integrity checks for a given date. In dry-run mode, persists results for audit without executing anything. In execute mode, only proceeds if all BLOCKING checks pass, then marks the run EXECUTED.

**No financial record is mutated in either mode.**

### Check battery

| Check key | Severity | What it verifies |
|-----------|----------|-----------------|
| `all_cash_sessions_closed` | BLOCKING | No OPEN sessions exist for the date/branch |
| `no_variance_pending_approval` | BLOCKING | No `VARIANCE_PENDING_APPROVAL` sessions for date/branch |
| `no_unresolved_critical_exceptions` | BLOCKING | No OPEN/ACKNOWLEDGED CRITICAL ControlExceptions (P2A) |
| `cash_payments_have_receipts` | WARNING | CASH payments on the date have linked ReceiptDocuments |
| `accounting_bridge_postings_complete` | WARNING | No PENDING AccountingBridgePostings for the date |

### Run statuses

| Status | Meaning |
|--------|---------|
| `DRY_RUN` | Dry run (checks persisted, nothing executed) |
| `EXECUTED` | All BLOCKING checks passed; close recorded |
| `BLOCKED` | Execute attempted but one or more BLOCKING checks failed |

### Service API

```python
from subscriptions.services.control_daily_close_service import (
    get_daily_close_readiness,
    run_daily_close,
    build_daily_close_run_payload,
)

# Non-persisting readiness check (GET endpoint)
readiness = get_daily_close_readiness(run_date=date.today(), branch=branch)
# → { can_execute: bool, blocking_count: int, checks: [...] }

# Persisted dry run
run = run_daily_close(run_date=date.today(), run_by=admin, branch=branch, is_dry_run=True)

# Persisted execute (blocked if checks fail)
run = run_daily_close(run_date=date.today(), run_by=admin, branch=branch, is_dry_run=False)
```

---

## 3. REST endpoints

All endpoints: `IsAuthenticated + IsAdmin`. No cashier/staff/customer/partner access.

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/v1/admin/control/cash-sessions/` | List sessions (filter: `?session_date=`, `?status=`, `?cash_counter_id=`, `?branch_id=`) |
| POST | `/api/v1/admin/control/cash-sessions/open/` | Open a new session |
| POST | `/api/v1/admin/control/cash-sessions/{id}/close/` | Close session with declared cash |
| POST | `/api/v1/admin/control/cash-sessions/{id}/approve-variance/` | Approve a VARIANCE_PENDING_APPROVAL session |
| GET | `/api/v1/admin/control/daily-close/readiness/` | Non-persisting readiness snapshot |
| POST | `/api/v1/admin/control/daily-close/execute/` | Dry-run or execute close |
| GET | `/api/v1/admin/control/daily-close/history/` | List past DailyCloseRun records |

### Open session body

```json
{
  "cash_counter_id": 1,
  "cashier_id": 5,
  "session_date": "2026-06-17",
  "opening_cash": "5000.00",
  "notes": "Opening shift"
}
```

### Close session body

```json
{
  "declared_cash": "5200.00",
  "notes": "End of shift"
}
```

### Execute daily close body

```json
{
  "run_date": "2026-06-17",
  "branch_id": 1,
  "is_dry_run": false
}
```

HTTP 201 → DRY_RUN or EXECUTED. HTTP 409 → BLOCKED (blocking checks listed in `checks` array).

---

## 4. Migration

`0092_cash_counter_session.py` — creates three new tables. No existing table touched.

---

## 5. Policy integration

`CASH_VARIANCE_REQUIRES_APPROVAL` (type BOOL, default `False`) controls whether a non-zero variance routes to `VARIANCE_PENDING_APPROVAL` or closes directly. Set via the P2A policy endpoint:

```
POST /api/v1/admin/control/policies/set/
{ "key": "CASH_VARIANCE_REQUIRES_APPROVAL", "value": "true", "value_type": "BOOL" }
```

---

## 6. Permission matrix

| Role | Sessions | Open/Close | Variance approve | Daily close |
|------|----------|-----------|-----------------|-------------|
| ADMIN | YES | YES | YES | YES |
| CASHIER | NO | NO | NO | NO |
| STAFF | NO | NO | NO | NO |
| CUSTOMER | NO | NO | NO | NO |
| PARTNER | NO | NO | NO | NO |

---

## 7. Financial integrity impact

None. No Payment, EMI, JournalEntry, AccountingBridgePosting, or any financial record is created or mutated by P2B. CashCounterSession only reads Payment records to compute expected cash. DailyCloseRun reads counts from existing tables. All writes are to the three new P2B tables only.

## 8. Auditability impact

Positive. Every session open and close writes an `AuditLog` entry via `log_audit()`. `DailyCloseRun + DailyCloseCheckResult` provide a persistent audit trail of every readiness check run, whether dry or live.

## 9. Daily shop usability impact

None today (no frontend). When the UI is added (P3), cashiers will open their session at shift start, close at shift end, and the system auto-computes expected cash. Admin reviews variance from the control desk.

## 10. Rent/lease compatibility

No impact. Rent/lease payment flows use the same `Payment` model with `method=CASH` and `cash_counter` FK; they will automatically contribute to `expected_cash` once sessions are used.

## 11. Deferred

- Frontend control desk UI: P3.
- Auto-session-open on first payment of the day: P2C.
- Cashier-self-service close endpoint (non-admin): P2C.
- Automated daily close cron: P2C system jobs.
