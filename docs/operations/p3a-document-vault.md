# P3A — Document Vault

Additive extension to the subscription/contract document infrastructure. Upgrades
`SubscriptionDocument` with expiry, signature status, sensitivity classification,
access logging, and rejection workflow. Adds a required-document checklist service
and a read-only API endpoint per subscription.

---

## Document Statuses

| Status | Meaning |
|---|---|
| `MISSING` | No document of this type exists for the subscription |
| `PRESENT` | Document uploaded but not yet verified (pending review) |
| `VERIFIED` | Document reviewed and approved by an admin |
| `REJECTED` | Document rejected with a recorded reason |
| `EXPIRED` | Document was valid but `expires_on` has passed |
| `NOT_REQUIRED` | Document rule does not apply (e.g., direct sale) |

A document **blocks** readiness when its status is `MISSING`, `REJECTED`, or `EXPIRED`
and the document is marked `required` for the plan type.

---

## Signed Status

Each `SubscriptionDocument` carries a `signed_status` field:

| Value | Meaning |
|---|---|
| `UNKNOWN` | Default for all pre-P3A rows; no signature information recorded |
| `SIGNED` | Document includes a customer or party signature |
| `UNSIGNED` | Document present but not yet signed |
| `NOT_REQUIRED` | Signature not applicable for this document type |

---

## Access Level

| Value | Meaning |
|---|---|
| `INTERNAL` | Default; visible to shop admins only |
| `SENSITIVE` | Contains PII or financial detail beyond normal KYC |
| `HIGHLY_SENSITIVE` | Legal, regulatory, or identity-critical content |

Access level is informational — it does not restrict the API endpoint in P3A
but is surfaced in the admin UI for operator awareness.

---

## Required Documents by Plan Type

### EMI
| Document Key | Source | Required | Blocks activation |
|---|---|---|---|
| `ID_PROOF` | Customer KYC | Yes | Yes |
| `SIGNED_CONTRACT` | SubscriptionDocument (CUSTOMER_SIGNATURE) | Yes | Yes |

### RENT
| Document Key | Source | Required | Blocks activation/handover |
|---|---|---|---|
| `ID_PROOF` | Customer KYC | Yes | Yes |
| `ADDRESS_PROOF` | Customer KYC | Yes | Yes |
| `SIGNED_CONTRACT` | SubscriptionDocument (CUSTOMER_SIGNATURE) | Yes | Yes |
| `DEPOSIT_RECEIPT` | SubscriptionDocument (SECURITY_DEPOSIT_RECEIPT_PDF) or deposit transaction | Yes | Yes |

### LEASE
All of RENT plus:

| Document Key | Source | Required | Blocks activation/handover |
|---|---|---|---|
| `CONDITION_PROOF` | SubscriptionDocument (RETURN_INSPECTION_REPORT / ASSET_HANDOVER_ACKNOWLEDGEMENT / DELIVERY_HANDOVER_NOTE) | Yes | Yes |

### Direct Sale
No contract documents are required. KYC is optional. The checklist is empty and
`overall.ready` is always `true`.

---

## What Blocks Activation / Handover

A subscription is **not ready** when any required document has status:

- `MISSING` — document was never uploaded
- `REJECTED` — document was uploaded but explicitly rejected (blocker codes: `*_REJECTED`)
- `EXPIRED` — document's `expires_on` date has passed (blocker codes: `*_EXPIRED`)

Blocker codes follow the pattern `{KEY}_{STATE}`, e.g.:
- `ID_PROOF_MISSING`
- `SIGNED_CONTRACT_REJECTED`
- `DEPOSIT_RECEIPT_EXPIRED`
- `CONDITION_PROOF_MISSING`

Customer KYC verification (`KYC_NOT_VERIFIED`) is also a blocker for RENT/LEASE.

---

## API Endpoint

```
GET /api/v1/admin/subscriptions/{id}/document-readiness/
```

**Query params:**
- `include_handover=1` — also include handover/condition proof items (lease always includes them)

**Response shape:**
```json
{
  "subscription_id": 42,
  "plan_type": "RENT",
  "is_direct_sale": false,
  "required_documents": [
    {
      "document_key": "ID_PROOF",
      "label": "Customer identity proof",
      "required": true,
      "status": "MISSING",
      "blocker_code": "ID_PROOF_MISSING",
      "document_id": null,
      "expires_on": null,
      "signed_status": "UNKNOWN",
      "access_level": "INTERNAL"
    }
  ],
  "overall": {
    "ready": false,
    "blocker_codes": ["ID_PROOF_MISSING", "ADDRESS_PROOF_MISSING", "SIGNED_CONTRACT_MISSING", "DEPOSIT_RECEIPT_MISSING"]
  }
}
```

Read-only. No mutation endpoints are added in P3A (use the existing document
upload workflow to add documents).

---

## Access Log

Every `verify`, `reject`, and manual `log_document_access` call appends a
`DocumentAccessLog` row. Fields:

| Field | Notes |
|---|---|
| `document` | FK to SubscriptionDocument |
| `user` | Staff user who performed the action (nullable for system/anonymous) |
| `action` | VIEW / DOWNLOAD / VERIFY / REJECT / REPLACE / UPLOAD |
| `accessed_at` | Timestamp |
| `ip_address` | Client IP (optional, from X-Forwarded-For or REMOTE_ADDR) |
| `user_agent` | Browser/client string, truncated at 1 024 chars |
| `metadata` | Free JSON — rejection reason, source context, etc. |

Access logs are append-only and are never mutated after creation.

---

## What Remains Legacy / Backfill

- All `SubscriptionDocument` rows created before P3A migration have:
  - `signed_status = UNKNOWN`
  - `access_level = INTERNAL`
  - `checksum_sha256 = ""`
  - `expires_on = null`
  - `verified_by = null`, `verified_at = null`
  - `rejection_reason = ""`
  - `metadata = {}`

  These rows are fully valid. No data migration is required.

- Shops should backfill `signed_status` and `access_level` on important existing
  documents at their own pace — the system never forces it.

- The legacy `verification_status` field (PENDING/VERIFIED/REJECTED) remains the
  primary document approval field. The new `verified_by` / `verified_at` /
  `rejection_reason` fields supplement it — they do not replace it.

---

## Privacy / Access Control Notes

- `SENSITIVE` and `HIGHLY_SENSITIVE` documents should be served only to admins
  with the KYC review role. P3A surfaces the label but does not enforce download
  restrictions — that is deferred to a future access-control gate.
- The `DocumentAccessLog` is the audit trail for any future access-control review.
- IP addresses stored in access logs are subject to the shop's GDPR/PDPA
  retention policy. Purge after the policy window if required.

---

## Financial Integrity Impact

None. P3A is purely additive model and service logic. It does not touch:
- EMI calculation
- Payment posting
- Lucky draw
- Waiver
- Commission, payout, reconciliation, or accounting bridge

---

## Daily Shop Usability

- New `document-readiness` endpoint is available to the admin UI for any subscription.
- The existing `contract-readiness` endpoint on the customer resource continues to
  work unchanged.
- Rejected and expired documents are now surfaced as distinct blockers — shop staff
  can see exactly which document needs to be replaced rather than a generic "missing"
  message.
- No new upload buttons or mutation UI are added in P3A. Use the existing document
  upload workflow to add or replace documents.

---

## Future Rent/Lease Compatibility

- `CONDITION_PROOF` is already required for LEASE in P3A.
- When `include_handover=1` is passed, RENT contracts also surface a
  `HANDOVER_PROOF` item (currently maps to the same condition/handover doc types).
- The `document_vault_service.py` is designed to be extended with additional
  document types and plan-specific rules without changing the API shape.
- `AssetConditionSnapshot` (planned P3B/P4) will satisfy `CONDITION_PROOF` via the
  existing forward-compatible hook in `contract_activation_readiness_service.py`.
