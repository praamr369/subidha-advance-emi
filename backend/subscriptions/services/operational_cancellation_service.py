from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    DeliveryStatus,
    EmiStatus,
    OperationalCancellation,
    PlanType,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.services.lucky_id_release_service import (
    release_lucky_id_for_cancelled_subscription,
)

MONEY_ZERO = Decimal("0.00")


def _require_admin(actor) -> None:
    role = (getattr(actor, "role", "") or "").strip().upper()
    if role != "ADMIN" and not getattr(actor, "is_superuser", False):
        raise PermissionError("Only admin can cancel operational records.")


def _clean_reason(reason: str | None) -> str:
    cleaned = (reason or "").strip()
    if not cleaned:
        raise ValidationError({"reason": "Cancellation reason is required."})
    return cleaned


def _already_cancelled(source_type: str, source_id: int) -> bool:
    return OperationalCancellation.objects.filter(
        source_type=source_type,
        source_id=source_id,
    ).exists()


def _create_cancellation(
    *,
    source_type: str,
    source_id: int,
    source_reference: str = "",
    cancellation_type: str,
    reason: str,
    actor,
    customer=None,
    partner=None,
    amount_snapshot=None,
    status_before: str = "",
    status_after: str = "",
    internal_note: str = "",
    reversal_reference: str | None = None,
    metadata: dict | None = None,
) -> OperationalCancellation:
    if _already_cancelled(source_type, source_id):
        raise ValidationError({"detail": "This record already has an audited cancellation."})
    return OperationalCancellation.objects.create(
        source_type=source_type,
        source_id=source_id,
        source_reference=source_reference or "",
        customer=customer,
        partner=partner,
        amount_snapshot=amount_snapshot,
        status_before=status_before or "",
        status_after=status_after or "",
        cancellation_type=cancellation_type,
        reason=reason,
        internal_note=internal_note or "",
        requested_by=actor,
        approved_by=actor,
        cancelled_by=actor,
        reversal_reference=reversal_reference,
        metadata=metadata or {},
    )


def _result(
    *,
    source_type: str,
    source_id: int,
    previous_status: str,
    new_status: str,
    cancellation: OperationalCancellation | None = None,
    reversal_reference: str | None = None,
    blocked_reason: str = "",
    next_required_action: str = "",
) -> dict:
    return {
        "source_type": source_type,
        "source_id": source_id,
        "previous_status": previous_status,
        "new_status": new_status,
        "cancellation_id": getattr(cancellation, "id", None),
        "reversal_reference": reversal_reference,
        "blocked_reason": blocked_reason,
        "next_required_action": next_required_action,
    }


def _reverse_posted_journal_for_source(*, source_instance, purpose: str, reason: str, actor):
    from accounting.models import JournalEntryLine
    from accounting.services.bridge_posting_service import post_bridge_entry

    journal = getattr(source_instance, "posted_journal_entry", None)
    if journal is None:
        return None
    lines = []
    for line in JournalEntryLine.objects.filter(journal_entry=journal).select_related("chart_account").order_by("id"):
        lines.append(
            {
                "chart_account": line.chart_account,
                "description": f"Reversal of {journal.entry_no}",
                "debit_amount": line.credit_amount,
                "credit_amount": line.debit_amount,
            }
        )
    if not lines:
        raise ValidationError({"detail": "Posted journal has no lines to reverse."})
    reversal, _ = post_bridge_entry(
        source_instance=source_instance,
        purpose=purpose,
        entry_date=timezone.localdate(),
        memo=f"Cancellation reversal: {reason[:120]}",
        lines=lines,
        voucher_type=purpose,
        source_type=getattr(source_instance, "source_type", None) or source_instance.__class__.__name__.upper(),
        source_reference=getattr(source_instance, "source_reference", None)
        or getattr(source_instance, "document_no", None)
        or str(source_instance.pk),
        source_document_no=getattr(source_instance, "document_no", "") or "",
        source_event_date=timezone.localdate(),
        trace_metadata={"reason": reason, "source_status": getattr(source_instance, "status", "")},
        posted_by=actor,
    )
    return reversal


@transaction.atomic
def cancel_billing_invoice(*, invoice_id: int, actor, reason: str, internal_note: str = "", reversal_policy: str = "NONE") -> dict:
    from billing.models import BillingDocumentStatus, BillingInvoice, ReceiptDocument
    from billing.services.billing_service import recalculate_direct_sale_settlement, recalculate_invoice_settlement

    _require_admin(actor)
    reason = _clean_reason(reason)
    invoice = BillingInvoice.objects.select_for_update(of=("self",)).select_related(
        "customer", "direct_sale", "posted_journal_entry"
    ).get(pk=invoice_id)
    recalculate_invoice_settlement(invoice)
    if invoice.direct_sale_id:
        recalculate_direct_sale_settlement(invoice.direct_sale)
    previous_status = invoice.status
    source_type = OperationalCancellation.SourceType.BILLING_INVOICE

    if previous_status in {BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID}:
        raise ValidationError({"detail": "Invoice is already cancelled or void."})

    active_receipts = ReceiptDocument.objects.filter(
        billing_invoice=invoice,
        status=BillingDocumentStatus.POSTED,
    )
    if active_receipts.exists() or Decimal(str(invoice.received_total or MONEY_ZERO)) > MONEY_ZERO:
        raise ValidationError(
            {
                "detail": "Reverse linked receipts before cancelling this invoice.",
                "blocking_reasons": ["Reverse linked receipts before cancelling this invoice."],
                "blocking_reason_codes": ["ACTIVE_RECEIPT_EXISTS"],
            }
        )

    reversal_reference = None
    if previous_status == BillingDocumentStatus.POSTED:
        reversal = _reverse_posted_journal_for_source(
            source_instance=invoice,
            purpose="BILLING_INVOICE_CANCEL_REVERSAL",
            reason=reason,
            actor=actor,
        )
        reversal_reference = getattr(reversal, "entry_no", None)
        invoice.status = BillingDocumentStatus.VOID
    else:
        invoice.status = BillingDocumentStatus.CANCELLED

    invoice.notes = f"{(invoice.notes or '').strip()}\nCancellation reason: {reason}".strip()
    invoice.save(update_fields=["status", "notes", "updated_at"])

    cancellation = _create_cancellation(
        source_type=source_type,
        source_id=invoice.id,
        source_reference=invoice.document_no or f"INV-{invoice.id}",
        cancellation_type=(
            OperationalCancellation.CancellationType.CANCEL_WITH_REVERSAL
            if reversal_reference
            else OperationalCancellation.CancellationType.VOID_UNPOSTED
        ),
        reason=reason,
        internal_note=internal_note,
        actor=actor,
        customer=invoice.customer,
        amount_snapshot=invoice.grand_total,
        status_before=previous_status,
        status_after=invoice.status,
        reversal_reference=reversal_reference,
        metadata={"direct_sale_id": invoice.direct_sale_id, "reversal_policy": reversal_policy},
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=invoice,
        performed_by=actor,
        metadata={
            "event": "INVOICE_CANCELLED",
            "reason": reason,
            "old_status": previous_status,
            "new_status": invoice.status,
            "operational_cancellation_id": cancellation.id,
            "reversal_reference": reversal_reference,
        },
    )
    return _result(
        source_type=source_type,
        source_id=invoice.id,
        previous_status=previous_status,
        new_status=invoice.status,
        cancellation=cancellation,
        reversal_reference=reversal_reference,
    )


@transaction.atomic
def cancel_stock_requirement(*, requirement_id: int, actor, reason: str, internal_note: str = "") -> dict:
    from inventory.models import PurchaseNeed, PurchaseNeedStatus

    _require_admin(actor)
    reason = _clean_reason(reason)
    need = PurchaseNeed.objects.select_for_update(of=("self",)).select_related("customer").get(pk=requirement_id)
    previous_status = need.status
    if previous_status == PurchaseNeedStatus.CANCELLED:
        raise ValidationError({"detail": "Stock requirement is already cancelled."})
    if previous_status in {
        PurchaseNeedStatus.ORDERED,
        PurchaseNeedStatus.PARTIALLY_FULFILLED,
        PurchaseNeedStatus.RECEIVED,
        PurchaseNeedStatus.FULFILLED,
        PurchaseNeedStatus.CLOSED,
    }:
        raise ValidationError({"detail": "Stock requirement is already linked to downstream purchasing or receipt activity."})

    need.status = PurchaseNeedStatus.CANCELLED
    need.fulfilled_at = timezone.now()
    need.note = f"{(need.note or '').strip()}\nCancellation reason: {reason}".strip()
    need.save(update_fields=["status", "fulfilled_at", "note", "updated_at"])
    cancellation = _create_cancellation(
        source_type=OperationalCancellation.SourceType.STOCK_REQUIREMENT,
        source_id=need.id,
        source_reference=need.need_no,
        cancellation_type=OperationalCancellation.CancellationType.STOCK_REQUIREMENT_CANCEL,
        reason=reason,
        internal_note=internal_note,
        actor=actor,
        customer=need.customer,
        status_before=previous_status,
        status_after=need.status,
        metadata={"source_module": need.source_module, "source_object_id": need.source_object_id},
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=need,
        performed_by=actor,
        metadata={
            "event": "STOCK_REQUIREMENT_CANCELLED",
            "reason": reason,
            "old_status": previous_status,
            "new_status": need.status,
            "operational_cancellation_id": cancellation.id,
        },
    )
    return _result(
        source_type=OperationalCancellation.SourceType.STOCK_REQUIREMENT,
        source_id=need.id,
        previous_status=previous_status,
        new_status=need.status,
        cancellation=cancellation,
    )


@transaction.atomic
def cancel_direct_sale(*, direct_sale_id: int, actor, reason: str, internal_note: str = "", reversal_policy: str = "NONE") -> dict:
    from billing.models import BillingDocumentStatus, DirectSale, DirectSaleStatus, ReceiptDocument
    from service_desk.models import ServiceDeskCase, ServiceDeskCaseStatus, ServiceDeskCaseType
    from inventory.models import PurchaseNeed, PurchaseNeedStatus

    _require_admin(actor)
    reason = _clean_reason(reason)
    sale = DirectSale.objects.select_for_update(of=("self",)).select_related("customer").get(pk=direct_sale_id)
    previous_status = sale.status
    if previous_status == DirectSaleStatus.CANCELLED:
        raise ValidationError({"detail": "Direct sale is already cancelled."})
    if previous_status == DirectSaleStatus.DELIVERED or sale.delivered_at:
        raise ValidationError({"detail": "Delivered direct sales require a return/reversal workflow before cancellation."})

    active_receipts = ReceiptDocument.objects.filter(
        direct_sale=sale,
        status=BillingDocumentStatus.POSTED,
    )
    if active_receipts.exists() or Decimal(str(sale.received_total or MONEY_ZERO)) > MONEY_ZERO:
        raise ValidationError(
            {
                "detail": "Reverse direct-sale receipts before cancelling this sale.",
                "blocking_reasons": ["ACTIVE_RECEIPT_EXISTS"],
            }
        )

    invoices = list(sale.billing_invoices.select_for_update(of=("self",)).all())
    for invoice in invoices:
        if invoice.status in {BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID}:
            continue
        cancel_billing_invoice(
            invoice_id=invoice.id,
            actor=actor,
            reason=reason,
            internal_note=internal_note,
            reversal_policy=reversal_policy,
        )

    PurchaseNeed.objects.select_for_update(of=("self",)).filter(
        source_module=PurchaseNeed.SourceModule.DIRECT_SALE,
        source_object_id=str(sale.id),
        status__in=[PurchaseNeedStatus.OPEN, PurchaseNeedStatus.IN_REVIEW],
    ).update(
        status=PurchaseNeedStatus.CANCELLED,
        fulfilled_at=timezone.now(),
        note="Cancelled because linked direct sale was cancelled.",
        updated_at=timezone.now(),
    )

    ServiceDeskCase.objects.select_for_update(of=("self",)).filter(
        direct_sale=sale,
        case_type=ServiceDeskCaseType.DIRECT_SALE_DELIVERY,
    ).exclude(
        status__in=[
            ServiceDeskCaseStatus.CLOSED,
            ServiceDeskCaseStatus.RESOLVED,
            ServiceDeskCaseStatus.REJECTED,
            ServiceDeskCaseStatus.CANCELLED,
        ]
    ).update(status=ServiceDeskCaseStatus.CANCELLED, updated_at=timezone.now())

    DirectSale.objects.filter(pk=sale.pk).update(
        status=DirectSaleStatus.CANCELLED,
        notes=f"{(sale.notes or '').strip()}\nCancellation reason: {reason}".strip(),
        updated_at=timezone.now(),
    )
    sale.status = DirectSaleStatus.CANCELLED

    cancellation = _create_cancellation(
        source_type=OperationalCancellation.SourceType.DIRECT_SALE,
        source_id=sale.id,
        source_reference=sale.sale_no or f"SALE-{sale.id}",
        cancellation_type=(
            OperationalCancellation.CancellationType.CANCEL_DRAFT
            if previous_status == DirectSaleStatus.DRAFT
            else OperationalCancellation.CancellationType.CANCEL_WITH_REVERSAL
        ),
        reason=reason,
        internal_note=internal_note,
        actor=actor,
        customer=sale.customer,
        amount_snapshot=sale.grand_total,
        status_before=previous_status,
        status_after=DirectSaleStatus.CANCELLED,
        metadata={
            "invoice_ids": [invoice.id for invoice in invoices],
            "reversal_policy": reversal_policy,
        },
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=sale,
        performed_by=actor,
        metadata={
            "event": "DIRECT_SALE_CANCELLED",
            "reason": reason,
            "old_status": previous_status,
            "new_status": DirectSaleStatus.CANCELLED,
            "operational_cancellation_id": cancellation.id,
        },
    )
    return _result(
        source_type=OperationalCancellation.SourceType.DIRECT_SALE,
        source_id=sale.id,
        previous_status=previous_status,
        new_status=DirectSaleStatus.CANCELLED,
        cancellation=cancellation,
    )


@transaction.atomic
def cancel_subscription(*, subscription_id: int, actor, reason: str, internal_note: str = "", force_after_activation: bool = False) -> dict:
    _require_admin(actor)
    reason = _clean_reason(reason)
    subscription = Subscription.objects.select_for_update(of=("self",)).select_related(
        "customer", "partner", "batch", "lucky_id"
    ).get(pk=subscription_id)
    previous_status = subscription.status
    if previous_status == SubscriptionStatus.CANCELLED:
        raise ValidationError({"detail": "Subscription is already cancelled."})
    if previous_status == SubscriptionStatus.WON:
        raise ValidationError({"detail": "Won subscriptions require manual audited settlement before cancellation."})
    if previous_status in {SubscriptionStatus.COMPLETED, SubscriptionStatus.CLOSED}:
        raise ValidationError({"detail": "Completed or closed subscriptions cannot be cancelled."})

    active_payments = subscription.payments.exclude(allocation_metadata__reversal__is_reversed=True).exists()
    if active_payments and not force_after_activation:
        raise ValidationError({"detail": "Active subscription payments must be reversed or explicitly settled before cancellation."})

    pending_emis = subscription.emis.select_for_update(of=("self",)).filter(status=EmiStatus.PENDING)
    pending_emi_count = pending_emis.count()
    pending_emis.update(status=EmiStatus.CANCELLED)

    Subscription.objects.filter(pk=subscription.pk).update(
        status=SubscriptionStatus.CANCELLED,
        cancellation_reason=reason,
        cancelled_at=timezone.now(),
        cancelled_by_id=getattr(actor, "pk", None),
    )
    subscription.refresh_from_db(fields=["id", "batch_id", "lucky_id_id", "status", "customer_id"])
    lucky_release_result = release_lucky_id_for_cancelled_subscription(
        subscription=subscription,
        actor=actor,
        reason=reason,
    )

    cancellation = _create_cancellation(
        source_type=OperationalCancellation.SourceType.SUBSCRIPTION,
        source_id=subscription.id,
        source_reference=subscription.subscription_number or subscription.contract_reference or f"SUB-{subscription.id}",
        cancellation_type=OperationalCancellation.CancellationType.CONTRACT_TERMINATION,
        reason=reason,
        internal_note=internal_note,
        actor=actor,
        customer=subscription.customer,
        partner=subscription.partner,
        amount_snapshot=subscription.total_amount,
        status_before=previous_status,
        status_after=SubscriptionStatus.CANCELLED,
        metadata={
            "force_after_activation": force_after_activation,
            "pending_emi_count_cancelled": pending_emi_count,
            "lucky_id_released": bool(lucky_release_result.get("released")),
            "lucky_id_release_blocked": bool(lucky_release_result.get("blocked")),
            "batch_status": lucky_release_result.get("batch_status"),
        },
    )
    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_CANCELLED,
        instance=subscription,
        performed_by=actor,
        metadata={
            "reason": reason,
            "old_status": previous_status,
            "new_status": SubscriptionStatus.CANCELLED,
            "operational_cancellation_id": cancellation.id,
            "lucky_id_released": bool(lucky_release_result.get("released")),
            "lucky_id_release_blocked": bool(lucky_release_result.get("blocked")),
        },
    )
    return _result(
        source_type=OperationalCancellation.SourceType.SUBSCRIPTION,
        source_id=subscription.id,
        previous_status=previous_status,
        new_status=SubscriptionStatus.CANCELLED,
        cancellation=cancellation,
    )


@transaction.atomic
def record_delivery_cancellation_audit(*, delivery, actor, reason: str) -> OperationalCancellation:
    _require_admin(actor)
    reason = _clean_reason(reason)
    if _already_cancelled(OperationalCancellation.SourceType.DELIVERY, delivery.id):
        raise ValidationError({"detail": "Delivery already has an audited cancellation."})
    return _create_cancellation(
        source_type=OperationalCancellation.SourceType.DELIVERY,
        source_id=delivery.id,
        source_reference=delivery.delivery_reference or f"DEL-{delivery.id}",
        cancellation_type=OperationalCancellation.CancellationType.DELIVERY_CANCEL,
        reason=reason,
        actor=actor,
        customer=getattr(delivery.subscription, "customer", None),
        partner=getattr(delivery.subscription, "partner", None),
        status_before="",
        status_after=DeliveryStatus.CANCELLED,
        metadata={"subscription_id": delivery.subscription_id},
    )
