from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal

from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone

from billing.models import BillingDocumentStatus, DirectSale, DirectSaleStatus
from billing.services.direct_sale_delivery_bridge_service import compute_direct_sale_delivery_snapshot
from billing.services.direct_sale_operational_state import get_direct_sale_operational_state
from service_desk.models import ServiceDeskCase, ServiceDeskCaseStatus, ServiceDeskCaseType
from subscriptions.models import AuditLog


def _latest_invoice(sale: DirectSale):
    return sale.billing_invoices.order_by("-id").first()


def _as_decimal(value: object) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _validate_delivery_gate(*, sale: DirectSale):
    if not sale.delivery_required:
        raise ValueError("Delivery is disabled for this direct sale.")
    if sale.status in {
        DirectSaleStatus.CANCELLED,
        DirectSaleStatus.CANCELLED_PRE_INVOICE,
        DirectSaleStatus.CANCELLED_AFTER_DELIVERY,
        DirectSaleStatus.REVERSED_POST_INVOICE,
        DirectSaleStatus.RETURNED,
        DirectSaleStatus.ARCHIVED,
        DirectSaleStatus.EXCHANGED_CLOSED,
    }:
        raise ValueError("This direct sale is reversed/archived and cannot be delivered.")
    invoice = _latest_invoice(sale)
    if invoice is None or invoice.status != BillingDocumentStatus.POSTED:
        raise ValueError("Cannot proceed because invoice is not posted.")
    if _as_decimal(sale.balance_total) > Decimal("0.00"):
        raise ValueError("Cannot proceed because payment is due.")
    state = get_direct_sale_operational_state(sale)
    if state.get("delivery_state") == "STOCK_BLOCKED":
        raise ValueError("Cannot proceed because stock requirement is still open.")


def _validate_delivery_gate_allowing_payment_exception(*, case: ServiceDeskCase, sale: DirectSale):
    if not sale.delivery_required:
        raise ValueError("Delivery is disabled for this direct sale.")
    if sale.status in {
        DirectSaleStatus.CANCELLED,
        DirectSaleStatus.CANCELLED_PRE_INVOICE,
        DirectSaleStatus.CANCELLED_AFTER_DELIVERY,
        DirectSaleStatus.REVERSED_POST_INVOICE,
        DirectSaleStatus.RETURNED,
        DirectSaleStatus.ARCHIVED,
        DirectSaleStatus.EXCHANGED_CLOSED,
    }:
        raise ValueError("This direct sale is reversed/archived and cannot be delivered.")
    invoice = _latest_invoice(sale)
    if invoice is None or invoice.status != BillingDocumentStatus.POSTED:
        raise ValueError("Cannot proceed because invoice is not posted.")
    state = get_direct_sale_operational_state(sale)
    if state.get("delivery_state") == "STOCK_BLOCKED":
        raise ValueError("Cannot proceed because stock requirement is still open.")
    if _as_decimal(sale.balance_total) > Decimal("0.00") and not case.payment_exception_approved:
        raise ValueError("Cannot proceed because payment is due.")


def _audit(event: str, *, case: ServiceDeskCase, actor, metadata: dict | None = None):
    log_meta = {"event": event, "case_id": case.id, "direct_sale_id": case.direct_sale_id, "case_no": case.case_no}
    if metadata:
        log_meta.update(metadata)
    AuditLog.objects.create(
        action_type=AuditLog.ActionType.SERVICE_DESK_CASE_STATUS_UPDATED,
        model_name="ServiceDeskCase",
        object_id=case.id,
        performed_by=actor,
        metadata=log_meta,
    )


def _serialize_result(case: ServiceDeskCase) -> dict:
    from billing.services.direct_sale_delivery_queue import serialize_direct_sale_delivery_case

    return serialize_direct_sale_delivery_case(case)


def _date_to_service_due_at(scheduled_date):
    if not scheduled_date:
        return None
    dt = datetime.combine(scheduled_date, time(hour=10, minute=0, second=0))
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _lock_direct_sale_case(*, case_id: int) -> tuple[ServiceDeskCase, DirectSale]:
    case = ServiceDeskCase.objects.select_for_update(of=("self",)).get(
        pk=case_id,
        case_type=ServiceDeskCaseType.DIRECT_SALE_DELIVERY,
    )
    if not case.direct_sale_id:
        raise ValueError("Delivery case is not linked to a direct sale.")
    try:
        sale = DirectSale.objects.select_for_update(of=("self",)).get(pk=case.direct_sale_id)
    except ObjectDoesNotExist as exc:
        raise ValueError("Delivery case is linked to a missing direct sale.") from exc
    return case, sale


@transaction.atomic
def schedule_direct_sale_delivery(
    *,
    case_id: int,
    actor,
    scheduled_date=None,
    receiver_name: str = "",
    receiver_phone: str = "",
    delivery_address_snapshot: str = "",
    notes: str = "",
):
    case, sale = _lock_direct_sale_case(case_id=case_id)
    _validate_delivery_gate(sale=sale)
    if case.status in {ServiceDeskCaseStatus.RESOLVED, ServiceDeskCaseStatus.CLOSED}:
        raise ValueError("Direct sale is already delivered.")
    if case.status == ServiceDeskCaseStatus.CANCELLED:
        raise ValueError("Cancelled direct-sale delivery cannot be scheduled.")
    case.status = ServiceDeskCaseStatus.AUTHORIZED
    case.authorized_at = case.authorized_at or timezone.now()
    case.authorized_by = case.authorized_by or actor
    if scheduled_date:
        case.service_due_at = _date_to_service_due_at(scheduled_date)
    case.reporter_name_snapshot = (receiver_name or case.reporter_name_snapshot or "").strip()
    case.reporter_phone_snapshot = (receiver_phone or case.reporter_phone_snapshot or "").strip()
    note_parts = [f"Scheduled date: {scheduled_date}" if scheduled_date else "", notes.strip()]
    merged = " | ".join([part for part in note_parts if part]).strip()
    if merged:
        case.internal_notes = ((case.internal_notes or "").strip() + "\n" + merged).strip()
    if delivery_address_snapshot.strip():
        case.issue_details = delivery_address_snapshot.strip()
    case.save(
        update_fields=[
            "status",
            "authorized_at",
            "authorized_by",
            "reporter_name_snapshot",
            "reporter_phone_snapshot",
            "service_due_at",
            "internal_notes",
            "issue_details",
            "updated_at",
        ]
    )
    _audit("DIRECT_SALE_DELIVERY_SCHEDULED", case=case, actor=actor)
    return case


@transaction.atomic
def update_direct_sale_delivery_metadata(
    *,
    case_id: int,
    actor,
    scheduled_date=None,
    receiver_name: str | None = None,
    receiver_phone: str | None = None,
    delivery_address_snapshot: str | None = None,
    failure_or_cancellation_reason: str | None = None,
    operational_notes: str | None = None,
):
    case, _ = _lock_direct_sale_case(case_id=case_id)

    update_fields: list[str] = []
    if scheduled_date is not None:
        case.service_due_at = _date_to_service_due_at(scheduled_date)
        update_fields.append("service_due_at")
    if receiver_name is not None:
        case.reporter_name_snapshot = (receiver_name or "").strip()
        update_fields.append("reporter_name_snapshot")
    if receiver_phone is not None:
        case.reporter_phone_snapshot = (receiver_phone or "").strip()
        update_fields.append("reporter_phone_snapshot")
    if delivery_address_snapshot is not None:
        case.issue_details = (delivery_address_snapshot or "").strip()
        update_fields.append("issue_details")
    if failure_or_cancellation_reason is not None:
        case.resolution_summary = (failure_or_cancellation_reason or "").strip()
        update_fields.append("resolution_summary")
    if operational_notes is not None:
        case.internal_notes = (operational_notes or "").strip()
        update_fields.append("internal_notes")

    if update_fields:
        case.save(update_fields=list(dict.fromkeys(update_fields + ["updated_at"])))

    _audit(
        "DIRECT_SALE_DELIVERY_METADATA_UPDATED",
        case=case,
        actor=actor,
        metadata={
            "updated_fields": update_fields,
        },
    )
    return case


@transaction.atomic
def dispatch_direct_sale_delivery(*, case_id: int, actor, notes: str = ""):
    case, sale = _lock_direct_sale_case(case_id=case_id)
    _validate_delivery_gate_allowing_payment_exception(case=case, sale=sale)
    if case.status not in {ServiceDeskCaseStatus.AUTHORIZED, ServiceDeskCaseStatus.OPEN, ServiceDeskCaseStatus.UNDER_REVIEW}:
        raise ValueError("Only scheduled direct-sale deliveries can be dispatched.")
    case.status = ServiceDeskCaseStatus.IN_SERVICE
    if notes.strip():
        case.internal_notes = ((case.internal_notes or "").strip() + "\n" + notes.strip()).strip()
    case.save(update_fields=["status", "internal_notes", "updated_at"])
    _audit("DIRECT_SALE_DELIVERY_DISPATCHED", case=case, actor=actor)
    return case


@transaction.atomic
def mark_direct_sale_delivered(
    *,
    case_id: int,
    actor,
    receiver_name: str,
    receiver_phone: str = "",
    delivery_note: str = "",
    delivered_at=None,
):
    case, sale = _lock_direct_sale_case(case_id=case_id)
    _validate_delivery_gate_allowing_payment_exception(case=case, sale=sale)
    if case.status in {ServiceDeskCaseStatus.RESOLVED, ServiceDeskCaseStatus.CLOSED} or sale.delivered_at:
        raise ValueError("Direct sale is already delivered.")
    if not (receiver_name or case.reporter_name_snapshot or "").strip():
        raise ValueError("Receiver name is required to mark delivered.")
    case.status = ServiceDeskCaseStatus.RESOLVED
    case.reporter_name_snapshot = (receiver_name or case.reporter_name_snapshot or "").strip()
    case.reporter_phone_snapshot = (receiver_phone or case.reporter_phone_snapshot or "").strip()
    case.resolution_summary = (delivery_note or "Delivered to receiver").strip()
    case.resolved_at = timezone.now()
    case.resolved_by = actor
    case.save(
        update_fields=[
            "status",
            "reporter_name_snapshot",
            "reporter_phone_snapshot",
            "resolution_summary",
            "resolved_at",
            "resolved_by",
            "updated_at",
        ]
    )
    sale.delivered_at = delivered_at or timezone.now()
    sale.save(update_fields=["delivered_at", "updated_at"])
    _audit("DIRECT_SALE_DELIVERY_DELIVERED", case=case, actor=actor)
    return case


@transaction.atomic
def cancel_direct_sale_delivery(*, case_id: int, actor, reason: str, notes: str = ""):
    if not (reason or "").strip():
        raise ValueError("Cancellation reason is required.")
    case, _ = _lock_direct_sale_case(case_id=case_id)
    if case.status in {ServiceDeskCaseStatus.RESOLVED, ServiceDeskCaseStatus.CLOSED}:
        raise ValueError("Delivered direct-sale delivery cannot be cancelled.")
    case.status = ServiceDeskCaseStatus.CANCELLED
    case.resolution_summary = f"Cancelled: {reason.strip()}"
    if notes.strip():
        case.internal_notes = ((case.internal_notes or "").strip() + "\n" + notes.strip()).strip()
    case.save(update_fields=["status", "resolution_summary", "internal_notes", "updated_at"])
    _audit("DIRECT_SALE_DELIVERY_CANCELLED", case=case, actor=actor, metadata={"reason": reason.strip()})
    return case


@transaction.atomic
def add_direct_sale_delivery_note(*, case_id: int, actor, note: str):
    note = (note or "").strip()
    if not note:
        raise ValueError("Note is required.")
    case, _ = _lock_direct_sale_case(case_id=case_id)
    case.internal_notes = ((case.internal_notes or "").strip() + "\n" + note).strip()
    case.save(update_fields=["internal_notes", "updated_at"])
    _audit("DIRECT_SALE_DELIVERY_NOTE_ADDED", case=case, actor=actor)
    return case


@transaction.atomic
def approve_direct_sale_delivery_payment_exception(*, case_id: int, actor, reason: str):
    reason = (reason or "").strip()
    if not reason:
        raise ValueError("Approval reason is required.")

    case, sale = _lock_direct_sale_case(case_id=case_id)
    if case.status in {ServiceDeskCaseStatus.RESOLVED, ServiceDeskCaseStatus.CLOSED, ServiceDeskCaseStatus.CANCELLED}:
        raise ValueError("Cannot approve payment exception for a terminal delivery case.")

    invoice = _latest_invoice(sale)
    if invoice is None or invoice.status != BillingDocumentStatus.POSTED:
        raise ValueError("Cannot approve payment exception before invoice posting.")
    if _as_decimal(sale.balance_total) <= Decimal("0.00"):
        raise ValueError("Payment exception is only valid when outstanding balance exists.")

    case.payment_exception_approved = True
    case.payment_exception_reason = reason
    case.payment_exception_approved_by = actor
    case.payment_exception_approved_at = timezone.now()
    case.save(
        update_fields=[
            "payment_exception_approved",
            "payment_exception_reason",
            "payment_exception_approved_by",
            "payment_exception_approved_at",
            "updated_at",
        ]
    )
    _audit(
        "DIRECT_SALE_DELIVERY_PAYMENT_EXCEPTION_APPROVED",
        case=case,
        actor=actor,
        metadata={
            "customer_id": getattr(sale, "customer_id", None),
            "invoice_id": getattr(invoice, "id", None),
            "invoice_number": getattr(invoice, "document_no", None),
            "outstanding_amount": str(_as_decimal(sale.balance_total)),
            "reason": reason,
        },
    )
    return case
