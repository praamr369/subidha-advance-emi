# P3D — Customer Timeline Aggregation

## Overview

P3D adds a read-only customer timeline that aggregates real operational events
across all major workflows: customer lifecycle, KYC, contracts, payments,
documents, rent/lease, deliveries, draw, and risk scoring.

The timeline is **strictly read-only**. It never mutates source records and
never emits synthetic events that cannot be traced to a real database row.

---

## API

```
GET /api/v1/admin/customers/{id}/timeline/
```

### Response shape

```json
{
  "customer_id": 42,
  "count": 17,
  "events": [
    {
      "event_id": "…uuid…",
      "event_type": "EMI_PAID",
      "event_date": "2026-04-10T00:00:00",
      "title": "EMI payment received",
      "description": "EMI #3 paid (₹1000.00).",
      "source_model": "Payment",
      "source_id": 301,
      "status": "PAID",
      "severity": "INFO",
      "action_url": null,
      "metadata": {
        "amount": "1000.00",
        "method": "CASH",
        "emi_month_no": 3,
        "subscription_id": 58
      }
    }
  ]
}
```

### Query parameters

| Param        | Type   | Description                                             |
|--------------|--------|---------------------------------------------------------|
| `ordering`   | string | `desc` (default, newest first) or `asc`                 |
| `event_type` | string | Exact match on `event_type`                             |
| `source_model` | string | Exact match on `source_model`                          |
| `date_from`  | date   | `YYYY-MM-DD` — include events on or after this date     |
| `date_to`    | date   | `YYYY-MM-DD` — include events on or before this date    |
| `limit`      | int    | Cap result count (applied after all filters)            |

---

## Event sources

Each event maps to one real source row.  `source_model` + `source_id` uniquely
identifies the row.

| event_type                       | source_model              | Trigger                                       |
|----------------------------------|---------------------------|-----------------------------------------------|
| CUSTOMER_CREATED                 | Customer                  | Customer row created                          |
| KYC_APPROVED                     | Customer                  | `kyc_reviewed_at` set + status VERIFIED       |
| KYC_REJECTED                     | Customer                  | `kyc_reviewed_at` set + status REJECTED       |
| DOCUMENT_UPLOADED                | CustomerKycDocument       | KYC document created                          |
| DOCUMENT_VERIFIED                | CustomerKycDocument       | KYC document `reviewed_at` + APPROVED         |
| DOCUMENT_REJECTED                | CustomerKycDocument       | KYC document `reviewed_at` + REJECTED         |
| APPROVAL_REQUESTED               | SubscriptionRequest       | Request created                               |
| APPROVAL_APPROVED                | SubscriptionRequest       | Request `reviewed_at` + APPROVED              |
| APPROVAL_REJECTED                | SubscriptionRequest       | Request `reviewed_at` + REJECTED              |
| APPROVAL_CANCELLED               | SubscriptionRequest       | Request `reviewed_at` + CANCELLED             |
| CONTRACT_CREATED                 | Subscription              | Subscription created                          |
| CONTRACT_CANCELLED               | Subscription              | `cancelled_at` set                            |
| EMI_SCHEDULE_CREATED             | Subscription              | First EMI row created for the subscription    |
| EMI_PAID                         | Payment                   | Payment linked to an EMI                      |
| EMI_WAIVED                       | Emi                       | EMI status=WAIVED + AuditLog.EMI_WAIVED entry |
| SUBSCRIPTION_DOCUMENT_UPLOADED   | SubscriptionDocument      | Document created                              |
| SUBSCRIPTION_DOCUMENT_VERIFIED   | SubscriptionDocument      | `verified_at` set + VERIFIED                  |
| SUBSCRIPTION_DOCUMENT_REJECTED   | SubscriptionDocument      | `verified_at` set + REJECTED                  |
| DELIVERY_CREATED                 | SubscriptionDelivery      | Delivery created                              |
| DELIVERY_DISPATCHED              | SubscriptionDelivery      | `dispatched_at` set                           |
| DELIVERY_COMPLETED               | SubscriptionDelivery      | `delivered_at` set                            |
| DELIVERY_RETURN_REQUESTED        | SubscriptionDelivery      | `return_requested_at` set                     |
| DELIVERY_RETURNED                | SubscriptionDelivery      | `returned_at` set                             |
| DEPOSIT_DEMAND_CREATED           | RentLeaseBillingDemand    | Demand type=SECURITY_DEPOSIT created          |
| RENT_DEMAND_CREATED              | RentLeaseBillingDemand    | Demand type=RENT/LEASE_MONTHLY created        |
| DEPOSIT_COLLECTED                | RentLeaseDepositTransaction | Transaction type=COLLECTED                 |
| DEPOSIT_REFUND_APPROVED          | RentLeaseDepositTransaction | Transaction type=REFUND_APPROVED           |
| DEPOSIT_REFUNDED                 | RentLeaseDepositTransaction | Transaction type=REFUNDED                  |
| DAMAGE_DEDUCTION                 | RentLeaseDepositTransaction | Transaction type=DEDUCTION                 |
| RETURN_INSPECTION_CREATED        | RentLeaseReturnInspection | Inspection created                            |
| RETURN_INSPECTION_APPROVED       | RentLeaseReturnInspection | `approved_at` set                             |
| AMENDMENT_REQUESTED              | ContractAmendment         | Amendment created                             |
| AMENDMENT_APPROVED               | ContractAmendment         | `approved_at` set + APPROVED/APPLIED          |
| AMENDMENT_APPLIED                | ContractAmendment         | `applied_at` set + APPLIED                    |
| ASSET_CONDITION_BEFORE_HANDOVER  | AssetConditionSnapshot    | Snapshot stage=BEFORE_HANDOVER                |
| ASSET_CONDITION_AFTER_RETURN     | AssetConditionSnapshot    | Snapshot stage=AFTER_RETURN                   |
| ASSET_DAMAGE_REVIEW              | AssetConditionSnapshot    | Snapshot stage=DAMAGE_REVIEW                  |
| ASSET_MAINTENANCE_REVIEW         | AssetConditionSnapshot    | Snapshot stage=MAINTENANCE_REVIEW             |
| DRAW_PARTICIPATED                | DrawEligibilitySnapshot   | Customer in draw eligibility snapshot         |
| DRAW_WIN                         | LuckyDraw                 | `is_revealed=True` + customer is winner       |
| PRODUCT_HANDOVER                 | ProductPossession         | `handover_date` set                           |
| PRODUCT_RETURNED                 | ProductPossession         | `actual_return_date` set                      |
| RISK_RECALCULATED                | CustomerRiskProfile       | `last_calculated_at` set                      |

---

## Sensitive data rules

- **KYC file URLs are never included in metadata.** `CustomerKycDocument.file`
  and `SubscriptionDocument.file` paths are intentionally omitted from all
  event metadata.
- `event_id` is a deterministic UUID5 derived from `source_model:source_id:event_type`
  — stable across repeated fetches, safe to use as a client-side cache key.
- The `metadata` field contains only non-sensitive contextual data (amounts,
  type codes, subscription/product IDs).

---

## Permissions

| Role     | Access          |
|----------|-----------------|
| Admin    | Allowed         |
| Staff    | Denied (403)    |
| Cashier  | Denied (403)    |
| Partner  | Denied (403)    |
| Customer | Denied (403)    |

To grant cashier/staff access, add `IsCashierOrAdmin` permission to the view
and verify existing audit controls allow it.

---

## Severity guide

| Severity | Used for                                              |
|----------|-------------------------------------------------------|
| INFO     | Normal operational events                             |
| WARNING  | Rejections, returns, overdue patterns                 |
| HIGH     | Contract cancellation, damage deduction, HIGH risk    |
| CRITICAL | BLOCKED risk band                                     |

---

## Timeline is read-only

- The service performs only `SELECT` queries.
- No model `.save()` or `.create()` calls exist in the service.
- The service accepts `customer: Customer` and returns a plain `dict`.

---

## Operator use cases

- **Contract dispute**: trace the complete history of a customer's EMI
  payments, waivers, and cancellations in one view.
- **KYC audit**: see every document upload, review decision, and the
  final KYC approval timestamp.
- **Rent/lease handover**: confirm deposit collected, asset condition
  before handover, and any damage deductions.
- **Draw winner verification**: confirm eligibility snapshot was created
  and the draw reveal timestamp for the winner.
- **Risk monitoring**: see when the risk profile was last recalculated
  and the current band at a glance.

---

## Deferred items

- **Frontend timeline panel**: not implemented in P3D. Add a collapsible
  timeline card to the admin customer detail page in a future sprint.
- **Partner timeline**: partners should not access this admin endpoint.
  A partner-scoped read-only view (filtering out internal events) is deferred.
- **Customer self-service timeline**: not in scope. Requires a separate,
  narrower event type whitelist and stricter sensitive-data filter.
- **Pagination**: the current response returns all matching events up to
  `limit`. Server-side cursor pagination is deferred.
- **Rental asset status transitions via AuditLog**: asset RESERVED →
  HANDED_OVER → RETURNED transitions are surfaced via `AssetConditionSnapshot`
  (which links to subscription). Direct AuditLog mining for `RENTAL_ASSET_*`
  events across historical subscriptions is deferred.
- **EMI waived without AuditLog entry**: waived EMIs with no matching
  `AuditLog.EMI_WAIVED` row are silently omitted (date cannot be traced).
  Backfilling legacy waivers is a separate data-quality task.
