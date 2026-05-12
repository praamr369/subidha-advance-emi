from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from django.db import transaction
from django.db.models import Q

from accounting.models import (
    AccountingBridgePosting,
    FinanceAccount,
    FinanceAccountKind,
)
from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts
from billing.models import BillingDocumentStatus, BillingInvoice
from billing.services.billing_service import generate_emi_payment_receipt, post_billing_invoice
from inventory.models import PurchaseBill, StockAdjustment
from inventory.services.stock_service import post_purchase_bill, post_stock_adjustment
from subscriptions.models import (
    AuditLog,
    Commission,
    CommissionPayoutBatch,
    CommissionStatus,
    Payment,
)

SUPPORTED_BRIDGE_PURPOSES = {
    "PAYMENT_COLLECTION",
    "PAYMENT_REVERSAL",
}


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _bridge_exists(*, source_model: str, source_id: str, purpose: str) -> bool:
    return AccountingBridgePosting.objects.filter(
        source_model=source_model,
        source_id=str(source_id),
        purpose=purpose,
    ).exists()


def _iso_to_date(value, *, fallback: date | None = None) -> date | None:
    if isinstance(value, date):
        return value
    if not value:
        return fallback
    try:
        return datetime.fromisoformat(str(value)).date()
    except (TypeError, ValueError):
        return fallback


def _resolve_collection_finance_account(*, method: str) -> tuple[FinanceAccount | None, str | None, list[int]]:
    normalized = (method or "").strip().upper() or "CASH"
    kind = FinanceAccountKind.CASH
    if normalized == "BANK":
        kind = FinanceAccountKind.BANK
    elif normalized == "UPI":
        kind = FinanceAccountKind.UPI

    candidates = list(
        FinanceAccount.objects.filter(
            kind=kind,
            is_active=True,
            is_real_settlement_account=True,
        )
        .select_related("chart_account")
        .order_by("id")
    )
    candidate_ids = [c.id for c in candidates]
    if len(candidates) == 0:
        return None, "MISSING_FINANCE_ACCOUNT", candidate_ids
    if len(candidates) > 1:
        return None, "AMBIGUOUS_FINANCE_ACCOUNT", candidate_ids

    account = candidates[0]
    if not account.chart_account.is_active:
        return None, "FINANCE_ACCOUNT_INACTIVE_COA", candidate_ids
    return account, None, candidate_ids


def _finance_account_for_payment_method(method: str) -> FinanceAccount | None:
    """
    Legacy helper used by receipt bridge generation.

    Returns a FinanceAccount only when resolution is unambiguous; otherwise None.
    """

    account, reason, _candidate_ids = _resolve_collection_finance_account(method=method)
    return account if reason is None else None


def _payment_reversal_date(payment: Payment) -> date:
    reversal = ((payment.allocation_metadata or {}).get("reversal") or {})
    return _iso_to_date(
        reversal.get("reversed_at"),
        fallback=payment.payment_date,
    ) or payment.payment_date


def _payment_reversal_reason(payment: Payment) -> str:
    reversal = ((payment.allocation_metadata or {}).get("reversal") or {})
    return str(reversal.get("reason") or "").strip()


def _post_payment_reversal_bridge(*, payment: Payment, performed_by=None):
    accounts = ensure_phase3_system_accounts()
    lines: list[dict] = []
    trace_metadata = {
        "payment_id": payment.id,
        "reference_no": payment.reference_no or "",
        "reason": _payment_reversal_reason(payment),
    }

    bridge = (
        AccountingBridgePosting.objects.filter(
            source_model="Payment",
            source_id=str(payment.id),
            purpose="PAYMENT_COLLECTION",
        )
        .select_related("journal_entry")
        .first()
    )
    if bridge is not None and bridge.journal_entry_id:
        posted = bridge.journal_entry
        posted_lines = list(posted.lines.select_related("chart_account").all())
        for line in posted_lines:
            debit = _money(line.debit_amount)
            credit = _money(line.credit_amount)
            if debit > Decimal("0.00"):
                lines.append(
                    {
                        "chart_account": line.chart_account,
                        "description": f"Payment reversal {payment.reference_no or payment.id}",
                        "debit_amount": Decimal("0.00"),
                        "credit_amount": debit,
                    }
                )
            elif credit > Decimal("0.00"):
                lines.append(
                    {
                        "chart_account": line.chart_account,
                        "description": f"Payment reversal {payment.reference_no or payment.id}",
                        "debit_amount": credit,
                        "credit_amount": Decimal("0.00"),
                    }
                )
        trace_metadata["payment_collection_bridge_reversed"] = True
        trace_metadata["payment_collection_bridge_id"] = bridge.id
        trace_metadata["payment_collection_journal_entry_id"] = bridge.journal_entry_id
    else:
        trace_metadata["payment_collection_bridge_reversed"] = False

    try:
        receipt = payment.receipt_document
    except Exception:  # pragma: no cover - reverse one-to-one convenience
        receipt = None
    if (
        receipt is not None
        and receipt.status == BillingDocumentStatus.POSTED
        and receipt.finance_account_id
    ):
        lines.extend(
            [
                {
                    "chart_account": accounts["EMI_COLLECTION_CLEARING"],
                    "description": receipt.receipt_no or f"Receipt {receipt.id}",
                    "debit_amount": receipt.amount,
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": receipt.finance_account.chart_account,
                    "description": receipt.receipt_no or f"Receipt {receipt.id}",
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": receipt.amount,
                },
            ]
        )
        trace_metadata["receipt_document_id"] = receipt.id
        trace_metadata["receipt_no"] = receipt.receipt_no or ""

    if not lines:
        return None, False, "NO_ACCOUNTING_SOURCE_TO_REVERSE"

    journal_entry, created = post_bridge_entry(
        source_instance=payment,
        purpose="PAYMENT_REVERSAL",
        entry_date=_payment_reversal_date(payment),
        memo=f"Payment reversal {payment.reference_no or payment.id}",
        lines=lines,
        voucher_type="PAYMENT_REVERSAL",
        source_type="PAYMENT",
        source_reference=payment.reference_no or f"PAY-{payment.id}",
        trace_metadata=trace_metadata,
        posted_by=performed_by,
    )
    return journal_entry, created, None


def _post_commission_settlement_bridge(*, commission: Commission, performed_by=None):
    accounts = ensure_phase3_system_accounts()
    payment = getattr(commission, "payment", None)
    source_reference = (
        getattr(payment, "reference_no", None)
        or getattr(commission, "id", None)
    )
    return post_bridge_entry(
        source_instance=commission,
        purpose="COMMISSION_SETTLEMENT",
        entry_date=commission.settlement_date or commission.created_at.date(),
        memo=f"Commission settlement {commission.id}",
        lines=[
            {
                "chart_account": accounts["PARTNER_COMMISSION_EXPENSE"],
                "description": getattr(commission.partner, "username", "") or f"Commission {commission.id}",
                "debit_amount": commission.commission_amount,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": accounts["PARTNER_COMMISSION_PAYABLE"],
                "description": getattr(commission.partner, "username", "") or f"Commission {commission.id}",
                "debit_amount": Decimal("0.00"),
                "credit_amount": commission.commission_amount,
            },
        ],
        voucher_type="COMMISSION_ACCRUAL",
        source_type="COMMISSION",
        source_reference=str(source_reference),
        trace_metadata={
            "commission_id": commission.id,
            "partner_id": commission.partner_id,
            "payment_id": commission.payment_id,
            "subscription_id": commission.subscription_id,
            "emi_id": commission.emi_id,
        },
        posted_by=performed_by,
    )


def _post_payout_batch_bridge(*, payout_batch: CommissionPayoutBatch, performed_by=None):
    accounts = ensure_phase3_system_accounts()
    if payout_batch.finance_account_id is None:
        raise ValueError("Payout batch is missing finance account.")

    return post_bridge_entry(
        source_instance=payout_batch,
        purpose="COMMISSION_PAYOUT_BATCH",
        entry_date=payout_batch.payout_date,
        memo=f"Commission payout batch {payout_batch.batch_code}",
        lines=[
            {
                "chart_account": accounts["PARTNER_COMMISSION_PAYABLE"],
                "description": payout_batch.batch_code,
                "debit_amount": payout_batch.total_amount,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": payout_batch.finance_account.chart_account,
                "description": payout_batch.reference_no or payout_batch.batch_code,
                "debit_amount": Decimal("0.00"),
                "credit_amount": payout_batch.total_amount,
            },
        ],
        voucher_type="PAYOUT_BATCH",
        source_type="PAYOUT_BATCH",
        source_reference=payout_batch.reference_no or payout_batch.batch_code,
        trace_metadata={
            "payout_batch_id": payout_batch.id,
            "batch_code": payout_batch.batch_code,
            "finance_account_id": payout_batch.finance_account_id,
            "reference_no": payout_batch.reference_no or "",
            "line_count": payout_batch.lines.count(),
        },
        posted_by=performed_by,
    )


def _waiver_amount_from_audit(audit: AuditLog) -> Decimal:
    metadata = audit.metadata if isinstance(audit.metadata, dict) else {}
    for key in ("newly_waived_amount", "waived_amount", "amount"):
        amount = _money(metadata.get(key))
        if amount > Decimal("0.00"):
            return amount
    return Decimal("0.00")


def _post_waiver_bridge(*, audit: AuditLog, performed_by=None):
    accounts = ensure_phase3_system_accounts()
    amount = _waiver_amount_from_audit(audit)
    if amount <= Decimal("0.00"):
        raise ValueError("Winner waiver amount is required for bridge posting.")

    metadata = audit.metadata if isinstance(audit.metadata, dict) else {}
    subscription_id = metadata.get("subscription_id") or audit.object_id
    source_reference = metadata.get("winner_subscription_number") or f"SUB-{subscription_id}"
    return post_bridge_entry(
        source_instance=audit,
        purpose="EMI_WAIVER",
        entry_date=audit.created_at.date(),
        memo=f"EMI waiver event {audit.id}",
        lines=[
            {
                "chart_account": accounts["EMI_WAIVER_EXPENSE"],
                "description": str(source_reference),
                "debit_amount": amount,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": accounts["EMI_WAIVER_RESERVE"],
                "description": str(source_reference),
                "debit_amount": Decimal("0.00"),
                "credit_amount": amount,
            },
        ],
        voucher_type="EMI_WAIVER",
        source_type="WINNER_WAIVER",
        source_reference=str(source_reference),
        trace_metadata={
            "audit_id": audit.id,
            "subscription_id": subscription_id,
            "winner_month": metadata.get("winner_month"),
            "waived_emi_count": metadata.get("waived_emi_count"),
            "waiver_scope": metadata.get("waiver_scope"),
            "waived_amount": f"{amount:.2f}",
        },
        posted_by=performed_by,
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
    ).filter(
        Q(allocation_metadata__reversal__is_reversed=False)
        | Q(allocation_metadata__reversal__is_reversed__isnull=True)
    ).order_by("payment_date", "id")

    if "PAYMENT_COLLECTION" in selected_purposes:
        accounts = ensure_phase3_system_accounts()
        clearing_account = accounts.get("EMI_COLLECTION_CLEARING")
        if clearing_account is None or not clearing_account.is_active:
            raise ValueError("EMI_COLLECTION_CLEARING system account is missing or inactive.")
        created_count = 0
        existing_count = 0
        candidates = 0
        skipped: list[dict] = []
        first_payment = None

        for payment in payments:
            candidates += 1
            if first_payment is None:
                first_payment = payment

            purpose = "PAYMENT_COLLECTION"
            if _bridge_exists(
                source_model="Payment",
                source_id=str(payment.id),
                purpose=purpose,
            ):
                existing_count += 1
                continue

            if dry_run:
                continue

            finance_account, reason, candidate_ids = _resolve_collection_finance_account(method=payment.method or "")
            if reason:
                skipped.append(
                    {
                        "payment_id": payment.id,
                        "method": (payment.method or "").strip().upper() or "CASH",
                        "reason": reason,
                        "candidate_finance_account_ids": candidate_ids,
                    }
                )
                _log_accounting_event(
                    event="ACCOUNTING_BRIDGE_DEFERRED",
                    instance=payment,
                    performed_by=performed_by,
                    metadata={
                        "purpose": "PAYMENT_COLLECTION",
                        "payment_id": payment.id,
                        "method": (payment.method or "").strip().upper() or "CASH",
                        "reason": reason,
                        "candidate_finance_account_ids": candidate_ids,
                    },
                )
                continue
            post_bridge_entry(
                source_instance=payment,
                purpose=purpose,
                entry_date=payment.payment_date,
                memo=f"Bridge payment collection {payment.id}",
                lines=[
                    {
                        "chart_account": finance_account.chart_account,
                        "description": f"{(payment.method or 'CASH').strip().upper()} collection",
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
                voucher_type="PAYMENT_COLLECTION",
                source_type="PAYMENT",
                source_reference=payment.reference_no or f"PAY-{payment.id}",
                trace_metadata={
                    "payment_id": payment.id,
                    "subscription_id": payment.subscription_id,
                    "emi_id": payment.emi_id,
                    "method": (payment.method or "").strip().upper() or "CASH",
                    "finance_account_id": finance_account.id,
                    "finance_chart_account_id": finance_account.chart_account_id,
                    "clearing_chart_account_id": clearing_account.id,
                },
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
                "skipped_count": len(skipped),
                "skipped": skipped[:200],
                "dry_run": dry_run,
            }
        )

    if "PAYMENT_REVERSAL" in selected_purposes:
        reversal_candidates = []
        for payment in Payment.objects.select_related(
            "receipt_document",
            "receipt_document__finance_account",
            "receipt_document__finance_account__chart_account",
        ).filter(
            allocation_metadata__reversal__is_reversed=True
        ).order_by("payment_date", "id"):
            reversal_date = _payment_reversal_date(payment)
            if start_date <= reversal_date <= end_date:
                reversal_candidates.append(payment)

        created_count = 0
        existing_count = 0
        skipped = []
        for payment in reversal_candidates:
            if _bridge_exists(
                source_model="Payment",
                source_id=str(payment.id),
                purpose="PAYMENT_REVERSAL",
            ):
                existing_count += 1
                continue

            if dry_run:
                continue

            _, created, skip_reason = _post_payment_reversal_bridge(
                payment=payment,
                performed_by=performed_by,
            )
            if skip_reason:
                skipped.append(
                    {
                        "payment_id": payment.id,
                        "reason": skip_reason,
                    }
                )
                continue
            created_count += 1 if created else 0
            existing_count += 0 if created else 1

        results.append(
            {
                "purpose": "PAYMENT_REVERSAL",
                "candidates": len(reversal_candidates),
                "created_count": created_count,
                "existing_count": existing_count,
                "dry_run": dry_run,
                "skipped": skipped,
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
        if purchase_bill.posted_journal_entry_id:
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
        if adjustment.posted_journal_entry_id:
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
    payments = Payment.objects.select_related(
        "customer",
        "subscription",
        "finance_account",
        "finance_account__chart_account",
    ).filter(
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
        finance_account = getattr(payment, "finance_account", None)
        if finance_account is None:
            finance_account = _finance_account_for_payment_method(payment.method)
        if finance_account is None:
            skipped.append(
                {
                    "payment_id": payment.id,
                    "reason": "MISSING_FINANCE_ACCOUNT",
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
                        "reason": "MISSING_FINANCE_ACCOUNT",
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


@transaction.atomic
def run_emi_waiver_bridges(*, start_date: date, end_date: date, dry_run: bool = False, performed_by=None) -> dict:
    waiver_audits = AuditLog.objects.filter(
        action_type=AuditLog.ActionType.WINNER_WAIVER_APPLIED,
        created_at__date__range=(start_date, end_date),
        model_name="Subscription",
    ).order_by("created_at", "id")
    created_count = 0
    existing_count = 0
    skipped = []
    for audit in waiver_audits:
        if _bridge_exists(
            source_model="AuditLog",
            source_id=str(audit.id),
            purpose="EMI_WAIVER",
        ):
            existing_count += 1
            continue

        amount = _waiver_amount_from_audit(audit)
        if amount <= Decimal("0.00"):
            skipped.append(
                {
                    "audit_id": audit.id,
                    "reason": "ZERO_WAIVER_AMOUNT",
                }
            )
            continue

        if dry_run:
            continue

        _, created = _post_waiver_bridge(audit=audit, performed_by=performed_by)
        created_count += 1 if created else 0
        existing_count += 0 if created else 1

    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "dry_run": dry_run,
        "purpose": "EMI_WAIVER",
        "candidates": waiver_audits.count(),
        "created_count": created_count,
        "existing_count": existing_count,
        "skipped": skipped,
    }


@transaction.atomic
def run_commission_settlement_bridges(*, start_date: date, end_date: date, dry_run: bool = False, performed_by=None) -> dict:
    commissions = Commission.objects.select_related(
        "partner",
        "payment",
        "subscription",
        "subscription__batch",
        "subscription__lucky_id",
    ).filter(
        status=CommissionStatus.SETTLED,
        settlement_date__range=(start_date, end_date),
    ).order_by("settlement_date", "id")
    created_count = 0
    existing_count = 0
    skipped = []
    for commission in commissions:
        if _bridge_exists(
            source_model="Commission",
            source_id=str(commission.id),
            purpose="COMMISSION_SETTLEMENT",
        ):
            existing_count += 1
            continue

        if _money(commission.commission_amount) <= Decimal("0.00"):
            skipped.append(
                {
                    "commission_id": commission.id,
                    "reason": "ZERO_COMMISSION_AMOUNT",
                }
            )
            continue

        if dry_run:
            continue

        _, created = _post_commission_settlement_bridge(
            commission=commission,
            performed_by=performed_by,
        )
        created_count += 1 if created else 0
        existing_count += 0 if created else 1

    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "dry_run": dry_run,
        "purpose": "COMMISSION_SETTLEMENT",
        "candidates": commissions.count(),
        "created_count": created_count,
        "existing_count": existing_count,
        "skipped": skipped,
    }


@transaction.atomic
def run_payout_batch_bridges(*, start_date: date, end_date: date, dry_run: bool = False, performed_by=None) -> dict:
    batches = CommissionPayoutBatch.objects.select_related(
        "processed_by",
        "finance_account",
        "finance_account__chart_account",
    ).prefetch_related(
        "lines__commission",
        "lines__commission__partner",
        "lines__commission__payment",
        "lines__commission__subscription",
    ).filter(
        status=CommissionPayoutBatch.Status.FINALIZED,
        payout_date__range=(start_date, end_date),
    ).order_by("payout_date", "id")

    created_count = 0
    existing_count = 0
    settlement_created_count = 0
    settlement_existing_count = 0
    skipped = []

    for payout_batch in batches:
        if _bridge_exists(
            source_model="CommissionPayoutBatch",
            source_id=str(payout_batch.id),
            purpose="COMMISSION_PAYOUT_BATCH",
        ):
            existing_count += 1
            continue

        lines = list(
            payout_batch.lines.select_related(
                "commission",
                "commission__partner",
                "commission__payment",
                "commission__subscription",
            ).order_by("id")
        )
        if not lines:
            skipped.append(
                {
                    "payout_batch_id": payout_batch.id,
                    "reason": "EMPTY_PAYOUT_BATCH",
                }
            )
            continue

        if payout_batch.finance_account_id is None:
            skipped.append(
                {
                    "payout_batch_id": payout_batch.id,
                    "reason": "MISSING_FINANCE_ACCOUNT",
                }
            )
            continue

        if _money(payout_batch.total_amount) <= Decimal("0.00"):
            skipped.append(
                {
                    "payout_batch_id": payout_batch.id,
                    "reason": "NON_POSITIVE_PAYOUT_TOTAL",
                }
            )
            continue

        for line in lines:
            if _bridge_exists(
                source_model="Commission",
                source_id=str(line.commission_id),
                purpose="COMMISSION_SETTLEMENT",
            ):
                settlement_existing_count += 1
                continue

            if dry_run:
                continue

            _, settlement_created = _post_commission_settlement_bridge(
                commission=line.commission,
                performed_by=performed_by,
            )
            settlement_created_count += 1 if settlement_created else 0
            settlement_existing_count += 0 if settlement_created else 1

        if dry_run:
            continue

        _, created = _post_payout_batch_bridge(
            payout_batch=payout_batch,
            performed_by=performed_by,
        )
        created_count += 1 if created else 0
        existing_count += 0 if created else 1

    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "dry_run": dry_run,
        "purpose": "COMMISSION_PAYOUT_BATCH",
        "candidates": batches.count(),
        "created_count": created_count,
        "existing_count": existing_count,
        "settlement_created_count": settlement_created_count,
        "settlement_existing_count": settlement_existing_count,
        "skipped": skipped,
    }
