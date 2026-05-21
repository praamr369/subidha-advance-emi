from __future__ import annotations

from django.db.models import Exists, OuterRef, Q

from billing.models import ReceiptDocument, ReceiptType
from subscriptions.models import Emi, EmiStatus, FinancialLedger, LedgerEntryType, Payment

from reconciliation.models import (
    ReconciliationEvidence,
    ReconciliationItem,
    ReconciliationItemStatus,
    ReconciliationSeverity,
)


MODULE = "EMI_PHASE_F"


def _date_range_filter(prefix: str, date_from, date_to):
    q = Q()
    if date_from:
        q &= Q(**{f"{prefix}__gte": date_from})
    if date_to:
        q &= Q(**{f"{prefix}__lte": date_to})
    return q


def run_emi_checks(*, run, totals: dict) -> dict:
    date_from = run.date_from
    date_to = run.date_to
    branch_id = run.branch_id

    payments = Payment.objects.all()
    if branch_id:
        payments = payments.filter(branch_id=branch_id)
    payments = payments.filter(_date_range_filter("payment_date", date_from, date_to))

    totals["checked"] += payments.count()

    receipt_exists = ReceiptDocument.objects.filter(payment_id=OuterRef("pk"))
    ledger_exists = FinancialLedger.objects.filter(payment_id=OuterRef("pk"))

    # 1) Payment exists but no ReceiptDocument
    for payment in payments.annotate(has_receipt=Exists(receipt_exists)).filter(has_receipt=False):
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE,
            source_type="Payment",
            source_id=str(payment.id),
            source_label=payment.reference_no or f"PAY-{payment.id}",
            severity=ReconciliationSeverity.MEDIUM,
            status=ReconciliationItemStatus.MISSING_SOURCE,
            exception_code="PAYMENT_MISSING_RECEIPT_DOCUMENT",
            exception_message="Payment exists but no ReceiptDocument is linked.",
            recommended_action="Verify if receipt generation is required for this payment; generate/attach receipt if policy mandates.",
            metadata={
                "payment_id": payment.id,
                "subscription_id": payment.subscription_id,
                "emi_id": payment.emi_id,
                "payment_date": str(payment.payment_date),
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="Payment",
            object_id=str(payment.id),
            label=payment.reference_no or f"PAY-{payment.id}",
            amount=payment.amount,
            status=None,
            metadata={"payment_date": str(payment.payment_date)},
        )
        totals["exceptions"] += 1

    # 2) ReceiptDocument exists but payment missing/invalid or receipt type constraint looks invalid
    receipts = ReceiptDocument.objects.all()
    if branch_id:
        receipts = receipts.filter(branch_id=branch_id)
    receipts = receipts.filter(_date_range_filter("receipt_date", date_from, date_to))
    totals["checked"] += receipts.count()

    invalid_receipts = receipts.filter(
        Q(payment__isnull=True, receipt_type=ReceiptType.EMI_PAYMENT_RECEIPT)
        | (Q(payment__isnull=False) & ~Q(receipt_type=ReceiptType.EMI_PAYMENT_RECEIPT))
    )
    for receipt in invalid_receipts.select_related("payment"):
        is_missing_payment = receipt.payment_id is None
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE,
            source_type="ReceiptDocument",
            source_id=str(receipt.id),
            source_label=receipt.receipt_no or f"RCT-{receipt.id}",
            severity=ReconciliationSeverity.HIGH,
            status=ReconciliationItemStatus.STATUS_MISMATCH,
            exception_code="RECEIPT_DOCUMENT_PAYMENT_LINK_INVALID",
            exception_message=(
                "ReceiptDocument payment link is missing/invalid for EMI payment receipt constraints."
            ),
            recommended_action="Review receipt type/payment link; if incorrect, correct via operational workflow (no auto-correction).",
            metadata={
                "receipt_id": receipt.id,
                "receipt_no": receipt.receipt_no,
                "receipt_type": receipt.receipt_type,
                "payment_id": receipt.payment_id,
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="ReceiptDocument",
            object_id=str(receipt.id),
            label=receipt.receipt_no or f"RCT-{receipt.id}",
            amount=receipt.amount,
            status=receipt.status,
            metadata={
                "receipt_type": receipt.receipt_type,
                "receipt_date": str(receipt.receipt_date),
            },
        )
        if not is_missing_payment:
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="Payment",
                object_id=str(receipt.payment_id),
                label=getattr(receipt.payment, "reference_no", "") or f"PAY-{receipt.payment_id}",
                amount=getattr(receipt.payment, "amount", None),
                status=None,
                metadata={},
            )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    # 4) Payment exists but EMI still PENDING/open (scoped to payment.emi_id)
    pending_emi_payments = payments.filter(emi__isnull=False, emi__status=EmiStatus.PENDING).select_related("emi")
    for payment in pending_emi_payments:
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE,
            source_type="Payment",
            source_id=str(payment.id),
            source_label=payment.reference_no or f"PAY-{payment.id}",
            severity=ReconciliationSeverity.HIGH,
            status=ReconciliationItemStatus.STATUS_MISMATCH,
            exception_code="PAYMENT_EMI_STATUS_MISMATCH_PENDING",
            exception_message="Payment is linked to an EMI that is still marked PENDING.",
            recommended_action="Review payment posting vs EMI status update workflow; confirm if EMI should be PAID or payment should be reallocated/reversed via existing operational flows.",
            metadata={
                "payment_id": payment.id,
                "emi_id": payment.emi_id,
                "emi_status": payment.emi.status,
                "payment_date": str(payment.payment_date),
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="Payment",
            object_id=str(payment.id),
            label=payment.reference_no or f"PAY-{payment.id}",
            amount=payment.amount,
            metadata={"emi_id": payment.emi_id},
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="Emi",
            object_id=str(payment.emi_id),
            label=f"EMI-{payment.emi_id}",
            amount=payment.emi.amount,
            status=payment.emi.status,
            metadata={"due_date": str(payment.emi.due_date)},
        )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    # 3) EMI marked PAID but no payment/ledger evidence (deterministic: no EMI_PAYMENT ledger)
    ledger_for_emi = FinancialLedger.objects.filter(
        emi_id=OuterRef("pk"),
        entry_type=LedgerEntryType.EMI_PAYMENT,
    )
    emis = Emi.objects.filter(status=EmiStatus.PAID)
    if branch_id:
        emis = emis.filter(subscription__branch_id=branch_id)
    emis = emis.filter(_date_range_filter("due_date", date_from, date_to))
    totals["checked"] += emis.count()

    for emi in emis.annotate(has_ledger=Exists(ledger_for_emi)).filter(has_ledger=False):
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE,
            source_type="Emi",
            source_id=str(emi.id),
            source_label=f"EMI-{emi.id}",
            severity=ReconciliationSeverity.CRITICAL,
            status=ReconciliationItemStatus.MISSING_LEDGER,
            exception_code="EMI_PAID_MISSING_LEDGER_EVIDENCE",
            exception_message="EMI is marked PAID but no EMI_PAYMENT ledger evidence exists.",
            recommended_action="Investigate why EMI status is PAID without ledger evidence; correct using existing operational workflows (no auto-correction).",
            metadata={
                "emi_id": emi.id,
                "subscription_id": emi.subscription_id,
                "emi_status": emi.status,
                "due_date": str(emi.due_date),
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="Emi",
            object_id=str(emi.id),
            label=f"EMI-{emi.id}",
            amount=emi.amount,
            status=emi.status,
            metadata={},
        )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    # Matched: we only count a simplistic matched metric for "payments having both receipt+ledger"
    totals["matched"] += payments.annotate(
        has_receipt=Exists(receipt_exists),
        has_ledger=Exists(ledger_exists),
    ).filter(has_receipt=True, has_ledger=True).count()
    return totals
