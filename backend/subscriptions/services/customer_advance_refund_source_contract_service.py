from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Q

from accounting.models import AccountingBridgePosting, JournalEntry
from accounting.services.finance_posting_service import FinancePostingService
from branch_control.services.branch_service import assert_user_branch_access
from reconciliation.models import ReconciliationItem
from subscriptions.models import AuditLog, CustomerAdvance, CustomerAdvanceAllocation, CustomerAdvanceStatus, Payment
from subscriptions.models_customer_advance_refund import CustomerAdvanceRefund, CustomerAdvanceRefundStatus
from subscriptions.services.audit_service import log_audit

SOURCE_MODEL = "CustomerAdvanceRefund"
EVENT_KEY = "customer_advance_refund"
FUTURE_BRIDGE_PHASE = "F23_CUSTOMER_ADVANCE_REFUND"


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _reference_from(*, reference_no: str | None, idempotency_key: str | None, advance_id: int, refund_date) -> str:
    normalized_reference = (reference_no or "").strip()
    if normalized_reference:
        return normalized_reference
    normalized_idempotency = (idempotency_key or "").strip()
    if normalized_idempotency:
        safe_key = "".join(ch for ch in normalized_idempotency if ch.isalnum())[:20] or "IDEMPOTENT"
        date_key = refund_date.isoformat().replace("-", "") if hasattr(refund_date, "isoformat") else "DATE"
        return f"CAR-{date_key}-{advance_id}-{safe_key}"[:100]
    raise ValueError("Either refund_reference_no/reference_no or idempotency_key is required for customer advance refund evidence.")


def classify_customer_advance_refund_source(*, source_model: str | None, event_key: str | None = None, source_type: str | None = None, metadata: dict[str, Any] | None = None) -> bool:
    metadata = metadata if isinstance(metadata, dict) else {}
    return bool(
        source_model == SOURCE_MODEL
        and (event_key in {None, "", EVENT_KEY})
        and (source_type in {None, "", "CUSTOMER_ADVANCE_REFUND"})
        and metadata.get("source_contract_phase") in {None, "F22"}
    )


def customer_advance_refund_source_matrix() -> list[dict[str, Any]]:
    return [
        {
            "source_model": "CustomerAdvance",
            "event_type": "customer_advance_receipt",
            "customer_evidence": True,
            "advance_evidence": "self",
            "amount": "receipt amount",
            "date": "payment_date",
            "finance_account": True,
            "method": True,
            "status": "UNAPPLIED/PARTIALLY_APPLIED/FULLY_APPLIED",
            "idempotency_reference_evidence": "reference_no/allocation_metadata.source_idempotency_key",
            "void_reversal_behavior": "not refund-specific",
            "existing_accounting_behavior": "F20 receipt bridge",
            "duplicate_posting_risk": "high if reused for refund",
            "decision": "reject",
            "recommended_next_phase": "Keep F20 only; do not use as refund source.",
        },
        {
            "source_model": "CustomerAdvanceAllocation",
            "event_type": "customer_advance_application",
            "customer_evidence": True,
            "advance_evidence": True,
            "amount": "application amount",
            "date": "allocation_date",
            "finance_account": "via advance only",
            "method": "linked ADVANCE_ALLOCATION Payment evidence",
            "status": "none",
            "idempotency_reference_evidence": "linked Payment allocation metadata",
            "void_reversal_behavior": "not refund-specific",
            "existing_accounting_behavior": "F21 application bridge",
            "duplicate_posting_risk": "high if reused for refund",
            "decision": "reject",
            "recommended_next_phase": "Keep F21 only; do not use as refund source.",
        },
        {
            "source_model": SOURCE_MODEL,
            "event_type": EVENT_KEY,
            "customer_evidence": True,
            "advance_evidence": True,
            "amount": True,
            "date": "refund_date",
            "finance_account": True,
            "method": "payment_method",
            "status": "ACTIVE/VOIDED/REVERSED",
            "idempotency_reference_evidence": "refund_reference_no + idempotency_key",
            "void_reversal_behavior": "source fields exist; accounting bridge remains deferred",
            "existing_accounting_behavior": "none in F22",
            "duplicate_posting_risk": "low after F22; F23 must use this source only",
            "decision": "chosen",
            "recommended_next_phase": "Use as the only F23 customer advance refund bridge source after F22 tests pass.",
        },
        {
            "source_model": "RentLeaseDepositTransaction",
            "event_type": "security_deposit_refund",
            "customer_evidence": True,
            "advance_evidence": False,
            "amount": True,
            "date": "transaction_date",
            "finance_account": True,
            "method": True,
            "status": True,
            "idempotency_reference_evidence": True,
            "void_reversal_behavior": "deposit-specific",
            "existing_accounting_behavior": "F18 security deposit refund bridge",
            "duplicate_posting_risk": "must remain separate",
            "decision": "reject",
            "recommended_next_phase": "Never use for customer advance refund.",
        },
        {
            "source_model": "DirectSaleReturn/BillingCreditNote/CustomerRefund/ReceiptDocument/Payment",
            "event_type": "general refund or payment evidence",
            "customer_evidence": "maybe",
            "advance_evidence": False,
            "amount": True,
            "date": True,
            "finance_account": "maybe",
            "method": "maybe",
            "status": True,
            "idempotency_reference_evidence": "varies",
            "void_reversal_behavior": "domain-specific",
            "existing_accounting_behavior": "owned by direct sale, credit, receipt, or F1 flows",
            "duplicate_posting_risk": "high",
            "decision": "reject unless future proof explicitly ties it to CustomerAdvanceRefund",
            "recommended_next_phase": "Do not use for F23.",
        },
    ]


def _refund_matches(
    refund: CustomerAdvanceRefund,
    *,
    advance_id: int,
    customer_id: int,
    amount: Decimal,
    finance_account_id: int,
    payment_method: str,
    refund_date,
) -> bool:
    return all(
        [
            refund.advance_id == advance_id,
            refund.customer_id == customer_id,
            _money(refund.amount) == amount,
            refund.finance_account_id == finance_account_id,
            (refund.payment_method or "").strip().upper() == payment_method,
            refund.refund_date == refund_date,
        ]
    )


def serialize_customer_advance_refund(refund: CustomerAdvanceRefund) -> dict[str, Any]:
    return {
        "id": refund.id,
        "source_model": SOURCE_MODEL,
        "event_key": EVENT_KEY,
        "refund_reference_no": refund.refund_reference_no,
        "customer_id": refund.customer_id,
        "customer_name": getattr(refund.customer, "name", None),
        "customer_phone": getattr(refund.customer, "phone", None),
        "customer_advance_id": refund.advance_id,
        "advance_reference": refund.advance.reference_no,
        "amount": f"{_money(refund.amount):.2f}",
        "refund_date": refund.refund_date.isoformat() if refund.refund_date else None,
        "payment_method": refund.payment_method,
        "finance_account_id": refund.finance_account_id,
        "finance_account_name": getattr(refund.finance_account, "name", None),
        "status": refund.status,
        "idempotency_key": refund.idempotency_key,
        "created_by_id": refund.created_by_id,
        "created_at": refund.created_at.isoformat() if refund.created_at else None,
        "voided_at": refund.voided_at.isoformat() if refund.voided_at else None,
        "voided_by_id": refund.voided_by_id,
        "void_reason": refund.void_reason,
        "reversal_reference": refund.reversal_reference,
        "metadata_snapshot": refund.metadata_snapshot,
        "accounting_bridge_deferred": True,
        "future_bridge_phase": FUTURE_BRIDGE_PHASE,
        "operator_note": "Accounting bridge posting remains controlled and deferred.",
    }


def list_customer_advance_refund_sources(*, customer_id: int | None = None, advance_id: int | None = None, limit: int = 200) -> list[dict[str, Any]]:
    qs = CustomerAdvanceRefund.objects.select_related("customer", "advance", "finance_account", "created_by").order_by("-refund_date", "-id")
    if customer_id:
        qs = qs.filter(customer_id=customer_id)
    if advance_id:
        qs = qs.filter(advance_id=advance_id)
    return [serialize_customer_advance_refund(row) for row in qs[: max(1, min(limit, 500))]]


@transaction.atomic
def record_customer_advance_refund(
    *,
    customer_advance_id: int,
    amount,
    refunded_by,
    finance_account_id: int,
    payment_method: str = "CASH",
    refund_date,
    refund_reference_no: str | None = None,
    idempotency_key: str | None = None,
    notes: str | None = None,
) -> CustomerAdvanceRefund:
    before_counts = {
        "journals": JournalEntry.objects.count(),
        "bridge_postings": AccountingBridgePosting.objects.count(),
        "reconciliation_items": ReconciliationItem.objects.count(),
    }
    normalized_amount = _money(amount)
    if normalized_amount <= Decimal("0.00"):
        raise ValueError("Refund amount must be greater than zero.")
    normalized_method = (payment_method or "CASH").strip().upper()
    normalized_idempotency = (idempotency_key or "").strip()

    advance = CustomerAdvance.objects.select_for_update().select_related("customer").get(pk=customer_advance_id)
    finance_account = FinancePostingService.resolve_operational_finance_account(finance_account_id=finance_account_id)
    if finance_account.branch_id:
        assert_user_branch_access(user=refunded_by, branch_id=finance_account.branch_id)
    if normalized_amount > _money(advance.unapplied_amount):
        raise ValueError("Refund amount cannot exceed unapplied customer advance balance.")

    normalized_reference = _reference_from(reference_no=refund_reference_no, idempotency_key=normalized_idempotency, advance_id=advance.id, refund_date=refund_date)
    duplicate_filter = Q(refund_reference_no=normalized_reference)
    if normalized_idempotency:
        duplicate_filter |= Q(idempotency_key=normalized_idempotency)
    existing = CustomerAdvanceRefund.objects.select_for_update().filter(duplicate_filter).order_by("id").first()
    if existing is not None:
        if _refund_matches(existing, advance_id=advance.id, customer_id=advance.customer_id, amount=normalized_amount, finance_account_id=finance_account.id, payment_method=normalized_method, refund_date=refund_date):
            return existing
        raise ValueError("Customer advance refund reference/idempotency key already exists with different source evidence.")

    before_unapplied = _money(advance.unapplied_amount)
    refund = CustomerAdvanceRefund.objects.create(
        customer=advance.customer,
        advance=advance,
        finance_account=finance_account,
        refund_reference_no=normalized_reference,
        idempotency_key=normalized_idempotency,
        amount=normalized_amount,
        refund_date=refund_date,
        payment_method=normalized_method,
        status=CustomerAdvanceRefundStatus.ACTIVE,
        created_by=refunded_by,
        notes=(notes or "").strip(),
        metadata_snapshot={
            "source_contract_phase": "F22",
            "event_key": EVENT_KEY,
            "source_model": SOURCE_MODEL,
            "customer_advance_id": advance.id,
            "customer_id": advance.customer_id,
            "refund_reference_no": normalized_reference,
            "idempotency_key": normalized_idempotency,
            "amount": f"{normalized_amount:.2f}",
            "refund_date": refund_date.isoformat() if hasattr(refund_date, "isoformat") else str(refund_date),
            "payment_method": normalized_method,
            "finance_account_id": finance_account.id,
            "finance_account_name": finance_account.name,
            "finance_chart_account_id": finance_account.chart_account_id,
            "advance_reference_no": advance.reference_no,
            "advance_unapplied_before": f"{before_unapplied:.2f}",
            "accounting_bridge_posting_deferred": True,
            "future_bridge_phase": FUTURE_BRIDGE_PHASE,
            "creates_journal_entry": False,
            "creates_accounting_bridge_posting": False,
            "creates_reconciliation_item": False,
        },
    )
    advance.unapplied_amount = before_unapplied - normalized_amount
    if advance.unapplied_amount <= Decimal("0.00"):
        advance.status = CustomerAdvanceStatus.FULLY_APPLIED
    elif advance.unapplied_amount < advance.amount:
        advance.status = CustomerAdvanceStatus.PARTIALLY_APPLIED
    else:
        advance.status = CustomerAdvanceStatus.UNAPPLIED
    advance.save(update_fields=["unapplied_amount", "status", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=refund,
        performed_by=refunded_by,
        metadata={
            "event": "CUSTOMER_ADVANCE_REFUND_SOURCE_RECORDED",
            "source_contract_phase": "F22",
            "customer_advance_refund_id": refund.id,
            "customer_advance_id": advance.id,
            "customer_id": advance.customer_id,
            "amount": f"{normalized_amount:.2f}",
            "refund_reference_no": refund.refund_reference_no,
            "accounting_bridge_posting_deferred": True,
            "future_bridge_phase": FUTURE_BRIDGE_PHASE,
        },
    )
    after_counts = {
        "journals": JournalEntry.objects.count(),
        "bridge_postings": AccountingBridgePosting.objects.count(),
        "reconciliation_items": ReconciliationItem.objects.count(),
    }
    if before_counts != after_counts:
        raise ValueError("Customer advance refund source contract attempted to create accounting/reconciliation records; rolled back.")
    return refund
