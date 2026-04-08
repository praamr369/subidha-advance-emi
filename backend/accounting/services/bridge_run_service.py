from __future__ import annotations

from datetime import date

from django.db import transaction

from accounting.models import AccountingBridgePosting, ChartOfAccountType
from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.gst_document_posting_service import _ensure_system_account
from accounting.services.journal_posting_service import _log_accounting_event
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
