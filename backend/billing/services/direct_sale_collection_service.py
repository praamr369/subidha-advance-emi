from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from accounting.models import FinanceAccount
from accounting.services.finance_account_collection_guard import (
    assert_finance_account_allowed_for_payment_collection,
)
from billing.models import (
    BillingDocumentStatus,
    BillingInvoice,
    DirectSale,
    ReceiptDocument,
    ReceiptType,
)
from billing.services.billing_service import create_manual_receipt
from branch_control.models import CashCounter
from branch_control.services.branch_service import (
    assigned_counter_for_user,
    assert_user_branch_access,
    assert_user_counter_access,
)
from subscriptions.models import AuditLog, BusinessEventType, Customer
from subscriptions.services.audit_service import log_audit
from subscriptions.services.business_event_service import append_business_event
from subscriptions.services.operational_notification_service import (
    schedule_direct_sale_collection_notifications,
)


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _normalize_text(value: str | None) -> str:
    return (value or "").strip()


def _reference_marker(reference_no: str | None) -> str:
    normalized = _normalize_text(reference_no).upper()
    if not normalized:
        return ""
    return f"[collection-ref:{normalized}]"


def _build_receipt_notes(*, notes: str, reference_no: str | None) -> str:
    marker = _reference_marker(reference_no)
    lines = [line for line in [marker, _normalize_text(notes)] if line]
    return "\n".join(lines).strip()


def _posted_retail_receipt_total(*, sale: DirectSale) -> Decimal:
    total = (
        sale.receipts.filter(
            receipt_type=ReceiptType.RETAIL_RECEIPT,
            status=BillingDocumentStatus.POSTED,
        ).aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )
    return _money(total)


def _resolve_branch_counter_and_finance_account(
    *,
    sale: DirectSale,
    actor,
    branch_id: int | None,
    cash_counter_id: int | None,
    finance_account_id: int | None,
):
    role = (getattr(actor, "role", "") or "").upper()
    assigned_counter = assigned_counter_for_user(actor)
    cash_counter = None

    if cash_counter_id is not None:
        cash_counter = (
            CashCounter.objects.select_related("branch", "finance_account")
            .filter(pk=cash_counter_id, is_active=True)
            .first()
        )
        if cash_counter is None:
            raise ValueError("Selected cash counter is not active.")
        assert_user_counter_access(user=actor, counter=cash_counter)
    elif role == "CASHIER":
        if assigned_counter is None:
            raise ValueError("Cashier is not assigned to an active cash counter.")
        cash_counter = assigned_counter
        assert_user_counter_access(user=actor, counter=cash_counter)

    resolved_branch_id = (
        branch_id
        or getattr(cash_counter, "branch_id", None)
        or sale.branch_id
    )
    if sale.branch_id and resolved_branch_id and int(resolved_branch_id) != int(sale.branch_id):
        raise ValueError("Direct-sale collections must use the sale branch.")
    assert_user_branch_access(user=actor, branch_id=resolved_branch_id or sale.branch_id)

    resolved_finance_account_id = (
        finance_account_id
        or getattr(cash_counter, "finance_account_id", None)
        or sale.finance_account_id
    )
    if resolved_finance_account_id is None:
        raise ValueError("Finance account selection is required for direct-sale collection.")

    finance_account = (
        FinanceAccount.objects.select_related("branch", "chart_account")
        .filter(pk=resolved_finance_account_id, is_active=True)
        .first()
    )
    if finance_account is None:
        raise ValueError("Selected finance account is not active.")

    if cash_counter and cash_counter.finance_account_id != finance_account.id:
        raise ValueError("Selected cash counter is linked to a different finance account.")
    if cash_counter and sale.branch_id and cash_counter.branch_id != sale.branch_id:
        raise ValueError("Selected cash counter does not belong to the direct-sale branch.")
    if finance_account.branch_id and sale.branch_id and finance_account.branch_id != sale.branch_id:
        raise ValueError("Selected finance account does not belong to the direct-sale branch.")

    assert_finance_account_allowed_for_payment_collection(finance_account)

    resolved_branch_id = resolved_branch_id or finance_account.branch_id or sale.branch_id

    return resolved_branch_id, cash_counter, finance_account


def _current_receivable_position(*, sale: DirectSale, invoice: BillingInvoice) -> dict[str, Decimal]:
    posted_receipt_total = _posted_retail_receipt_total(sale=sale)
    collected_total = max(
        _money(sale.received_total),
        _money(invoice.received_total),
        posted_receipt_total,
    )
    outstanding = _money(sale.grand_total) - collected_total
    if outstanding < Decimal("0.00"):
        outstanding = Decimal("0.00")
    return {
        "posted_receipt_total": posted_receipt_total,
        "collected_total": collected_total,
        "outstanding": outstanding,
    }


def get_direct_sale_receivable_position(*, direct_sale_id: int) -> dict[str, object]:
    sale = (
        DirectSale.objects.select_related("customer", "branch", "finance_account")
        .prefetch_related("receipts")
        .get(pk=direct_sale_id)
    )
    invoice = (
        BillingInvoice.objects.select_related("branch", "finance_account")
        .filter(direct_sale=sale)
        .order_by("-id")
        .first()
    )
    if invoice is None:
        return {
            "direct_sale": sale,
            "invoice": None,
            "posted_receipt_total": Decimal("0.00"),
            "collected_total": _money(sale.received_total),
            "outstanding": _money(sale.balance_total),
            "collection_supported": False,
            "disabled_reason": "Linked billing invoice was not found for this direct sale.",
        }

    position = _current_receivable_position(sale=sale, invoice=invoice)
    collection_supported = (
        sale.status == "INVOICED"
        and invoice.status == BillingDocumentStatus.POSTED
        and position["outstanding"] > Decimal("0.00")
    )
    disabled_reason = None
    if not collection_supported:
        if position["outstanding"] <= Decimal("0.00"):
            disabled_reason = "This direct sale has no outstanding balance."
        elif sale.status != "INVOICED":
            disabled_reason = "Only invoiced direct sales can accept later collections."
        elif invoice.status != BillingDocumentStatus.POSTED:
            disabled_reason = "Direct-sale collections require a posted retail invoice."

    return {
        "direct_sale": sale,
        "invoice": invoice,
        **position,
        "collection_supported": collection_supported,
        "disabled_reason": disabled_reason,
    }


@transaction.atomic
def collect_direct_sale_payment(
    *,
    direct_sale_id: int,
    amount,
    collected_by,
    receipt_date=None,
    finance_account_id: int | None = None,
    branch_id: int | None = None,
    cash_counter_id: int | None = None,
    reference_no: str | None = None,
    notes: str | None = None,
    contract_reference_id: int | None = None,
    unified_collection_source_type: str | None = None,
    unified_collection_source_id: int | None = None,
):
    amount = _money(amount)
    if amount <= Decimal("0.00"):
        raise ValueError("Collection amount must be greater than zero.")

    DirectSale.objects.select_for_update(of=("self",)).get(pk=direct_sale_id)
    sale = (
        DirectSale.objects.select_related("branch", "cash_counter", "finance_account", "customer")
        .prefetch_related("receipts")
        .get(pk=direct_sale_id)
    )
    invoice = (
        BillingInvoice.objects.select_for_update(of=("self",))
        .filter(direct_sale_id=sale.id)
        .order_by("-id")
        .first()
    )
    if invoice is not None:
        invoice = (
            BillingInvoice.objects.select_related("branch", "finance_account").get(pk=invoice.pk)
        )
    if invoice is None:
        raise ValueError("Linked billing invoice was not found for this direct sale.")
    inactive_sale_statuses = {
        "CANCELLED",
        "CANCELLED_PRE_INVOICE",
        "CANCELLED_AFTER_DELIVERY",
        "REVERSED_POST_INVOICE",
        "RETURNED",
        "ARCHIVED",
        "EXCHANGED_CLOSED",
    }
    if (sale.status or "").strip().upper() in inactive_sale_statuses:
        raise ValueError("This direct sale is reversed/returned and is not collectible.")
    if sale.status != "INVOICED":
        raise ValueError("Direct sale must be invoiced before collection.")
    if invoice.status != BillingDocumentStatus.POSTED:
        raise ValueError("Direct-sale collections are allowed only after the retail invoice is posted.")

    normalized_reference = _normalize_text(reference_no)
    marker = _reference_marker(normalized_reference)
    if marker:
        existing_receipt = (
            ReceiptDocument.objects.select_related("billing_invoice", "direct_sale")
            .filter(
                direct_sale_id=sale.id,
                receipt_type=ReceiptType.RETAIL_RECEIPT,
                status=BillingDocumentStatus.POSTED,
                notes__icontains=marker,
            )
            .order_by("-id")
            .first()
        )
        if existing_receipt is not None:
            if _money(existing_receipt.amount) != amount:
                raise ValueError(
                    "A retail receipt with this collection reference already exists with different details."
                )
            position = _current_receivable_position(sale=sale, invoice=invoice)
            return {
                "created": False,
                "direct_sale": sale,
                "invoice": invoice,
                "receipt": existing_receipt,
                "outstanding_before": position["outstanding"],
                "outstanding_after": position["outstanding"],
            }

    position = _current_receivable_position(sale=sale, invoice=invoice)
    outstanding_before = position["outstanding"]
    if outstanding_before <= Decimal("0.00"):
        raise ValueError("Direct sale has no outstanding balance.")
    if amount > outstanding_before:
        raise ValueError("Collection amount cannot exceed the current outstanding balance.")

    resolved_branch_id, cash_counter, finance_account = _resolve_branch_counter_and_finance_account(
        sale=sale,
        actor=collected_by,
        branch_id=branch_id,
        cash_counter_id=cash_counter_id,
        finance_account_id=finance_account_id,
    )

    receipt = create_manual_receipt(
        receipt_date=receipt_date or timezone.localdate(),
        finance_account_id=finance_account.id,
        amount=amount,
        receipt_type=ReceiptType.RETAIL_RECEIPT,
        billing_invoice_id=invoice.id,
        direct_sale_id=sale.id,
        customer_id=sale.customer_id,
        branch_id=resolved_branch_id,
        cash_counter_id=getattr(cash_counter, "id", None),
        notes=_build_receipt_notes(notes=_normalize_text(notes), reference_no=normalized_reference),
        source_type=invoice.source_type,
        source_reference=sale.sale_no or invoice.document_no or f"SALE-{sale.id}",
        created_by=collected_by,
    )

    collected_total = position["collected_total"] + amount
    outstanding_after = _money(sale.grand_total) - collected_total
    if outstanding_after < Decimal("0.00"):
        outstanding_after = Decimal("0.00")

    sale.received_total = collected_total
    sale.balance_total = outstanding_after
    sale.finance_account = finance_account
    if cash_counter is not None:
        sale.cash_counter = cash_counter
    sale.save(
        update_fields=[
            "received_total",
            "balance_total",
            "finance_account",
            "cash_counter",
            "updated_at",
        ]
    )

    invoice.received_total = collected_total
    invoice.balance_total = outstanding_after
    invoice.finance_account = finance_account
    invoice.save(
        update_fields=[
            "received_total",
            "balance_total",
            "finance_account",
            "updated_at",
        ]
    )

    from billing.services.direct_sale_delivery_bridge_service import sync_direct_sale_delivery_case

    sale.refresh_from_db()
    sync_direct_sale_delivery_case(sale=sale, actor=collected_by)

    audit_extra = {}
    if contract_reference_id is not None:
        audit_extra["contract_reference_id"] = contract_reference_id
    if unified_collection_source_type is not None:
        audit_extra["unified_collection_source_type"] = unified_collection_source_type
    if unified_collection_source_id is not None:
        audit_extra["unified_collection_source_id"] = unified_collection_source_id

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=sale,
        performed_by=collected_by,
        metadata={
            "event": "DIRECT_SALE_COLLECTION_POSTED",
            "direct_sale_id": sale.id,
            "sale_no": sale.sale_no,
            "billing_invoice_id": invoice.id,
            "receipt_id": receipt.id,
            "receipt_no": receipt.receipt_no,
            "amount": str(amount),
            "outstanding_before": str(outstanding_before),
            "outstanding_after": str(outstanding_after),
            "finance_account_id": finance_account.id,
            "branch_id": resolved_branch_id,
            "cash_counter_id": getattr(cash_counter, "id", None),
            "reference_no": normalized_reference or None,
            **audit_extra,
        },
    )
    append_business_event(
        event_type=BusinessEventType.DIRECT_SALE_PAYMENT_RECEIVED,
        source_module="billing.services.direct_sale_collection_service.collect_direct_sale_payment",
        actor_user=collected_by,
        customer=sale.customer,
        payload={
            "direct_sale_id": sale.id,
            "billing_invoice_id": invoice.id,
            "receipt_id": receipt.id,
            "receipt_no": receipt.receipt_no,
            "amount": str(amount),
            "outstanding_before": str(outstanding_before),
            "outstanding_after": str(outstanding_after),
            "reference_no": normalized_reference or None,
        },
        ledger_reference=receipt.receipt_no or "",
        idempotency_key=normalized_reference or None,
    )

    customer_user_id = None
    if sale.customer_id:
        customer_user_id = (
            Customer.objects.filter(pk=sale.customer_id).values_list("user_id", flat=True).first()
        )

    schedule_direct_sale_collection_notifications(
        receipt_id=receipt.id,
        direct_sale_id=sale.id,
        customer_user_id=customer_user_id,
        amount_str=str(amount),
        receipt_no=receipt.receipt_no,
        cashier_user_id=getattr(collected_by, "id", None),
    )

    return {
        "created": True,
        "direct_sale": sale,
        "invoice": invoice,
        "receipt": receipt,
        "outstanding_before": outstanding_before,
        "outstanding_after": outstanding_after,
    }
