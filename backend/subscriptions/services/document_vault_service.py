"""Document Vault service (P3A).

Controlled document lifecycle: required-document checklists by plan type,
verify/reject workflows, access logging, expiry detection, and checksum
calculation.

This service is additive over the existing SubscriptionDocument / KYC
infrastructure. It does not replace the existing SubscriptionDocument upload
workflow, does not touch EMI math, payment posting, lucky draw, waiver,
commission, or audit semantics.

Required document rules by plan type
-------------------------------------
EMI:
  - identity proof (customer KYC)
  - signed advance EMI contract / scheme consent (subscription document)

RENT:
  - identity proof (customer KYC)
  - address proof (customer KYC)
  - signed rent contract (subscription document)
  - deposit receipt / proof (subscription document or deposit transaction)
  - handover / condition proof when delivery/handover requested

LEASE:
  - identity proof (customer KYC)
  - address proof (customer KYC)
  - signed lease contract (subscription document)
  - deposit receipt / proof (subscription document or deposit transaction)
  - asset condition proof (required before handover)

Direct Sale:
  - no contract documents forced
  - KYC optional (no blocking)
"""
from __future__ import annotations

import hashlib
from datetime import date
from typing import Optional

from django.utils import timezone

from subscriptions.models import (
    DocumentAccessAction,
    DocumentAccessLevel,
    DocumentAccessLog,
    DocumentSignedStatus,
    DocumentVerificationStatus,
    PlanType,
    SubscriptionDocument,
    SubscriptionDocumentType,
)
from subscriptions.services import kyc_readiness_service as kyc

# ---------------------------------------------------------------------------
# Document key constants — match MilestoneDocCode / DocCode for unified API
# ---------------------------------------------------------------------------
DKEY_ID_PROOF = kyc.DocCode.ID_PROOF
DKEY_ADDRESS_PROOF = kyc.DocCode.ADDRESS_PROOF
DKEY_SIGNED_CONTRACT = kyc.DocCode.SIGNED_CONTRACT
DKEY_DEPOSIT_RECEIPT = "DEPOSIT_RECEIPT"
DKEY_CONDITION_PROOF = "CONDITION_PROOF"
DKEY_HANDOVER_PROOF = "HANDOVER_PROOF"

# Vault item status tokens (superset of KYC readiness statuses)
VSTATUS_MISSING = "MISSING"
VSTATUS_PRESENT = "PRESENT"
VSTATUS_VERIFIED = "VERIFIED"
VSTATUS_REJECTED = "REJECTED"
VSTATUS_EXPIRED = "EXPIRED"
VSTATUS_NOT_REQUIRED = "NOT_REQUIRED"

_BLOCKER_FOR_KEY = {
    DKEY_ID_PROOF: "ID_PROOF_MISSING",
    DKEY_ADDRESS_PROOF: "ADDRESS_PROOF_MISSING",
    DKEY_SIGNED_CONTRACT: "SIGNED_CONTRACT_MISSING",
    DKEY_DEPOSIT_RECEIPT: "DEPOSIT_RECEIPT_MISSING",
    DKEY_CONDITION_PROOF: "CONDITION_PROOF_MISSING",
    DKEY_HANDOVER_PROOF: "HANDOVER_PROOF_MISSING",
}

_LABEL_FOR_KEY = {
    DKEY_ID_PROOF: "Customer identity proof",
    DKEY_ADDRESS_PROOF: "Customer address proof",
    DKEY_SIGNED_CONTRACT: "Signed contract / scheme consent",
    DKEY_DEPOSIT_RECEIPT: "Security deposit receipt (collected)",
    DKEY_CONDITION_PROOF: "Asset condition proof at handover",
    DKEY_HANDOVER_PROOF: "Handover / delivery proof",
}

# Subscription document types considered as "signed" evidence.
_SIGNATURE_TYPES = {
    SubscriptionDocumentType.CUSTOMER_SIGNATURE,
}
# Subscription document types considered as deposit receipt evidence.
_DEPOSIT_TYPES = {
    SubscriptionDocumentType.SECURITY_DEPOSIT_RECEIPT_PDF,
}
# Subscription document types that evidence asset condition / handover.
_CONDITION_TYPES = {
    SubscriptionDocumentType.RETURN_INSPECTION_REPORT,
    SubscriptionDocumentType.ASSET_HANDOVER_ACKNOWLEDGEMENT,
    SubscriptionDocumentType.DELIVERY_HANDOVER_NOTE,
}


# ---------------------------------------------------------------------------
# Expiry detection
# ---------------------------------------------------------------------------
def document_is_expired(document: SubscriptionDocument, as_of: Optional[date] = None) -> bool:
    """True when `document.expires_on` is set and has passed `as_of` (default today)."""
    if not document.expires_on:
        return False
    check_date = as_of or date.today()
    return document.expires_on < check_date


# ---------------------------------------------------------------------------
# Checksum
# ---------------------------------------------------------------------------
def calculate_document_checksum(file_or_document) -> str:
    """Return hex SHA-256 of the document file content.

    Accepts a SubscriptionDocument instance or a Django file-like object.
    Returns empty string on any error (missing file, storage unavailable) so
    callers never raise a 500 on an optional operation.
    """
    try:
        if isinstance(file_or_document, SubscriptionDocument):
            f = file_or_document.file
        else:
            f = file_or_document
        sha = hashlib.sha256()
        f.seek(0)
        for chunk in iter(lambda: f.read(65536), b""):
            sha.update(chunk)
        f.seek(0)
        return sha.hexdigest()
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Access logging
# ---------------------------------------------------------------------------
def log_document_access(
    document: SubscriptionDocument,
    user,
    action: str,
    *,
    request=None,
    metadata: Optional[dict] = None,
) -> DocumentAccessLog:
    """Append one access log entry.  Never raises — failures are silently swallowed."""
    try:
        ip = None
        ua = ""
        if request is not None:
            x_forwarded = (getattr(request, "META", {}) or {}).get("HTTP_X_FORWARDED_FOR", "")
            ip = (x_forwarded.split(",")[0].strip() if x_forwarded else None) or (
                (getattr(request, "META", {}) or {}).get("REMOTE_ADDR") or None
            )
            ua = (getattr(request, "META", {}) or {}).get("HTTP_USER_AGENT", "") or ""
        return DocumentAccessLog.objects.create(
            document=document,
            user=user if (user and getattr(user, "pk", None)) else None,
            action=action,
            accessed_at=timezone.now(),
            ip_address=ip or None,
            user_agent=ua[:1024],
            metadata=metadata or {},
        )
    except Exception:
        return None  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Verify / reject
# ---------------------------------------------------------------------------
def verify_document(
    document: SubscriptionDocument,
    verified_by,
    notes: str = "",
) -> SubscriptionDocument:
    """Mark a document as VERIFIED and record who verified it."""
    document.verification_status = DocumentVerificationStatus.VERIFIED
    document.verified_by = verified_by
    document.verified_at = timezone.now()
    if notes:
        document.notes = (document.notes or "") + f"\n[verified] {notes}".strip()
    document.save(update_fields=["verification_status", "verified_by", "verified_at", "notes"])
    log_document_access(document, verified_by, DocumentAccessAction.VERIFY)
    return document


def reject_document(
    document: SubscriptionDocument,
    rejected_by,
    reason: str,
) -> SubscriptionDocument:
    """Mark a document as REJECTED with a mandatory reason."""
    document.verification_status = DocumentVerificationStatus.REJECTED
    document.rejection_reason = (reason or "").strip()
    document.save(update_fields=["verification_status", "rejection_reason"])
    log_document_access(
        document,
        rejected_by,
        DocumentAccessAction.REJECT,
        metadata={"reason": reason},
    )
    return document


# ---------------------------------------------------------------------------
# Required-document checklist
# ---------------------------------------------------------------------------
def _best_vault_status(
    docs: list[SubscriptionDocument],
    as_of: Optional[date] = None,
) -> tuple[str, Optional[SubscriptionDocument]]:
    """Return (VSTATUS, best_document) for a list of SubscriptionDocument records.

    Precedence: VERIFIED (non-expired) > PRESENT (non-expired, pending) >
    EXPIRED (best otherwise) > REJECTED (all rejected) > MISSING (empty list).
    """
    if not docs:
        return VSTATUS_MISSING, None

    verified_non_expired = [
        d for d in docs
        if d.verification_status == DocumentVerificationStatus.VERIFIED
        and not document_is_expired(d, as_of)
    ]
    if verified_non_expired:
        return VSTATUS_VERIFIED, verified_non_expired[0]

    present_non_expired = [
        d for d in docs
        if d.verification_status == DocumentVerificationStatus.PENDING
        and not document_is_expired(d, as_of)
    ]
    if present_non_expired:
        return VSTATUS_PRESENT, present_non_expired[0]

    # Expired (any verification status that is not rejected)
    expired = [
        d for d in docs
        if document_is_expired(d, as_of)
        and d.verification_status != DocumentVerificationStatus.REJECTED
    ]
    if expired:
        return VSTATUS_EXPIRED, expired[0]

    # All remaining are rejected
    return VSTATUS_REJECTED, docs[0]


def _subscription_docs_by_type(subscription) -> dict[str, list[SubscriptionDocument]]:
    """Return {document_type: [SubscriptionDocument, ...]} for a subscription."""
    if not subscription or not getattr(subscription, "pk", None):
        return {}
    result: dict[str, list] = {}
    for doc in SubscriptionDocument.objects.filter(subscription=subscription).order_by(
        "-created_at", "-id"
    ):
        result.setdefault(doc.document_type, []).append(doc)
    return result


def _vault_item(
    key: str,
    *,
    required: bool,
    vault_status: str,
    document: Optional[SubscriptionDocument],
    as_of: Optional[date] = None,
) -> dict:
    is_blocker = (
        required
        and vault_status in {VSTATUS_MISSING, VSTATUS_REJECTED, VSTATUS_EXPIRED}
    )
    return {
        "document_key": key,
        "label": _LABEL_FOR_KEY.get(key, key),
        "required": required,
        "status": vault_status,
        "blocker_code": _BLOCKER_FOR_KEY.get(key) if is_blocker else None,
        "document_id": getattr(document, "pk", None),
        "expires_on": (document.expires_on.isoformat() if document and document.expires_on else None),
        "signed_status": (document.signed_status if document else DocumentSignedStatus.UNKNOWN),
        "access_level": (document.access_level if document else DocumentAccessLevel.INTERNAL),
    }


def build_required_document_checklist(
    subscription,
    *,
    as_of: Optional[date] = None,
    include_handover: bool = False,
) -> dict:
    """Build the required-document checklist for `subscription`.

    Returns::

        {
            "subscription_id": int,
            "plan_type": str,
            "required_documents": [...],
            "overall": {"ready": bool, "blocker_codes": [...]},
        }

    Customer KYC documents use the existing `kyc_readiness_service` path
    (they are not SubscriptionDocuments). Subscription-level evidence (signed
    contract, deposit, condition proof) is read from SubscriptionDocument.
    """
    plan = kyc._normalize_plan_type(subscription.plan_type)
    is_direct = kyc.is_direct_sale(plan)

    if is_direct:
        return {
            "subscription_id": getattr(subscription, "pk", None),
            "plan_type": plan,
            "is_direct_sale": True,
            "required_documents": [],
            "overall": {"ready": True, "blocker_codes": []},
        }

    check_date = as_of or date.today()
    cat_status = kyc._customer_doc_category_status(subscription.customer)
    docs_by_type = _subscription_docs_by_type(subscription)

    items: list[dict] = []

    def _customer_item(key: str, *, required: bool):
        raw_status = cat_status.get(key, kyc.STATUS_MISSING)
        if raw_status == kyc.STATUS_VERIFIED:
            vault_status = VSTATUS_VERIFIED
        elif raw_status == kyc.STATUS_PENDING:
            vault_status = VSTATUS_PRESENT
        else:
            vault_status = VSTATUS_MISSING
        items.append(_vault_item(key, required=required, vault_status=vault_status, document=None, as_of=check_date))

    def _sub_doc_item(key: str, doc_types: set[str], *, required: bool):
        matched = []
        for dt in doc_types:
            matched.extend(docs_by_type.get(dt, []))
        vault_status, best_doc = _best_vault_status(matched, check_date)
        items.append(_vault_item(key, required=required, vault_status=vault_status, document=best_doc, as_of=check_date))

    if plan == PlanType.EMI:
        _customer_item(DKEY_ID_PROOF, required=True)
        _sub_doc_item(DKEY_SIGNED_CONTRACT, _SIGNATURE_TYPES, required=True)

    elif plan in {PlanType.RENT, PlanType.LEASE}:
        _customer_item(DKEY_ID_PROOF, required=True)
        _customer_item(DKEY_ADDRESS_PROOF, required=True)
        _sub_doc_item(DKEY_SIGNED_CONTRACT, _SIGNATURE_TYPES, required=True)
        _sub_doc_item(DKEY_DEPOSIT_RECEIPT, _DEPOSIT_TYPES, required=True)
        if plan == PlanType.LEASE or include_handover:
            _sub_doc_item(DKEY_CONDITION_PROOF, _CONDITION_TYPES, required=True)
        if include_handover:
            _sub_doc_item(DKEY_HANDOVER_PROOF, _CONDITION_TYPES, required=True)

    blocker_codes = [
        item["blocker_code"]
        for item in items
        if item["blocker_code"]
    ]
    ready = len(blocker_codes) == 0

    return {
        "subscription_id": getattr(subscription, "pk", None),
        "plan_type": plan,
        "is_direct_sale": False,
        "required_documents": items,
        "overall": {
            "ready": ready,
            "blocker_codes": blocker_codes,
        },
    }
