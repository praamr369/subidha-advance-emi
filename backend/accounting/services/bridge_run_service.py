from __future__ import annotations

from datetime import date

from django.db import transaction

from accounting.models import AccountingBridgePosting, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.gst_document_posting_service import _ensure_system_account
from accounting.services.journal_posting_service import _log_accounting_event
from billing.models import BillingInvoice
from billing.services.billing_service import generate_emi_payment_receipt, post_billing_invoice
from inventory.models import PurchaseBill, StockAdjustment
from inventory.services.stock_service import post_purchase_bill, post_stock_adjustment
from subscriptions.models import Payment

SUPPORTED_BRIDGE_PURPOSES = {"PAYMENT_COLLECTION"}


def _method_chart_account(payment: Payment):
    method = (payment.method or "").strip().upper() or "CASH"
    if method == "BANK":
        return _ensure_system_account(
            system_code="BRIDGE_BANK_COLLECTION",
            code="BRG-1010",
            name="Bridge Bank Collections",
            account_type=ChartOfAccountType.ASSET,
        )
    if method == "UPI":
        return _ensure_system_account(
            system_code="BRIDGE_UPI_COLLECTION",
            code="BRG-1020",
            name="Bridge UPI Collections",
            account_type=ChartOfAccountType.ASSET,
        )
    return _ensure_system_account(
        system_code="BRIDGE_CASH_COLLECTION",
        code="BRG-1000",
        name="Bridge Cash Collections",
        account_type=ChartOfAccountType.ASSET,
    )


def _collection_clearing_account():
    return _ensure_system_account(
        system_code="SUBSCRIPTION_COLLECTION_CLEARING",
        code="BRG-2000",
        name="Subscription Collection Clearing",
        account_type=ChartOfAccountType.LIABILITY,
    )


def _finance_account_for_payment_method(method: str):
    normalized = (method or "").strip().upper() or "CASH"
    kind = FinanceAccountKind.CASH
    if normalized == "BANK":
        kind = FinanceAccountKind.BANK
    elif normalized == "UPI":
        kind = FinanceAccountKind.UPI
    candidates = list(
        FinanceAccount.objects.filter(kind=kind, is_active=True).order_by("id")
    )
    if len(candidates) == 1:
        return candidates[0]
    return None


@transaction.atomic
def run_bridge_postings(
    *,
    start_date: date,
    end_date: date,
    purposes: list[str] | None = None,
    dry_run: bool = False,
    performed_by=None,
) -> dict:
    selected_purposes = [
        purpose.strip().upper()
        for purpose in (purposes or ["PAYMENT_COLLECTION"])
        if purpose and purpose.strip()
    ]
    if not selected_purposes:
        selected_purposes = ["PAYMENT_COLLECTION"]

    unsupported = [
        purpose for purpose in selected_purposes if purpose not in SUPPORTED_BRIDGE_PURPOSES
    ]
    if unsupported:
        raise ValueError(f"Unsupported bridge purposes: {', '.join(sorted(unsupported))}")

    results: list[dict] = []
    payments = Payment.objects.select_related(
        "customer",
        "subscription",
        "subscription__batch",
        "subscription__lucky_id",
    ).filter(
        payment_date__range=(start_date, end_date)
    ).exclude(
        allocation_metadata__reversal__is_reversed=True
    ).order_by("payment_date", "id")

    if "PAYMENT_COLLECTION" in selected_purposes:
        clearing_account = _collection_clearing_account()
        created_count = 0
        existing_count = 0
        candidates = 0
        first_payment = None

        for payment in payments:
            candidates += 1
            if first_payment is None:
                first_payment = payment

            purpose = "PAYMENT_COLLECTION"
            if AccountingBridgePosting.objects.filter(
                source_model="Payment",
                source_id=str(payment.id),
                purpose=purpose,
            ).exists():
                existing_count += 1
                continue

            if dry_run:
                continue

            method_account = _method_chart_account(payment)
            post_bridge_entry(
                source_instance=payment,
                purpose=purpose,
                entry_date=payment.payment_date,
                memo=f"Bridge payment collection {payment.id}",
                lines=[
                    {
                        "chart_account": method_account,
                        "description": f"{payment.method} collection",
                        "debit_amount": payment.amount,
                        "credit_amount": 0,
                    },
                    {
                        "chart_account": clearing_account,
                        "description": "Collection clearing",
                        "debit_amount": 0,
                        "credit_amount": payment.amount,
                    },
                ],
                posted_by=performed_by,
            )
            created_count += 1

        if first_payment is not None:
            _log_accounting_event(
                event="ACCOUNTING_BRIDGE_RUN",
                instance=first_payment,
                performed_by=performed_by,
                metadata={
                    "purpose": "PAYMENT_COLLECTION",
                    "dry_run": dry_run,
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "candidates": candidates,
                    "created_count": created_count,
                    "existing_count": existing_count,
                },
            )

        results.append(
            {
                "purpose": "PAYMENT_COLLECTION",
                "candidates": candidates,
                "created_count": created_count,
                "existing_count": existing_count,
                "dry_run": dry_run,
            }
        )

    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "purposes": selected_purposes,
        "dry_run": dry_run,
        "results": results,
    }


@transaction.atomic
def run_retail_sale_bridges(*, start_date: date, end_date: date, dry_run: bool = False, performed_by=None) -> dict:
    queryset = BillingInvoice.objects.filter(
        invoice_date__range=(start_date, end_date),
        status__in=["APPROVED", "POSTED"],
    ).order_by("invoice_date", "id")
    created_count = 0
    existing_count = 0
    for invoice in queryset:
        if invoice.posted_journal_entry_id:
            existing_count += 1
            continue
        if dry_run:
            continue
        _, created = post_billing_invoice(invoice_id=invoice.id, posted_by=performed_by)
        created_count += 1 if created else 0
        existing_count += 0 if created else 1
    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "dry_run": dry_run,
        "purpose": "RETAIL_SALE",
        "candidates": queryset.count(),
        "created_count": created_count,
        "existing_count": existing_count,
    }


@transaction.atomic
def run_inventory_posting_bridges(*, start_date: date, end_date: date, dry_run: bool = False, performed_by=None) -> dict:
    purchase_qs = PurchaseBill.objects.filter(
        bill_date__range=(start_date, end_date),
        status__in=["APPROVED", "POSTED"],
    ).order_by("bill_date", "id")
    adjustment_qs = StockAdjustment.objects.filter(
        adjustment_date__range=(start_date, end_date),
        status__in=["APPROVED", "POSTED"],
    ).order_by("adjustment_date", "id")

    purchase_created = 0
    purchase_existing = 0
    for purchase_bill in purchase_qs:
        if purchase_bill.status == "POSTED":
            purchase_existing += 1
            continue
        if dry_run:
            continue
        _, created = post_purchase_bill(purchase_bill_id=purchase_bill.id, posted_by=performed_by)
        purchase_created += 1 if created else 0
        purchase_existing += 0 if created else 1

    adjustment_created = 0
    adjustment_existing = 0
    for adjustment in adjustment_qs:
        if adjustment.status == "POSTED":
            adjustment_existing += 1
            continue
        if dry_run:
            continue
        _, created = post_stock_adjustment(stock_adjustment_id=adjustment.id, posted_by=performed_by)
        adjustment_created += 1 if created else 0
        adjustment_existing += 0 if created else 1

    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "dry_run": dry_run,
        "purpose": "INVENTORY_POSTING",
        "purchase_candidates": purchase_qs.count(),
        "purchase_created": purchase_created,
        "purchase_existing": purchase_existing,
        "adjustment_candidates": adjustment_qs.count(),
        "adjustment_created": adjustment_created,
        "adjustment_existing": adjustment_existing,
    }


@transaction.atomic
def run_emi_subscription_bridges(*, start_date: date, end_date: date, dry_run: bool = False, performed_by=None) -> dict:
    from subscriptions.models import Subscription

    queryset = Subscription.objects.filter(
        start_date__range=(start_date, end_date)
    ).order_by("start_date", "id")
    skipped = []
    for subscription in queryset:
        skipped.append(
            {
                "subscription_id": subscription.id,
                "reason": "DEFERRED_UNSAFE_RECOGNITION",
                "fulfillment_status": subscription.fulfillment_status,
            }
        )
        if not dry_run:
            _log_accounting_event(
                event="ACCOUNTING_BRIDGE_DEFERRED",
                instance=subscription,
                performed_by=performed_by,
                metadata={
                    "purpose": "EMI_SUBSCRIPTION",
                    "reason": "DEFERRED_UNSAFE_RECOGNITION",
                },
            )
    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "dry_run": dry_run,
        "purpose": "EMI_SUBSCRIPTION",
        "candidates": queryset.count(),
        "created_count": 0,
        "skipped": skipped,
    }


@transaction.atomic
def run_emi_payment_bridges(*, start_date: date, end_date: date, dry_run: bool = False, performed_by=None) -> dict:
    payments = Payment.objects.select_related("customer", "subscription").filter(
        payment_date__range=(start_date, end_date)
    ).exclude(
        allocation_metadata__reversal__is_reversed=True
    ).order_by("payment_date", "id")

    created_count = 0
    existing_count = 0
    skipped = []
    for payment in payments:
        if hasattr(payment, "receipt_document"):
            existing_count += 1
            continue
        finance_account = _finance_account_for_payment_method(payment.method)
        if finance_account is None:
            skipped.append(
                {
                    "payment_id": payment.id,
                    "reason": "AMBIGUOUS_FINANCE_ACCOUNT",
                    "method": payment.method,
                }
            )
            if not dry_run:
                _log_accounting_event(
                    event="ACCOUNTING_BRIDGE_DEFERRED",
                    instance=payment,
                    performed_by=performed_by,
                    metadata={
                        "purpose": "EMI_PAYMENT_RECEIPT",
                        "reason": "AMBIGUOUS_FINANCE_ACCOUNT",
                        "method": payment.method,
                    },
                )
            continue
        if dry_run:
            continue
        _, created = generate_emi_payment_receipt(
            payment_id=payment.id,
            finance_account_id=finance_account.id,
            performed_by=performed_by,
        )
        created_count += 1 if created else 0
        existing_count += 0 if created else 1

    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "dry_run": dry_run,
        "purpose": "EMI_PAYMENT_RECEIPT",
        "candidates": payments.count(),
        "created_count": created_count,
        "existing_count": existing_count,
        "skipped": skipped,
    }
