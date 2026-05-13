# EMI Contract Sale Workflow

## Goal
Keep EMI contract creation and EMI lifecycle financially correct and auditable, while keeping it operationally separate from direct-sale billing collection.

## Implemented workflow

### Request and approval
- Customer/partner request APIs create `SubscriptionRequest` records only.
- Admin approval creates actual `Subscription` + EMI rows.
- Request cancel/reject does not create subscription/payment/ledger side effects.

### Contract creation
- EMI creation uses service-layer validation for:
  - open batch
  - Lucky ID availability and batch match
  - deterministic monthly amount and schedule generation
- Lucky ID assignment status is updated atomically.
- Contract/subscription reference numbering is assigned through service layer.

### EMI schedule and collection posture
- EMI rows are generated per tenure and reconciled.
- Billing mirrors (`BillingProfile`, `BillingInstallmentMirror`) track invoice eligibility, due posture, and snapshots.
- Payment posting remains in subscription/payment flow; receipt generation is additive.

### Waiver and draw posture
- Winner waiver remains future-EMI-only scope.
- Existing paid/settled records are not retroactively mutated.

## Operational controls
- Internal role controls remain strict (admin/cashier internal only).
- Subscription contract and direct-sale document flows are not interchangeable.
- Contract creation must not duplicate EMI month rows for a single subscription.

## Key code references
- `backend/subscriptions/services/subscription_request_service.py`
- `backend/subscriptions/services/subscription_service.py`
- `backend/subscriptions/models.py`
- `backend/billing/services/billing_sync_service.py`
- `backend/tests/api/test_subscription_request_workflow.py`
- `backend/tests/api/test_admin_subscriptions.py`
