# P2A — Enterprise Control Foundation

Backend-only. No frontend changes. Additive to P0 (558918e5) and P1 (1ca0cff0).

## What was added

Three control primitives implemented as a separate model file (`models_control_foundation.py`) and three service modules, wired to nine read/write admin API endpoints.

---

## 1. ApprovalRequest (maker-checker)

**Table:** `control_approval_requests`

**Purpose:** Gate sensitive shop operations behind an explicit approval step. A cashier or staff creates a request; a different admin approves or rejects it.

**Statuses:** `PENDING → APPROVED / REJECTED / EXPIRED / CANCELLED`

**Risk levels:** `LOW / MEDIUM / HIGH / CRITICAL`

**Self-approval rule:** HIGH and CRITICAL risk requests cannot be approved by the same user who created them. LOW and MEDIUM are unrestricted.

**Immutability:** Once APPROVED or REJECTED, the record cannot be modified. Any attempt raises `ValueError`.

**Pending uniqueness:** Only one PENDING request per `(source_model, source_id, action_key)` at a time (DB constraint).

### Service API

```python
from subscriptions.services.control_approval_service import (
    create_approval_request,
    approve_request,
    reject_request,
    cancel_request,
    expire_pending_requests,
)

req = create_approval_request(
    source_model="Payment",
    source_id=str(payment.pk),
    action_key="payment.reverse",
    requested_by=request.user,
    risk_level=ApprovalRiskLevel.HIGH,
    before_snapshot={"amount": str(payment.amount)},
    request_reason="Customer reversal request",
)

approve_request(request=req, decided_by=admin_user, decision_reason="Verified")
reject_request(request=req, decided_by=admin_user, decision_reason="No supporting docs")
```

### REST endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/v1/admin/control/approvals/` | List all approval requests (filter: `?status=PENDING`, `?risk_level=HIGH`) |
| POST | `/api/v1/admin/control/approvals/{id}/approve/` | Approve a pending request |
| POST | `/api/v1/admin/control/approvals/{id}/reject/` | Reject a pending request |

All endpoints: `IsAuthenticated + IsAdmin` (ADMIN role only).

---

## 2. BusinessPolicy (runtime typed key/value)

**Table:** `control_business_policies`

**Purpose:** Store typed runtime flags that control shop behavior without a deploy. Policies are read by service code to decide whether an action requires approval, is allowed, or has a threshold.

**Value types:** `BOOL / INT / DECIMAL / STRING / JSON`

**Scopes:** `GLOBAL / BRANCH / PLAN_TYPE / ROLE`

**History:** Setting a new value deactivates the prior active row rather than mutating it in place. Full history is retained.

**Safe defaults:** `get_policy_value()` never raises. If a key is absent, it returns the caller-supplied default, then the hard-coded `_SAFE_DEFAULTS`, then `None`. The safe defaults are designed so the shop is safe even before policies are explicitly configured.

### Initial policy keys

| Key | Default | Type | Meaning |
|-----|---------|------|---------|
| `PAYMENT_REVERSAL_REQUIRES_APPROVAL` | `True` | BOOL | Payment reversals need approval |
| `DEPOSIT_REFUND_REQUIRES_APPROVAL` | `True` | BOOL | Deposit refunds need approval |
| `STOCK_ADJUSTMENT_REQUIRES_APPROVAL` | `False` | BOOL | Manual stock adjustments need approval |
| `MANUAL_JOURNAL_REQUIRES_APPROVAL` | `True` | BOOL | Manual journals need approval |
| `DIRECT_SALE_CANCEL_REQUIRES_APPROVAL` | `False` | BOOL | Direct sale cancellations need approval |
| `RENT_LEASE_ACTIVATION_REQUIRES_APPROVAL` | `False` | BOOL | Rent/lease activation needs approval |
| `CASH_VARIANCE_REQUIRES_APPROVAL` | `False` | BOOL | Cash counter variance needs approval |
| `STOCK_NEGATIVE_ALLOWED` | `False` | BOOL | Allow negative stock |
| `DIRECT_SALE_MAX_CASH_WITHOUT_APPROVAL` | `50000.00` | DECIMAL | Cash threshold above which approval is required |

### Service API

```python
from subscriptions.services.control_policy_service import get_policy_value, set_policy_value, PolicyKey

# Read
requires = get_policy_value(PolicyKey.PAYMENT_REVERSAL_REQUIRES_APPROVAL)  # True by default

# Write (admin action)
set_policy_value(
    key=PolicyKey.STOCK_NEGATIVE_ALLOWED,
    value=True,
    value_type="BOOL",
    updated_by=admin_user,
)
```

### REST endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/v1/admin/control/policies/` | List active policies (filter: `?key=`, `?scope_type=`) |
| POST | `/api/v1/admin/control/policies/set/` | Upsert a policy value |

---

## 3. ControlException (exception desk)

**Table:** `control_exceptions`

**Purpose:** Surface operational integrity gaps as structured exceptions that staff can acknowledge, resolve, or suppress. The exception service can detect gaps (missing bridge, missing KYC, unposted deposit) and write persisted exception records for the admin desk.

**Statuses:** `OPEN → ACKNOWLEDGED → RESOLVED / SUPPRESSED`

**`raise_exception()` is idempotent:** Calling it twice for the same `(exception_key, source_model, source_id)` returns the existing OPEN record without creating a duplicate.

### Well-known exception keys

| Key | Severity | Meaning |
|-----|----------|---------|
| `payment_paid_receipt_missing` | HIGH | Payment paid but no receipt |
| `payment_bridge_missing` | HIGH | Payment not bridged to accounting |
| `delivery_stock_ledger_missing` | WARNING | Delivery without stock ledger reduction |
| `rent_lease_active_kyc_missing` | CRITICAL | Active rent/lease without KYC |
| `deposit_liability_unposted` | HIGH | Collected deposit not posted to liability |
| `invoice_stock_not_reduced` | WARNING | Invoice without stock reduction |
| `manual_journal_without_source` | HIGH | Manual journal with no source reference |
| `cash_counter_variance` | WARNING | Cash counter variance at day close |

### Service API

```python
from subscriptions.services.control_exception_service import (
    raise_exception, acknowledge_exception, resolve_exception,
    suppress_exception, list_open_exceptions, ExceptionKey,
)

raise_exception(
    exception_key=ExceptionKey.PAYMENT_BRIDGE_MISSING,
    source_model="Payment",
    source_id=str(payment.pk),
)

results = list_open_exceptions()  # returns dicts — safe for API serialisation
```

### REST endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/v1/admin/control/exceptions/` | List OPEN+ACKNOWLEDGED exceptions (filter: `?severity=`, `?exception_key=`, `?source_model=`) |
| POST | `/api/v1/admin/control/exceptions/{id}/acknowledge/` | Acknowledge exception |
| POST | `/api/v1/admin/control/exceptions/{id}/resolve/` | Mark resolved |
| POST | `/api/v1/admin/control/exceptions/{id}/suppress/` | Suppress (admin override) |

---

## Migration

`0090_control_foundation` — creates three new tables. No existing table touched.

## Permission matrix

| Role | Approval list | Approve/Reject | Policy read | Policy set | Exception list | Exception actions |
|------|--------------|----------------|-------------|------------|----------------|-------------------|
| ADMIN | YES | YES | YES | YES | YES | YES |
| CASHIER | NO | NO | NO | NO | NO | NO |
| STAFF | NO | NO | NO | NO | NO | NO |
| CUSTOMER | NO | NO | NO | NO | NO | NO |
| PARTNER | NO | NO | NO | NO | NO | NO |

## Financial integrity impact

None. These models store control metadata only. No payment, EMI, accounting, or stock record is created or mutated by P2A. Existing audit semantics are unchanged. The `log_audit()` call in the approval service uses the existing `AuditLog` model with `USER_UPDATED` action type (no new action type needed at this stage).

## Daily shop usability impact

None. No new screens, no new cashier flows, no new required fields on any existing form. Endpoints are admin-only and are called only when the admin explicitly navigates to the control desk.

## Rent/lease compatibility

The `RENT_LEASE_ACTIVATION_REQUIRES_APPROVAL` policy key is pre-registered. When the rent/lease activation path is extended in future phases, it can call `get_policy_value(PolicyKey.RENT_LEASE_ACTIVATION_REQUIRES_APPROVAL)` and gate the action accordingly without any schema change.

## Deferred / future

- Expiry job for PENDING → EXPIRED: `expire_pending_requests()` is implemented but not scheduled. Wire to a system job in P2B.
- `APPROVAL_REQUESTED` / `APPROVAL_APPROVED` AuditLog action types: can be added additively when the audit type enum is extended.
- Exception auto-detection jobs (e.g. daily scan for missing bridges): deferred to P2B.
- Frontend control desk UI: deferred to P3.
