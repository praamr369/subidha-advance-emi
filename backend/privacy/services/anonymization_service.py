from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from privacy.dpdp_compliance_models import DataErasureGuard, ErasureRequestStatus
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit

REDACTED_PHONE = "0000000000"

FINANCIAL_RETENTION_REASONS = [
    {"field": "payments", "reason": "Companies Act 2013 s.128 — 8-year financial record retention"},
    {"field": "emi_records", "reason": "Income Tax Act s.44AA — 6-year books of account"},
    {"field": "invoices", "reason": "GST Rule 56 — 72-month record retention"},
    {"field": "ledger_entries", "reason": "Companies Act 2013 s.128 — financial ledger immutability"},
    {"field": "customer_advances", "reason": "IT Act s.41(1) — liability cessation records"},
]


def get_erasure_preview(*, customer_id: int) -> dict:
    from customers.models import Customer

    customer = Customer.objects.get(pk=customer_id)

    fields_to_erase = [
        {"field": "name", "current_value": customer.name, "action": f"→ REDACTED-{customer.id}"},
        {"field": "phone", "current_value": customer.phone, "action": f"→ {REDACTED_PHONE}"},
        {"field": "address", "current_value": customer.address or "(empty)", "action": "→ (cleared)"},
        {"field": "city", "current_value": customer.city or "(empty)", "action": "→ (cleared)"},
        {"field": "district", "current_value": customer.district or "(empty)", "action": "→ (cleared)"},
        {"field": "state", "current_value": customer.state or "(empty)", "action": "→ (cleared)"},
        {"field": "pincode", "current_value": customer.pincode or "(empty)", "action": "→ (cleared)"},
        {"field": "kyc_documents", "current_value": "Files on disk", "action": "→ Deleted"},
        {"field": "user_account", "current_value": "Active" if customer.user.is_active else "Inactive", "action": "→ Deactivated"},
    ]

    fields_retained = FINANCIAL_RETENTION_REASONS

    return {
        "customer_id": customer.id,
        "customer_name": customer.name,
        "fields_to_erase": fields_to_erase,
        "fields_retained": fields_retained,
    }


@transaction.atomic
def execute_erasure(*, erasure_guard_id: int, actor) -> dict:
    from customers.models import Customer, CustomerKycDocument

    guard = DataErasureGuard.objects.select_for_update().get(pk=erasure_guard_id)

    if guard.status == ErasureRequestStatus.COMPLETED:
        raise ValueError("Erasure already completed.")
    if guard.status == ErasureRequestStatus.REJECTED:
        raise ValueError("Erasure request was rejected.")

    customer = Customer.objects.select_for_update().get(pk=guard.customer_id)
    original_name = customer.name

    # 1. Anonymize PII fields
    customer.name = f"REDACTED-{customer.id}"
    customer.phone = REDACTED_PHONE
    customer.address = ""
    customer.city = ""
    customer.district = ""
    customer.state = ""
    customer.pincode = ""
    customer.kyc_status = "PENDING"
    customer.kyc_rejection_reason = ""
    customer.save(update_fields=[
        "name", "phone", "address", "city", "district", "state", "pincode",
        "kyc_status", "kyc_rejection_reason",
    ])

    # 2. Delete KYC documents
    kyc_deleted_count = 0
    try:
        kyc_docs = CustomerKycDocument.objects.filter(customer=customer)
        for doc in kyc_docs:
            if hasattr(doc, "document") and doc.document:
                try:
                    doc.document.delete(save=False)
                except Exception:
                    pass
            doc.delete()
            kyc_deleted_count += 1
    except Exception:
        pass

    # 3. Deactivate user account
    user = customer.user
    user.is_active = False
    user.first_name = f"REDACTED-{customer.id}"
    user.last_name = ""
    user.save(update_fields=["is_active", "first_name", "last_name"])

    # 4. Update erasure guard
    guard.status = ErasureRequestStatus.COMPLETED
    guard.completed_at = timezone.now()
    guard.completed_by = actor
    guard.fields_to_erase = [
        "name", "phone", "address", "city", "district", "state", "pincode",
        "kyc_documents", "user_account",
    ]
    guard.fields_retained = FINANCIAL_RETENTION_REASONS
    guard.audit_notes = (
        f"Anonymized customer #{customer.id} (was: {original_name}). "
        f"Deleted {kyc_deleted_count} KYC document(s). "
        f"Financial records retained per statutory obligations."
    )
    guard.save(update_fields=[
        "status", "completed_at", "completed_by",
        "fields_to_erase", "fields_retained", "audit_notes", "updated_at",
    ])

    # 5. Audit log
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=guard,
        performed_by=actor,
        metadata={
            "event": "DPDP_ERASURE_EXECUTED",
            "customer_id": customer.id,
            "original_name": original_name,
            "kyc_docs_deleted": kyc_deleted_count,
            "legal_references": [
                "DPDP 2023 s.12 — Right to Erasure",
                "Companies Act 2013 s.128 — 8-year financial retention",
                "IT Act s.44AA — 6-year books of account",
            ],
        },
    )

    return {
        "erasure_guard_id": guard.id,
        "status": guard.status,
        "customer_id": customer.id,
        "anonymized_name": customer.name,
        "kyc_docs_deleted": kyc_deleted_count,
        "fields_retained_count": len(FINANCIAL_RETENTION_REASONS),
    }


@transaction.atomic
def reject_erasure(*, erasure_guard_id: int, reason: str, actor) -> dict:
    guard = DataErasureGuard.objects.select_for_update().get(pk=erasure_guard_id)

    if guard.status in (ErasureRequestStatus.COMPLETED, ErasureRequestStatus.REJECTED):
        raise ValueError(f"Erasure request is already {guard.status}.")

    guard.status = ErasureRequestStatus.REJECTED
    guard.rejection_reason = reason.strip()
    guard.reviewed_by = actor
    guard.save(update_fields=["status", "rejection_reason", "reviewed_by", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=guard,
        performed_by=actor,
        metadata={
            "event": "DPDP_ERASURE_REJECTED",
            "erasure_guard_id": guard.id,
            "reason": reason,
        },
    )
    return {"erasure_guard_id": guard.id, "status": guard.status}
