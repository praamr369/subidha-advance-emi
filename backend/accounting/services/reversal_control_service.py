from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from billing.models import BillingDocumentStatus, BillingInvoice, CustomerCreditLedger, CustomerRefund, CustomerRefundStatus, DirectSale, DirectSaleReturn, DirectSaleReturnStatus, ReceiptDocument
from subscriptions.models import DeliveryStatus, Subscription, SubscriptionDelivery, SubscriptionStatus
from subscriptions.models import AuditLog, OperationalCancellation
from subscriptions.services.audit_service import log_audit


WORKFLOW_OPEN = {"DRAFT", "NEEDS_REVIEW", "APPROVED"}
WORKFLOW_TERMINAL = {"POSTED", "REJECTED", "CANCELLED"}


def _clean_reason(reason: str | None) -> str:
    cleaned = (reason or "").strip()
    if not cleaned:
        raise ValueError("Reason is required.")
    return cleaned


def _to_decimal(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _parse_source_identity(payload: dict) -> tuple[int | None, str]:
    raw_source_id = payload.get("source_id")
    source_reference = str(payload.get("source_reference") or "").strip()
    if raw_source_id in (None, ""):
        return None, source_reference
    try:
        parsed = int(str(raw_source_id).strip())
    except (TypeError, ValueError):
        return None, source_reference or str(raw_source_id).strip()
    if parsed <= 0:
        return None, source_reference
    return parsed, source_reference


def _clean_cancellation_type(value: str | None) -> str:
    cancellation_type = str(value or "MANUAL_SETTLEMENT").strip().upper()
    valid = {choice[0] for choice in OperationalCancellation.CancellationType.choices}
    if cancellation_type not in valid:
        raise ValidationError({"reversal_type": f"{cancellation_type} is not a valid cancellation type."})
    return cancellation_type


def _status_of(case: OperationalCancellation) -> str:
    status = str((case.metadata or {}).get("workflow_status") or "").strip().upper()
    return status or "POSTED"


def _require_admin(actor) -> None:
    role = (getattr(actor, "role", "") or "").strip().upper()
    if role != "ADMIN" and not getattr(actor, "is_superuser", False):
        raise PermissionError("Only admin can manage reversal control cases.")


def _source_url(case: OperationalCancellation) -> str:
    if case.source_type == "DIRECT_SALE" and case.source_id:
        return f"/admin/billing/direct-sales/{case.source_id}"
    if case.source_type == "BILLING_INVOICE" and case.source_id:
        return f"/admin/billing/invoices/{case.source_id}"
    if case.source_type in {"BILLING_RECEIPT", "RECEIPT"} and case.source_id:
        return f"/admin/billing/receipts/{case.source_id}"
    if case.source_type == "DELIVERY" and case.source_id:
        return f"/admin/deliveries/{case.source_id}"
    if case.source_type == "SUBSCRIPTION" and case.source_id:
        return f"/admin/subscriptions/{case.source_id}"
    return "/admin/finance/reversal-control"


def build_reversal_reconciliation_checklist(case: OperationalCancellation) -> list[dict]:
    metadata = dict(case.metadata or {})
    source_exists = bool(case.source_reference)
    active_receipts = 0
    invoice_ok = True
    return_exists = False
    stock_ok = not bool(metadata.get("stock_return_required"))
    refund_ok = not bool(metadata.get("refund_required"))
    delivery_ok = True
    outstanding_ok = True

    if case.source_type == "DIRECT_SALE" and case.source_id:
        sale = DirectSale.objects.filter(pk=case.source_id).first()
        source_exists = sale is not None
        if sale is not None:
            active_receipts = sale.receipts.exclude(status=BillingDocumentStatus.VOID).count()
            return_exists = sale.sale_returns.exists()
            stock_ok = stock_ok or sale.sale_returns.filter(status=DirectSaleReturnStatus.POSTED).exists()
            linked_invoice = sale.billing_invoices.order_by("-id").first()
            if linked_invoice is not None:
                invoice_ok = linked_invoice.status in {BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID}
    elif case.source_type == "BILLING_INVOICE" and case.source_id:
        invoice = BillingInvoice.objects.filter(pk=case.source_id).first()
        source_exists = invoice is not None
        if invoice is not None:
            active_receipts = invoice.receipts.exclude(status=BillingDocumentStatus.VOID).count()
            invoice_ok = invoice.status in {BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID}
    elif case.source_type in {"BILLING_RECEIPT", "RECEIPT"} and case.source_id:
        receipt = ReceiptDocument.objects.filter(pk=case.source_id).first()
        source_exists = receipt is not None
        active_receipts = 0 if (receipt and receipt.status == BillingDocumentStatus.VOID) else 1
    elif case.source_type == "DELIVERY" and case.source_id:
        delivery = SubscriptionDelivery.objects.filter(pk=case.source_id).first()
        source_exists = delivery is not None
        delivery_ok = delivery is not None and delivery.status in {DeliveryStatus.CANCELLED, DeliveryStatus.RETURNED, DeliveryStatus.DELIVERED}
    elif case.source_type == "SUBSCRIPTION" and case.source_id:
        subscription = Subscription.objects.filter(pk=case.source_id).first()
        source_exists = subscription is not None
        outstanding_ok = subscription is not None and subscription.status in {SubscriptionStatus.CANCELLED, SubscriptionStatus.CLOSED}

    if case.customer_id and not refund_ok:
        refund_ok = CustomerRefund.objects.filter(customer_id=case.customer_id, status=CustomerRefundStatus.PAID).exists()
    if case.customer_id:
        credit_ok = CustomerCreditLedger.objects.filter(customer_id=case.customer_id).exists() or not return_exists
    else:
        credit_ok = True

    def row(key: str, label: str, status: str, detail: str, action_url: str | None = None):
        return {"key": key, "label": label, "status": status, "source": "system", "detail": detail, "action_url": action_url}

    return [
        row("source_exists", "Source exists", "DONE" if source_exists else "BLOCKED", "Source document lookup."),
        row("active_receipts_voided", "Active receipts voided", "DONE" if active_receipts == 0 else "REQUIRED", "Active receipt check.", "/admin/billing/reversals"),
        row("invoice_reversed_or_credited", "Invoice reversed or credited", "DONE" if invoice_ok else "REQUIRED", "Invoice state check."),
        row("return_created", "Return created", "DONE" if return_exists else "NOT_REQUIRED", "Return document linkage."),
        row("stock_return_posted", "Stock return posted", "DONE" if stock_ok else "BLOCKED", "Stock return posting check."),
        row("customer_credit_created_or_not_required", "Customer credit posted", "DONE" if credit_ok else "REQUIRED", "Customer credit ledger check."),
        row("refund_paid_or_not_required", "Refund paid or not required", "DONE" if refund_ok else "REQUIRED", "Refund state check."),
        row("journal_reversal_posted", "Journal reversal posted", "DONE" if bool(metadata.get("posted_at")) else "NOT_REQUIRED", "Posting metadata check."),
        row("delivery_closed_or_return_pickup_created", "Delivery closed/pickup created", "DONE" if delivery_ok else "REQUIRED", "Delivery lifecycle check."),
        row("outstanding_excluded", "Outstanding excluded", "DONE" if outstanding_ok else "REQUIRED", "Operational outstanding exclusion."),
        row("dashboard_excluded", "Dashboard excluded", "DONE" if outstanding_ok else "REQUIRED", "Dashboard exclusion check."),
        row("audit_events_present", "Audit events present", "DONE" if AuditLog.objects.filter(model_name="OperationalCancellation", object_id=case.id).exists() else "BLOCKED", "Audit event log check."),
    ]


def _serialize_case(case: OperationalCancellation) -> dict:
    data = dict(case.metadata or {})
    checklist = build_reversal_reconciliation_checklist(case)
    blocking_reasons = [item["detail"] for item in checklist if item["status"] in {"REQUIRED", "BLOCKED"}]
    source_url = _source_url(case)
    detail_url = f"/admin/finance/reversal-control/{case.id}"
    customer_url = f"/admin/customers/{case.customer_id}" if case.customer_id else None
    return {
        "id": case.id,
        "case_no": f"REV-{case.id:06d}",
        "source_type": case.source_type,
        "source_id": case.source_id,
        "source_reference": case.source_reference,
        "customer_id": case.customer_id,
        "customer_name": getattr(case.customer, "name", None),
        "party_id": case.partner_id,
        "party_name": getattr(case.partner, "username", None),
        "partner_id": case.partner_id,
        "reversal_type": case.cancellation_type,
        "status": _status_of(case),
        "reason": case.reason,
        "amount": str(case.amount_snapshot or "0.00"),
        "amount_snapshot": str(case.amount_snapshot or "0.00"),
        "paid_amount_snapshot": str(data.get("paid_amount_snapshot") or "0.00"),
        "refundable_amount": str(data.get("refundable_amount") or "0.00"),
        "customer_credit_amount": str(data.get("customer_credit_amount") or "0.00"),
        "stock_return_required": bool(data.get("stock_return_required")),
        "delivery_return_required": bool(data.get("delivery_return_required")),
        "accounting_reversal_required": bool(data.get("accounting_reversal_required")),
        "reconciliation_required": bool(data.get("reconciliation_required", True)),
        "internal_note": case.internal_note,
        "created_by": getattr(case.requested_by, "username", None),
        "assigned_to": data.get("assigned_to"),
        "requested_by_id": case.requested_by_id,
        "approved_by_id": case.approved_by_id,
        "posted_by_id": data.get("posted_by_id"),
        "posted_at": data.get("posted_at"),
        "created_at": case.created_at,
        "updated_at": case.cancelled_at,
        "requires_reconciliation": True,
        "reconciliation_status": str(data.get("reconciliation_status") or "PENDING").upper(),
        "blocking_reasons": blocking_reasons,
        "action_summary": "Blocked until checklist requirements are met." if blocking_reasons else "Ready for sync/reconciliation workflow.",
        "source_url": source_url,
        "detail_url": detail_url,
        "customer_url": customer_url,
        "related_document_urls": [url for url in [source_url, customer_url] if url],
        "metadata": data,
    }


@transaction.atomic
def open_reversal_case(*, actor, payload: dict) -> dict:
    _require_admin(actor)
    reason = _clean_reason(payload.get("reason"))
    source_type = str(payload.get("source_type") or "").strip().upper()
    source_id, source_reference = _parse_source_identity(payload)
    cancellation_type = _clean_cancellation_type(payload.get("reversal_type"))
    if not source_type:
        raise ValidationError({"source_type": "source_type is required."})
    if source_id is None and not source_reference:
        raise ValidationError({"source_id": "source_id or source_reference is required."})

    if source_id is not None:
        existing = OperationalCancellation.objects.select_for_update(of=("self",)).filter(
            source_type=source_type,
            source_id=source_id,
        ).first()
        if existing is not None and _status_of(existing) in WORKFLOW_OPEN:
            raise ValidationError({"detail": "An active reversal case already exists for this source."})

    metadata = {
        "workflow_status": "DRAFT",
        "paid_amount_snapshot": str(_to_decimal(payload.get("paid_amount_snapshot"))),
        "refundable_amount": str(_to_decimal(payload.get("refundable_amount"))),
        "customer_credit_amount": str(_to_decimal(payload.get("customer_credit_amount"))),
        "stock_return_required": bool(payload.get("stock_return_required")),
        "delivery_return_required": bool(payload.get("delivery_return_required")),
        "accounting_reversal_required": bool(payload.get("accounting_reversal_required")),
        "reconciliation_required": bool(payload.get("reconciliation_required", True)),
        "settlement_mode": payload.get("settlement_mode"),
    }

    case = OperationalCancellation.objects.create(
        source_type=source_type,
        source_id=source_id,
        source_reference=source_reference,
        customer_id=payload.get("customer_id") or None,
        partner_id=payload.get("partner_id") or None,
        amount_snapshot=_to_decimal(payload.get("amount_snapshot")),
        status_before=str(payload.get("status_before") or "").strip().upper(),
        status_after=str(payload.get("status_after") or "").strip().upper(),
        cancellation_type=cancellation_type,
        reason=reason,
        internal_note=str(payload.get("internal_note") or "").strip(),
        requested_by=actor,
        cancelled_by=actor,
        metadata=metadata,
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=case,
        performed_by=actor,
        metadata={
            "event": "REVERSAL_CASE_OPENED",
            "case_id": case.id,
            "source_type": source_type,
            "source_id": source_id,
            "source_reference": source_reference,
        },
    )
    return _serialize_case(case)


@transaction.atomic
def approve_reversal_case(*, case_id: int, actor, reason: str) -> dict:
    _require_admin(actor)
    _clean_reason(reason)
    case = OperationalCancellation.objects.select_for_update(of=("self",)).get(pk=case_id)
    metadata = dict(case.metadata or {})
    metadata["workflow_status"] = "APPROVED"
    metadata["approval_reason"] = reason
    case.approved_by = actor
    case.metadata = metadata
    case.save(update_fields=["approved_by", "metadata", "cancelled_at"])
    return _serialize_case(case)


@transaction.atomic
def reject_reversal_case(*, case_id: int, actor, reason: str) -> dict:
    _require_admin(actor)
    _clean_reason(reason)
    case = OperationalCancellation.objects.select_for_update(of=("self",)).get(pk=case_id)
    metadata = dict(case.metadata or {})
    metadata["workflow_status"] = "REJECTED"
    metadata["rejection_reason"] = reason
    case.metadata = metadata
    case.save(update_fields=["metadata", "cancelled_at"])
    return _serialize_case(case)


@transaction.atomic
def post_reversal_case(*, case_id: int, actor, reason: str) -> dict:
    _require_admin(actor)
    _clean_reason(reason)
    case = OperationalCancellation.objects.select_for_update(of=("self",)).get(pk=case_id)
    metadata = dict(case.metadata or {})
    metadata["workflow_status"] = "POSTED"
    metadata["post_reason"] = reason
    metadata["posted_by_id"] = getattr(actor, "id", None)
    metadata["posted_at"] = timezone.now().isoformat()
    case.metadata = metadata
    case.save(update_fields=["metadata", "cancelled_at"])
    return _serialize_case(case)


def list_reversal_cases(*, query: str = "", open_only: bool = False) -> dict:
    qs = OperationalCancellation.objects.select_related("customer", "requested_by", "approved_by").all()
    if query:
        q = query.strip()
        qs = qs.filter(
            Q(source_reference__icontains=q)
            | Q(reason__icontains=q)
            | Q(customer__name__icontains=q)
            | Q(customer__phone__icontains=q)
        )
    rows = [_serialize_case(row) for row in qs.order_by("-id")[:200]]
    if open_only:
        rows = [row for row in rows if row["status"] in WORKFLOW_OPEN]
    return {"count": len(rows), "results": rows}


def get_reversal_case(*, case_id: int) -> dict:
    case = OperationalCancellation.objects.get(pk=case_id)
    payload = _serialize_case(case)
    checklist = build_reversal_reconciliation_checklist(case)
    payload["reconciliation_checklist"] = checklist
    payload["allowed_actions"] = {
        "sync": True,
        "reconcile": _status_of(case) not in {"ARCHIVED"},
        "close": all(item["status"] not in {"REQUIRED", "BLOCKED"} for item in checklist),
        "archive": _status_of(case) in {"CLOSED", "POSTED", "REJECTED"},
    }
    payload["timeline_events"] = list(
        AuditLog.objects.filter(model_name="OperationalCancellation", object_id=case.id)
        .order_by("-id")
        .values("id", "action_type", "metadata", "created_at")[:50]
    )
    payload["linked_documents"] = {
        "source_url": payload["source_url"],
        "customer_url": payload["customer_url"],
        "detail_url": payload["detail_url"],
    }
    return payload


@transaction.atomic
def reconcile_reversal_case(*, case_id: int, actor, reason: str) -> dict:
    _require_admin(actor)
    _clean_reason(reason)
    case = OperationalCancellation.objects.select_for_update(of=("self",)).get(pk=case_id)
    metadata = dict(case.metadata or {})
    checklist = build_reversal_reconciliation_checklist(case)
    blockers = [item["detail"] for item in checklist if item["status"] in {"REQUIRED", "BLOCKED"}]
    metadata["reconciliation_status"] = "RECONCILED" if not blockers else "BLOCKED"
    metadata["reconciled_by_id"] = getattr(actor, "id", None)
    metadata["reconciled_at"] = timezone.now().isoformat()
    metadata["reconciliation_reason"] = reason
    metadata["last_checklist"] = checklist
    case.metadata = metadata
    case.save(update_fields=["metadata", "cancelled_at"])
    payload = _serialize_case(case)
    payload["reconciliation_checklist"] = checklist
    return payload


@transaction.atomic
def sync_reversal_case_from_source(*, case_id: int, actor) -> dict:
    _require_admin(actor)
    case = OperationalCancellation.objects.select_for_update(of=("self",)).get(pk=case_id)
    metadata = dict(case.metadata or {})
    metadata["last_synced_by_id"] = getattr(actor, "id", None)
    metadata["last_sync_at"] = timezone.now().isoformat()
    metadata["source_url"] = _source_url(case)
    case.metadata = metadata
    case.save(update_fields=["metadata", "cancelled_at"])
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=case,
        performed_by=actor,
        metadata={"event": "REVERSAL_CASE_SYNCED", "case_id": case.id},
    )
    return get_reversal_case(case_id=case.id)


@transaction.atomic
def assign_reversal_case(*, case_id: int, actor, assignee_id: int, reason: str) -> dict:
    _require_admin(actor)
    _clean_reason(reason)
    case = OperationalCancellation.objects.select_for_update(of=("self",)).get(pk=case_id)
    assignee = User.objects.filter(pk=assignee_id).first()
    if assignee is None:
        raise ValidationError({"assigned_to": "Assignee was not found."})
    metadata = dict(case.metadata or {})
    metadata["assigned_to"] = {"id": assignee.id, "username": assignee.username}
    metadata["assignment_reason"] = reason
    case.metadata = metadata
    case.save(update_fields=["metadata", "cancelled_at"])
    return _serialize_case(case)


@transaction.atomic
def note_reversal_case(*, case_id: int, actor, note: str) -> dict:
    _require_admin(actor)
    clean_note = (note or "").strip()
    if not clean_note:
        raise ValidationError({"note": "note is required."})
    case = OperationalCancellation.objects.select_for_update(of=("self",)).get(pk=case_id)
    metadata = dict(case.metadata or {})
    notes = list(metadata.get("notes") or [])
    notes.append({"note": clean_note, "by": getattr(actor, "username", None), "at": timezone.now().isoformat()})
    metadata["notes"] = notes
    case.metadata = metadata
    case.save(update_fields=["metadata", "cancelled_at"])
    return _serialize_case(case)


@transaction.atomic
def close_reversal_case(*, case_id: int, actor, reason: str, override_reason: str = "") -> dict:
    _require_admin(actor)
    _clean_reason(reason)
    case = OperationalCancellation.objects.select_for_update(of=("self",)).get(pk=case_id)
    checklist = build_reversal_reconciliation_checklist(case)
    blockers = [item for item in checklist if item["status"] in {"REQUIRED", "BLOCKED"}]
    if blockers and not override_reason.strip():
        raise ValidationError({"detail": "Case has unresolved reconciliation blockers.", "blocking_reasons": [row["detail"] for row in blockers]})
    metadata = dict(case.metadata or {})
    metadata["workflow_status"] = "CLOSED"
    metadata["close_reason"] = reason
    if override_reason.strip():
        metadata["close_override_reason"] = override_reason.strip()
    case.metadata = metadata
    case.save(update_fields=["metadata", "cancelled_at"])
    return _serialize_case(case)


@transaction.atomic
def archive_reversal_case(*, case_id: int, actor, reason: str) -> dict:
    _require_admin(actor)
    _clean_reason(reason)
    case = OperationalCancellation.objects.select_for_update(of=("self",)).get(pk=case_id)
    metadata = dict(case.metadata or {})
    metadata["workflow_status"] = "ARCHIVED"
    metadata["archive_reason"] = reason
    case.metadata = metadata
    case.save(update_fields=["metadata", "cancelled_at"])
    return _serialize_case(case)


@transaction.atomic
def patch_reversal_case(*, case_id: int, actor, payload: dict) -> dict:
    _require_admin(actor)
    case = OperationalCancellation.objects.select_for_update(of=("self",)).get(pk=case_id)
    if "reason" in payload:
        case.reason = _clean_reason(payload.get("reason"))
    if "internal_note" in payload:
        case.internal_note = str(payload.get("internal_note") or "").strip()
    metadata = dict(case.metadata or {})
    if "status" in payload:
        metadata["workflow_status"] = str(payload.get("status") or "").strip().upper()
    case.metadata = metadata
    case.save(update_fields=["reason", "internal_note", "metadata", "cancelled_at"])
    return _serialize_case(case)
