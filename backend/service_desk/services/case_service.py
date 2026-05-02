from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from billing.models import (
    BillingCreditNote,
    BillingCreditNoteLine,
    BillingDebitNote,
    BillingDebitNoteLine,
    BillingDocumentStatus,
    BillingInvoice,
    DirectSale,
)
from billing.services.billing_service import (
    _ensure_credit_sequence,
    _ensure_debit_sequence,
    approve_billing_credit_note,
    approve_billing_debit_note,
    post_billing_credit_note,
    post_billing_debit_note,
)
from crm.services.party_service import sync_party_for_customer
from service_desk.models import (
    MONEY_ZERO,
    QUANTITY_ZERO,
    ServiceDeskCase,
    ServiceDeskCaseLine,
    ServiceDeskCaseStatus,
    ServiceDeskCaseType,
    ServiceDeskFinanceStatus,
    ServiceDeskStockStatus,
)
from subscriptions.models import AuditLog, DeliveryStatus
from subscriptions.services.audit_service import log_audit
from subscriptions.services.delivery_service import (
    mark_subscription_delivery_returned,
    request_subscription_delivery_return,
)


ALLOWED_STATUS_TRANSITIONS: dict[str, set[str]] = {
    ServiceDeskCaseStatus.DRAFT: {
        ServiceDeskCaseStatus.DRAFT,
        ServiceDeskCaseStatus.OPEN,
        ServiceDeskCaseStatus.CANCELLED,
    },
    ServiceDeskCaseStatus.OPEN: {
        ServiceDeskCaseStatus.OPEN,
        ServiceDeskCaseStatus.UNDER_REVIEW,
        ServiceDeskCaseStatus.AUTHORIZED,
        ServiceDeskCaseStatus.REJECTED,
        ServiceDeskCaseStatus.CANCELLED,
    },
    ServiceDeskCaseStatus.UNDER_REVIEW: {
        ServiceDeskCaseStatus.UNDER_REVIEW,
        ServiceDeskCaseStatus.AUTHORIZED,
        ServiceDeskCaseStatus.REJECTED,
        ServiceDeskCaseStatus.CANCELLED,
    },
    ServiceDeskCaseStatus.AUTHORIZED: {
        ServiceDeskCaseStatus.AUTHORIZED,
        ServiceDeskCaseStatus.IN_SERVICE,
        ServiceDeskCaseStatus.RESOLVED,
        ServiceDeskCaseStatus.CANCELLED,
    },
    ServiceDeskCaseStatus.IN_SERVICE: {
        ServiceDeskCaseStatus.IN_SERVICE,
        ServiceDeskCaseStatus.RESOLVED,
        ServiceDeskCaseStatus.CANCELLED,
    },
    ServiceDeskCaseStatus.RESOLVED: {
        ServiceDeskCaseStatus.RESOLVED,
        ServiceDeskCaseStatus.IN_SERVICE,
        ServiceDeskCaseStatus.CLOSED,
    },
    ServiceDeskCaseStatus.REJECTED: {
        ServiceDeskCaseStatus.REJECTED,
        ServiceDeskCaseStatus.CLOSED,
    },
    ServiceDeskCaseStatus.CANCELLED: {
        ServiceDeskCaseStatus.CANCELLED,
        ServiceDeskCaseStatus.CLOSED,
    },
    ServiceDeskCaseStatus.CLOSED: {
        ServiceDeskCaseStatus.CLOSED,
    },
}


def _money(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


def _qty(value) -> Decimal:
    return Decimal(str(value or QUANTITY_ZERO)).quantize(Decimal("0.001"))


def _default_flags_for_case_type(case_type: str) -> dict[str, bool]:
    if case_type == ServiceDeskCaseType.SALES_RETURN:
        return {
            "credit_note_required": True,
            "debit_note_required": False,
            "stock_resolution_required": True,
        }
    if case_type == ServiceDeskCaseType.DELIVERY_RETURN:
        return {
            "credit_note_required": False,
            "debit_note_required": False,
            "stock_resolution_required": True,
        }
    if case_type == ServiceDeskCaseType.EXCHANGE:
        return {
            "credit_note_required": True,
            "debit_note_required": False,
            "stock_resolution_required": True,
        }
    if case_type == ServiceDeskCaseType.SERVICE:
        return {
            "credit_note_required": False,
            "debit_note_required": False,
            "stock_resolution_required": False,
        }
    return {
        "credit_note_required": False,
        "debit_note_required": False,
        "stock_resolution_required": False,
    }


def _latest_invoice_for_case(*, direct_sale=None, subscription=None) -> BillingInvoice | None:
    if direct_sale is not None:
        return direct_sale.billing_invoices.order_by("-id").first()
    if subscription is not None:
        return (
            BillingInvoice.objects.filter(subscription=subscription)
            .order_by("-invoice_date", "-id")
            .first()
        )
    return None


def _resolve_party_and_reporter(payload: dict) -> tuple[object | None, str, str]:
    party = payload.get("party")
    support_request = payload.get("support_request")
    direct_sale = payload.get("direct_sale")
    subscription = payload.get("subscription")
    delivery = payload.get("delivery")
    billing_invoice = payload.get("billing_invoice")

    customer = None
    if support_request is not None:
        customer = getattr(support_request, "customer", None)
    if customer is None and direct_sale is not None:
        customer = getattr(direct_sale, "customer", None)
    if customer is None and subscription is not None:
        customer = getattr(subscription, "customer", None)
    if customer is None and delivery is not None:
        customer = getattr(delivery.subscription, "customer", None)
    if customer is None and billing_invoice is not None:
        customer = getattr(billing_invoice, "customer", None)

    if party is None and customer is not None:
        party = sync_party_for_customer(customer)

    reporter_name = (payload.get("reporter_name_snapshot") or "").strip()
    reporter_phone = (payload.get("reporter_phone_snapshot") or "").strip()
    if not reporter_name:
        reporter_name = (
            getattr(customer, "name", "")
            or getattr(direct_sale, "customer_name_snapshot", "")
            or getattr(billing_invoice, "customer_name_snapshot", "")
        ).strip()
    if not reporter_phone:
        reporter_phone = (
            getattr(customer, "phone", "")
            or getattr(direct_sale, "customer_phone_snapshot", "")
            or getattr(billing_invoice, "customer_phone_snapshot", "")
        ).strip()
    return party, reporter_name, reporter_phone


def _coerce_case_payload(payload: dict) -> dict:
    payload = dict(payload)
    support_request = payload.get("support_request")
    delivery = payload.get("delivery")
    subscription = payload.get("subscription")
    direct_sale = payload.get("direct_sale")
    billing_invoice = payload.get("billing_invoice")
    inventory_item = payload.get("inventory_item")
    product = payload.get("product")
    case_type = payload.get("case_type") or ServiceDeskCaseType.COMPLAINT

    if delivery is not None and subscription is None:
        payload["subscription"] = delivery.subscription
        subscription = delivery.subscription

    if support_request is not None and subscription is None and support_request.subscription_id:
        payload["subscription"] = support_request.subscription
        subscription = support_request.subscription

    if billing_invoice is None:
        billing_invoice = _latest_invoice_for_case(direct_sale=direct_sale, subscription=subscription)
        if billing_invoice is not None:
            payload["billing_invoice"] = billing_invoice
    else:
        if direct_sale is None and billing_invoice.direct_sale_id:
            payload["direct_sale"] = billing_invoice.direct_sale
            direct_sale = billing_invoice.direct_sale
        if subscription is None and billing_invoice.subscription_id:
            payload["subscription"] = billing_invoice.subscription
            subscription = billing_invoice.subscription

    if direct_sale is None and billing_invoice is not None and billing_invoice.direct_sale_id:
        payload["direct_sale"] = billing_invoice.direct_sale
    if product is None and inventory_item is not None:
        payload["product"] = inventory_item.product

    defaults = _default_flags_for_case_type(case_type)
    for field_name, default_value in defaults.items():
        payload.setdefault(field_name, default_value)

    party, reporter_name, reporter_phone = _resolve_party_and_reporter(payload)
    payload["party"] = party
    payload["reporter_name_snapshot"] = reporter_name
    payload["reporter_phone_snapshot"] = reporter_phone

    if payload.get("credit_note_required") or payload.get("debit_note_required"):
        payload["finance_status"] = ServiceDeskFinanceStatus.PENDING
    else:
        payload["finance_status"] = ServiceDeskFinanceStatus.NOT_REQUIRED

    if payload.get("stock_resolution_required"):
        linked_delivery = payload.get("delivery")
        payload["stock_status"] = (
            ServiceDeskStockStatus.SETTLED
            if linked_delivery is not None and linked_delivery.status == DeliveryStatus.RETURNED
            else ServiceDeskStockStatus.PENDING
        )
    else:
        payload["stock_status"] = ServiceDeskStockStatus.NOT_REQUIRED

    return payload


def _normalize_lines(lines: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    for line in lines:
        taxable_amount = _money(line.get("taxable_amount"))
        tax_amount = _money(line.get("tax_amount"))
        normalized.append(
            {
                "product": line.get("product"),
                "inventory_item": line.get("inventory_item"),
                "description": (line.get("description") or "").strip(),
                "quantity": _qty(line.get("quantity") or Decimal("1.000")),
                "disposition": line.get("disposition") or "INSPECT",
                "taxable_amount": taxable_amount,
                "tax_amount": tax_amount,
                "line_total": _money(line.get("line_total") or taxable_amount + tax_amount),
                "notes": (line.get("notes") or "").strip(),
            }
        )
    return normalized


def _replace_case_lines(case: ServiceDeskCase, lines: list[dict]):
    case.lines.all().delete()
    ServiceDeskCaseLine.objects.bulk_create(
        [ServiceDeskCaseLine(service_case=case, **line) for line in _normalize_lines(lines)]
    )


def _recalculate_case_totals(case: ServiceDeskCase):
    taxable_total = MONEY_ZERO
    tax_total = MONEY_ZERO
    for line in case.lines.all():
        taxable_total += _money(line.taxable_amount)
        tax_total += _money(line.tax_amount)
    case.taxable_total = taxable_total
    case.tax_total = tax_total
    case.total_amount = taxable_total + tax_total
    case.save(update_fields=["taxable_total", "tax_total", "total_amount", "updated_at"])


def _note_reason(case: ServiceDeskCase) -> str:
    return f"{case.case_no}: {case.issue_summary}".strip()


def _credit_note_stock_effect(case: ServiceDeskCase) -> bool:
    if case.case_type == ServiceDeskCaseType.DELIVERY_RETURN:
        return False
    if not case.stock_resolution_required:
        return False
    return any(line.inventory_item_id for line in case.lines.all())


def _debit_note_stock_effect(case: ServiceDeskCase) -> bool:
    if not case.stock_resolution_required:
        return False
    return any(line.inventory_item_id for line in case.lines.all())


def _resolve_invoice_for_case(case: ServiceDeskCase) -> BillingInvoice:
    invoice = case.billing_invoice or _latest_invoice_for_case(
        direct_sale=case.direct_sale,
        subscription=case.subscription,
    )
    if invoice is None:
        raise ValueError("A posted or mirror billing invoice is required before posting a return or service note.")
    if case.billing_invoice_id != invoice.id:
        case.billing_invoice = invoice
        case.save(update_fields=["billing_invoice", "updated_at"])
    return invoice


def _validate_financial_case_ready(case: ServiceDeskCase):
    if case.status not in {
        ServiceDeskCaseStatus.AUTHORIZED,
        ServiceDeskCaseStatus.IN_SERVICE,
        ServiceDeskCaseStatus.RESOLVED,
    }:
        raise ValueError("Case must be authorized before posting return or service finance documents.")
    if not case.lines.exists():
        raise ValueError("At least one service desk line is required before posting a finance document.")
    if case.total_amount <= MONEY_ZERO:
        raise ValueError("Service desk case total must be greater than zero before posting a finance document.")


@transaction.atomic
def create_service_desk_case(*, payload: dict, created_by=None) -> ServiceDeskCase:
    lines = payload.pop("lines", [])
    payload = _coerce_case_payload(payload)
    case = ServiceDeskCase.objects.create(**payload)
    if lines:
        _replace_case_lines(case, lines)
    _recalculate_case_totals(case)
    log_audit(
        action_type=AuditLog.ActionType.SERVICE_DESK_CASE_CREATED,
        instance=case,
        performed_by=created_by,
        metadata={
            "event": "SERVICE_DESK_CASE_CREATED",
            "case_no": case.case_no,
            "case_type": case.case_type,
            "support_request_id": case.support_request_id,
            "direct_sale_id": case.direct_sale_id,
            "subscription_id": case.subscription_id,
            "delivery_id": case.delivery_id,
            "billing_invoice_id": case.billing_invoice_id,
        },
    )
    return case


@transaction.atomic
def update_service_desk_case(*, case_id: int, payload: dict, updated_by=None) -> ServiceDeskCase:
    ServiceDeskCase.objects.select_for_update(of=("self",)).get(pk=case_id)
    case = ServiceDeskCase.objects.prefetch_related("lines").get(pk=case_id)
    if case.status in {
        ServiceDeskCaseStatus.CLOSED,
        ServiceDeskCaseStatus.CANCELLED,
    }:
        raise ValueError("Closed or cancelled service desk cases cannot be edited.")
    if case.finance_status == ServiceDeskFinanceStatus.POSTED or case.stock_status == ServiceDeskStockStatus.SETTLED:
        raise ValueError("Posted or stock-settled service desk cases cannot be edited.")

    lines = payload.pop("lines", None)
    next_payload = {
        "case_type": payload.get("case_type", case.case_type),
        "party": payload.get("party", case.party),
        "support_request": payload.get("support_request", case.support_request),
        "direct_sale": payload.get("direct_sale", case.direct_sale),
        "subscription": payload.get("subscription", case.subscription),
        "delivery": payload.get("delivery", case.delivery),
        "billing_invoice": payload.get("billing_invoice", case.billing_invoice),
        "product": payload.get("product", case.product),
        "inventory_item": payload.get("inventory_item", case.inventory_item),
        "reporter_name_snapshot": payload.get("reporter_name_snapshot", case.reporter_name_snapshot),
        "reporter_phone_snapshot": payload.get("reporter_phone_snapshot", case.reporter_phone_snapshot),
        "credit_note_required": payload.get("credit_note_required", case.credit_note_required),
        "debit_note_required": payload.get("debit_note_required", case.debit_note_required),
        "stock_resolution_required": payload.get("stock_resolution_required", case.stock_resolution_required),
    }
    next_payload = _coerce_case_payload(next_payload)

    update_fields: list[str] = []
    for field_name, value in payload.items():
        setattr(case, field_name, value)
        update_fields.append(field_name)
    for field_name, value in next_payload.items():
        if field_name in {
            "finance_status",
            "stock_status",
        } and getattr(case, field_name) in {
            ServiceDeskFinanceStatus.POSTED,
            ServiceDeskStockStatus.SETTLED,
        }:
            continue
        if getattr(case, field_name) != value:
            setattr(case, field_name, value)
            if field_name not in update_fields:
                update_fields.append(field_name)
    if update_fields:
        case.save(update_fields=[*update_fields, "updated_at"])
    if lines is not None:
        _replace_case_lines(case, lines)
    _recalculate_case_totals(case)
    log_audit(
        action_type=AuditLog.ActionType.SERVICE_DESK_CASE_UPDATED,
        instance=case,
        performed_by=updated_by,
        metadata={
            "event": "SERVICE_DESK_CASE_UPDATED",
            "case_no": case.case_no,
            "updated_fields": sorted(set(update_fields + (["lines"] if lines is not None else []))),
        },
    )
    return case


def _validate_transition(current_status: str, next_status: str):
    next_status = (next_status or "").strip().upper()
    if next_status not in ServiceDeskCaseStatus.values:
        raise ValueError("Unsupported service desk case status.")
    allowed_targets = ALLOWED_STATUS_TRANSITIONS.get(current_status, {current_status})
    if next_status not in allowed_targets:
        raise ValueError(f"Cannot change service desk case status from {current_status} to {next_status}.")


@transaction.atomic
def transition_service_desk_case_status(
    *,
    case_id: int,
    next_status: str,
    performed_by=None,
    resolution_summary: str = "",
):
    ServiceDeskCase.objects.select_for_update(of=("self",)).get(pk=case_id)
    case = ServiceDeskCase.objects.get(pk=case_id)
    next_status = (next_status or "").strip().upper()
    _validate_transition(case.status, next_status)
    if case.status == next_status:
        return case, False

    now = timezone.now()
    update_fields = ["status", "updated_at"]
    previous_status = case.status
    if next_status == ServiceDeskCaseStatus.CLOSED and previous_status not in {
        ServiceDeskCaseStatus.RESOLVED,
        ServiceDeskCaseStatus.REJECTED,
        ServiceDeskCaseStatus.CANCELLED,
    }:
        raise ValueError("Only resolved, rejected, or cancelled service desk cases can be closed.")
    case.status = next_status
    if next_status == ServiceDeskCaseStatus.AUTHORIZED:
        case.authorized_at = case.authorized_at or now
        case.authorized_by = case.authorized_by or performed_by
        update_fields.extend(["authorized_at", "authorized_by"])
    if next_status in {ServiceDeskCaseStatus.RESOLVED, ServiceDeskCaseStatus.REJECTED}:
        cleaned_summary = (resolution_summary or "").strip()
        if not cleaned_summary:
            raise ValueError("Resolution summary is required for resolved or rejected service desk cases.")
        case.resolution_summary = cleaned_summary
        case.resolved_at = now
        case.resolved_by = performed_by
        update_fields.extend(["resolution_summary", "resolved_at", "resolved_by"])
    if next_status == ServiceDeskCaseStatus.CLOSED:
        case.closed_at = now
        case.closed_by = performed_by
        update_fields.extend(["closed_at", "closed_by"])

    case.save(update_fields=update_fields)
    log_audit(
        action_type=AuditLog.ActionType.SERVICE_DESK_CASE_STATUS_UPDATED,
        instance=case,
        performed_by=performed_by,
        metadata={
            "event": "SERVICE_DESK_CASE_STATUS_UPDATED",
            "case_no": case.case_no,
            "old_status": previous_status,
            "new_status": next_status,
            "resolution_summary": (resolution_summary or "").strip(),
        },
    )
    return case, True


@transaction.atomic
def request_service_case_delivery_return(*, case_id: int, performed_by=None, notes: str = ""):
    ServiceDeskCase.objects.select_for_update(of=("self",)).get(pk=case_id)
    case = ServiceDeskCase.objects.select_related("delivery").get(pk=case_id)
    if case.delivery_id is None:
        raise ValueError("Service desk case does not link a delivery record.")
    if case.case_type not in {
        ServiceDeskCaseType.DELIVERY_RETURN,
        ServiceDeskCaseType.EXCHANGE,
        ServiceDeskCaseType.SERVICE,
    }:
        raise ValueError("Only delivery-linked return, exchange, or service cases can request a delivery return.")
    if case.delivery.status == DeliveryStatus.RETURNED:
        case.stock_status = ServiceDeskStockStatus.SETTLED
        case.save(update_fields=["stock_status", "updated_at"])
        return case, False

    request_subscription_delivery_return(
        delivery=case.delivery,
        performed_by=performed_by,
        notes=notes,
    )
    if case.status == ServiceDeskCaseStatus.DRAFT:
        case.status = ServiceDeskCaseStatus.OPEN
    if case.stock_status != ServiceDeskStockStatus.SETTLED:
        case.stock_status = ServiceDeskStockStatus.PENDING
    case.save(update_fields=["status", "stock_status", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.SERVICE_DESK_CASE_DELIVERY_RETURN_REQUESTED,
        instance=case,
        performed_by=performed_by,
        metadata={
            "event": "SERVICE_DESK_CASE_DELIVERY_RETURN_REQUESTED",
            "case_no": case.case_no,
            "delivery_id": case.delivery_id,
            "delivery_reference": case.delivery.delivery_reference,
        },
    )
    return case, True


@transaction.atomic
def complete_service_case_delivery_return(*, case_id: int, performed_by=None, notes: str = ""):
    ServiceDeskCase.objects.select_for_update(of=("self",)).get(pk=case_id)
    case = ServiceDeskCase.objects.select_related("delivery").get(pk=case_id)
    if case.delivery_id is None:
        raise ValueError("Service desk case does not link a delivery record.")
    if case.delivery.status != DeliveryStatus.RETURNED:
        mark_subscription_delivery_returned(
            delivery=case.delivery,
            performed_by=performed_by,
            notes=notes,
        )
    case.stock_status = ServiceDeskStockStatus.SETTLED
    case.save(update_fields=["stock_status", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.SERVICE_DESK_CASE_DELIVERY_RETURNED,
        instance=case,
        performed_by=performed_by,
        metadata={
            "event": "SERVICE_DESK_CASE_DELIVERY_RETURNED",
            "case_no": case.case_no,
            "delivery_id": case.delivery_id,
            "delivery_reference": case.delivery.delivery_reference,
        },
    )
    return case, True


def _create_credit_note_from_case(case: ServiceDeskCase) -> BillingCreditNote:
    invoice = _resolve_invoice_for_case(case)
    note_date = timezone.localdate()
    note = BillingCreditNote.objects.create(
        note_date=note_date,
        doc_series=_ensure_credit_sequence(note_date),
        original_invoice=invoice,
        reason=_note_reason(case),
        stock_effect=_credit_note_stock_effect(case),
        taxable_adjustment=case.taxable_total,
        tax_adjustment=case.tax_total,
        total_adjustment=case.total_amount,
    )
    BillingCreditNoteLine.objects.bulk_create(
        [
            BillingCreditNoteLine(
                credit_note=note,
                inventory_item=line.inventory_item,
                description=line.description,
                quantity=line.quantity,
                taxable_value=line.taxable_amount,
                tax_amount=line.tax_amount,
                line_total=line.line_total,
            )
            for line in case.lines.all()
        ]
    )
    case.credit_note = note
    case.save(update_fields=["credit_note", "billing_invoice", "updated_at"])
    return note


def _create_debit_note_from_case(case: ServiceDeskCase) -> BillingDebitNote:
    invoice = _resolve_invoice_for_case(case)
    note_date = timezone.localdate()
    note = BillingDebitNote.objects.create(
        note_date=note_date,
        doc_series=_ensure_debit_sequence(note_date),
        original_invoice=invoice,
        reason=_note_reason(case),
        stock_effect=_debit_note_stock_effect(case),
        taxable_adjustment=case.taxable_total,
        tax_adjustment=case.tax_total,
        total_adjustment=case.total_amount,
    )
    BillingDebitNoteLine.objects.bulk_create(
        [
            BillingDebitNoteLine(
                debit_note=note,
                inventory_item=line.inventory_item,
                description=line.description,
                quantity=line.quantity,
                taxable_value=line.taxable_amount,
                tax_amount=line.tax_amount,
                line_total=line.line_total,
            )
            for line in case.lines.all()
        ]
    )
    case.debit_note = note
    case.save(update_fields=["debit_note", "billing_invoice", "updated_at"])
    return note


@transaction.atomic
def post_credit_note_for_service_case(*, case_id: int, performed_by=None):
    ServiceDeskCase.objects.select_for_update(of=("self",)).get(pk=case_id)
    case = (
        ServiceDeskCase.objects.select_related(
            "billing_invoice", "credit_note", "direct_sale", "subscription", "delivery"
        )
        .prefetch_related("lines")
        .get(pk=case_id)
    )
    if not case.credit_note_required:
        raise ValueError("This service desk case is not configured for a credit note flow.")
    _validate_financial_case_ready(case)

    note = case.credit_note
    if note is None:
        note = _create_credit_note_from_case(case)

    if note.status == BillingDocumentStatus.DRAFT:
        note, _ = approve_billing_credit_note(credit_note_id=note.id, approved_by=performed_by)
    if note.status != BillingDocumentStatus.POSTED:
        note, _ = post_billing_credit_note(credit_note_id=note.id, posted_by=performed_by)

    case.credit_note = note
    case.finance_status = ServiceDeskFinanceStatus.POSTED
    if note.stock_effect:
        case.stock_status = ServiceDeskStockStatus.SETTLED
    case.save(update_fields=["credit_note", "finance_status", "stock_status", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.SERVICE_DESK_CASE_CREDIT_NOTE_POSTED,
        instance=case,
        performed_by=performed_by,
        metadata={
            "event": "SERVICE_DESK_CASE_CREDIT_NOTE_POSTED",
            "case_no": case.case_no,
            "credit_note_id": note.id,
            "credit_note_no": note.note_no,
            "billing_invoice_id": note.original_invoice_id,
        },
    )
    return case, note


@transaction.atomic
def post_debit_note_for_service_case(*, case_id: int, performed_by=None):
    ServiceDeskCase.objects.select_for_update(of=("self",)).get(pk=case_id)
    case = (
        ServiceDeskCase.objects.select_related(
            "billing_invoice", "debit_note", "direct_sale", "subscription", "delivery"
        )
        .prefetch_related("lines")
        .get(pk=case_id)
    )
    if not case.debit_note_required:
        raise ValueError("This service desk case is not configured for a debit note flow.")
    _validate_financial_case_ready(case)

    note = case.debit_note
    if note is None:
        note = _create_debit_note_from_case(case)

    if note.status == BillingDocumentStatus.DRAFT:
        note, _ = approve_billing_debit_note(debit_note_id=note.id, approved_by=performed_by)
    if note.status != BillingDocumentStatus.POSTED:
        note, _ = post_billing_debit_note(debit_note_id=note.id, posted_by=performed_by)

    case.debit_note = note
    case.finance_status = ServiceDeskFinanceStatus.POSTED
    if note.stock_effect:
        case.stock_status = ServiceDeskStockStatus.SETTLED
    case.save(update_fields=["debit_note", "finance_status", "stock_status", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.SERVICE_DESK_CASE_DEBIT_NOTE_POSTED,
        instance=case,
        performed_by=performed_by,
        metadata={
            "event": "SERVICE_DESK_CASE_DEBIT_NOTE_POSTED",
            "case_no": case.case_no,
            "debit_note_id": note.id,
            "debit_note_no": note.note_no,
            "billing_invoice_id": note.original_invoice_id,
        },
    )
    return case, note


@transaction.atomic
def link_replacement_direct_sale(*, case_id: int, replacement_direct_sale_id: int, performed_by=None):
    ServiceDeskCase.objects.select_for_update(of=("self",)).get(pk=case_id)
    case = ServiceDeskCase.objects.select_related("direct_sale").get(pk=case_id)
    if case.case_type != ServiceDeskCaseType.EXCHANGE:
        raise ValueError("Replacement direct-sale linkage is only available for exchange cases.")
    if case.direct_sale_id and case.direct_sale_id == replacement_direct_sale_id:
        raise ValueError("Replacement direct sale must differ from the original direct sale.")

    replacement_sale = DirectSale.objects.get(pk=replacement_direct_sale_id)
    if case.direct_sale_id and case.direct_sale and case.direct_sale.customer_id and replacement_sale.customer_id:
        if case.direct_sale.customer_id != replacement_sale.customer_id:
            raise ValueError("Replacement direct sale must belong to the same customer as the original sale.")

    case.replacement_direct_sale = replacement_sale
    case.save(update_fields=["replacement_direct_sale", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.SERVICE_DESK_CASE_REPLACEMENT_LINKED,
        instance=case,
        performed_by=performed_by,
        metadata={
            "event": "SERVICE_DESK_CASE_REPLACEMENT_LINKED",
            "case_no": case.case_no,
            "replacement_direct_sale_id": replacement_sale.id,
            "replacement_direct_sale_no": replacement_sale.sale_no,
        },
    )
    return case, True
