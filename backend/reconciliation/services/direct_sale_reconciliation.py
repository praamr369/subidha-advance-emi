from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone

from accounting.models import JournalEntry, JournalEntryStatus
from billing.models import BillingDocumentStatus, BillingInvoice, ReceiptDocument
from reconciliation.models import (
    ReconciliationEvidence,
    ReconciliationItem,
    ReconciliationItemStatus,
    ReconciliationSeverity,
)


MODULE_BILLING = "billing"
MODULE_DIRECT_SALE = "direct_sale"

MONEY_ZERO = Decimal("0.00")


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _date_range_filter(prefix: str, date_from, date_to):
    q = Q()
    if date_from:
        q &= Q(**{f"{prefix}__gte": date_from})
    if date_to:
        q &= Q(**{f"{prefix}__lte": date_to})
    return q


def run_direct_sale_billing_checks(*, run, totals: dict) -> dict:
    """
    Phase G: deterministic direct-sale / billing / receipt reconciliation checks.

    Constraints:
    - Detection only (no mutation of source records).
    - Use explicit FK / OneToOne links only.
    """

    date_from = run.date_from
    date_to = run.date_to
    branch_id = run.branch_id

    invoices = BillingInvoice.objects.select_related("posted_journal_entry").all()
    if branch_id:
        invoices = invoices.filter(branch_id=branch_id)
    invoices = invoices.filter(_date_range_filter("invoice_date", date_from, date_to))
    totals["checked"] += invoices.count()

    # G3) Invoice is POSTED/VOID but posted_journal_entry is missing (safe audit; should be blocked by model clean)
    missing_journal = invoices.filter(
        status__in={BillingDocumentStatus.POSTED, BillingDocumentStatus.VOID},
        posted_journal_entry__isnull=True,
    )
    for inv in missing_journal:
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_BILLING,
            source_type="BillingInvoice",
            source_id=str(inv.id),
            source_label=inv.document_no or f"INV-{inv.id}",
            severity=ReconciliationSeverity.HIGH,
            status=ReconciliationItemStatus.MISSING_SOURCE,
            exception_code="BILLING_INVOICE_POSTED_JOURNAL_MISSING",
            exception_message="BillingInvoice is POSTED/VOID but posted_journal_entry_id is NULL.",
            recommended_action="Investigate invoice posting integrity; ensure the posted journal entry is created and linked via the standard posting workflow (no auto-correction).",
            metadata={
                "billing_invoice_id": inv.id,
                "document_no": inv.document_no,
                "status": inv.status,
                "invoice_date": str(inv.invoice_date),
                "branch_id": inv.branch_id,
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="BillingInvoice",
            object_id=str(inv.id),
            label=inv.document_no or f"INV-{inv.id}",
            amount=inv.grand_total,
            status=inv.status,
            metadata={
                "received_total": str(inv.received_total),
                "balance_total": str(inv.balance_total),
            },
        )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    # G4) Invoice posted_journal_entry exists but JournalEntry.source_model/source_id does not match the invoice
    for inv in invoices.exclude(posted_journal_entry__isnull=True):
        journal = inv.posted_journal_entry
        expected_model = "BillingInvoice"
        expected_id = str(inv.id)
        journal_model = (getattr(journal, "source_model", None) or "").strip() or None
        journal_id = (getattr(journal, "source_id", None) or "").strip() or None
        if journal_model != expected_model or journal_id != expected_id:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_BILLING,
                source_type="BillingInvoice",
                source_id=str(inv.id),
                source_label=inv.document_no or f"INV-{inv.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.NEEDS_REVIEW,
                exception_code="BILLING_INVOICE_JOURNAL_SOURCE_LINK_INVALID",
                exception_message="BillingInvoice posted_journal_entry is not source-linked to this invoice (source_model/source_id mismatch).",
                recommended_action="Investigate how the journal entry was linked; correct only through explicit accounting/billing workflows (no auto-correction).",
                metadata={
                    "billing_invoice_id": inv.id,
                    "document_no": inv.document_no,
                    "invoice_status": inv.status,
                    "journal_entry_id": journal.id,
                    "journal_source_model": journal_model,
                    "journal_source_id": journal_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="BillingInvoice",
                object_id=str(inv.id),
                label=inv.document_no or f"INV-{inv.id}",
                amount=inv.grand_total,
                status=inv.status,
                metadata={},
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="JournalEntry",
                object_id=str(journal.id),
                label=journal.entry_no,
                amount=None,
                status=journal.status,
                metadata={
                    "source_model": journal_model,
                    "source_id": journal_id,
                    "voucher_type": journal.voucher_type,
                },
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

    # G5) Duplicate posted journals referencing the same BillingInvoice source link
    # Deterministic: JournalEntry(source_model="BillingInvoice", source_id=<invoice_id>, status=POSTED) count > 1
    journal_dupes = (
        JournalEntry.objects.filter(
            source_model="BillingInvoice",
            status=JournalEntryStatus.POSTED,
        )
        .exclude(source_id__isnull=True)
        .values("source_id")
        .annotate(journal_count=Count("id"))
        .filter(journal_count__gt=1)
    )
    totals["checked"] += journal_dupes.count()
    for row in journal_dupes:
        source_id = str(row["source_id"])
        inv = BillingInvoice.objects.filter(pk=source_id).only("id", "document_no").first()
        label = (getattr(inv, "document_no", None) or f"INV-{source_id}") if inv else f"INV-{source_id}"
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_BILLING,
            source_type="BillingInvoice",
            source_id=source_id,
            source_label=label,
            severity=ReconciliationSeverity.CRITICAL,
            status=ReconciliationItemStatus.DUPLICATE_POSTING,
            exception_code="BILLING_INVOICE_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            exception_message="Multiple posted journal entries reference the same BillingInvoice source_model/source_id.",
            recommended_action="Investigate potential duplicate posting; confirm audit trail and void/reversal behavior follows existing operational workflows (no auto-correction).",
            metadata={"journal_count": row["journal_count"]},
        )
        if inv:
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="BillingInvoice",
                object_id=str(inv.id),
                label=label,
                amount=None,
                status=None,
                metadata={},
            )
        for journal in JournalEntry.objects.filter(
            source_model="BillingInvoice",
            source_id=source_id,
            status=JournalEntryStatus.POSTED,
        ).only("id", "entry_no", "status", "entry_date", "voucher_type")[:10]:
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="JournalEntry",
                object_id=str(journal.id),
                label=journal.entry_no,
                status=journal.status,
                metadata={"entry_date": str(journal.entry_date), "voucher_type": journal.voucher_type},
            )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    # G1) Invoice shows received_total but no posted receipt documents are linked (explicit FK only)
    receipt_exists = ReceiptDocument.objects.filter(
        billing_invoice_id=OuterRef("pk"),
        status=BillingDocumentStatus.POSTED,
    )
    invoices_with_money = invoices.filter(
        status=BillingDocumentStatus.POSTED,
        received_total__gt=MONEY_ZERO,
    ).annotate(has_posted_receipt=Exists(receipt_exists)).filter(has_posted_receipt=False)
    for inv in invoices_with_money:
        severity = ReconciliationSeverity.HIGH if inv.direct_sale_id else ReconciliationSeverity.MEDIUM
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_BILLING if not inv.direct_sale_id else MODULE_DIRECT_SALE,
            source_type="BillingInvoice",
            source_id=str(inv.id),
            source_label=inv.document_no or f"INV-{inv.id}",
            severity=severity,
            status=ReconciliationItemStatus.MISSING_SOURCE,
            exception_code="BILLING_INVOICE_RECEIPT_LINK_MISSING",
            exception_message="BillingInvoice has received_total > 0 but no POSTED ReceiptDocument is linked via billing_invoice FK.",
            recommended_action="Confirm receipt generation/attachment policy for this invoice; if required, generate/attach receipt via billing workflow (no auto-correction).",
            expected_amount=_money(inv.received_total),
            actual_amount=MONEY_ZERO,
            amount_delta=_money(inv.received_total),
            metadata={
                "billing_invoice_id": inv.id,
                "document_no": inv.document_no,
                "direct_sale_id": inv.direct_sale_id,
                "received_total": str(inv.received_total),
                "invoice_date": str(inv.invoice_date),
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="BillingInvoice",
            object_id=str(inv.id),
            label=inv.document_no or f"INV-{inv.id}",
            amount=inv.received_total,
            status=inv.status,
            metadata={"direct_sale_id": inv.direct_sale_id},
        )
        totals["exceptions"] += 1
        if severity in {ReconciliationSeverity.HIGH, ReconciliationSeverity.CRITICAL}:
            totals["high_risk"] += 1

    # G6) Invoice amount fields internally inconsistent (balance/received/grand mismatch) (same-model deterministic)
    for inv in invoices:
        expected_balance = _money(inv.grand_total) - _money(inv.received_total)
        if expected_balance < MONEY_ZERO or _money(inv.balance_total) != expected_balance:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_BILLING if not inv.direct_sale_id else MODULE_DIRECT_SALE,
                source_type="BillingInvoice",
                source_id=str(inv.id),
                source_label=inv.document_no or f"INV-{inv.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.AMOUNT_MISMATCH,
                exception_code="BILLING_INVOICE_AMOUNT_FIELDS_MISMATCH",
                exception_message="BillingInvoice grand_total/received_total/balance_total are internally inconsistent (expected balance != stored balance).",
                recommended_action="Investigate invoice settlement snapshots; recalculate via existing billing settlement workflow (no auto-correction).",
                expected_amount=expected_balance,
                actual_amount=_money(inv.balance_total),
                amount_delta=_money(inv.balance_total) - expected_balance,
                metadata={
                    "billing_invoice_id": inv.id,
                    "document_no": inv.document_no,
                    "status": inv.status,
                    "grand_total": str(inv.grand_total),
                    "received_total": str(inv.received_total),
                    "balance_total": str(inv.balance_total),
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="BillingInvoice",
                object_id=str(inv.id),
                label=inv.document_no or f"INV-{inv.id}",
                amount=inv.grand_total,
                status=inv.status,
                metadata={
                    "expected_balance_total": str(expected_balance),
                    "detected_at": timezone.now().isoformat(),
                },
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

    # G7) Invoice is CANCELLED/VOID but still has outstanding balance (same-model deterministic)
    cancelled_outstanding = invoices.filter(
        status__in={BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID},
        balance_total__gt=MONEY_ZERO,
    )
    for inv in cancelled_outstanding:
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_BILLING if not inv.direct_sale_id else MODULE_DIRECT_SALE,
            source_type="BillingInvoice",
            source_id=str(inv.id),
            source_label=inv.document_no or f"INV-{inv.id}",
            severity=ReconciliationSeverity.HIGH,
            status=ReconciliationItemStatus.STATUS_MISMATCH,
            exception_code="BILLING_INVOICE_CANCELLED_OUTSTANDING",
            exception_message="BillingInvoice is CANCELLED/VOID but still has a non-zero balance_total.",
            recommended_action="Confirm void/cancellation lifecycle and whether outstanding should be cleared via existing return/void workflows (no auto-correction).",
            expected_amount=MONEY_ZERO,
            actual_amount=_money(inv.balance_total),
            amount_delta=_money(inv.balance_total),
            metadata={
                "billing_invoice_id": inv.id,
                "document_no": inv.document_no,
                "status": inv.status,
                "balance_total": str(inv.balance_total),
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="BillingInvoice",
            object_id=str(inv.id),
            label=inv.document_no or f"INV-{inv.id}",
            amount=inv.balance_total,
            status=inv.status,
            metadata={},
        )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    receipts = ReceiptDocument.objects.select_related("billing_invoice", "direct_sale", "customer").all()
    if branch_id:
        receipts = receipts.filter(branch_id=branch_id)
    receipts = receipts.filter(_date_range_filter("receipt_date", date_from, date_to))
    totals["checked"] += receipts.count()

    # G2) Receipt has an explicit invoice link but the link is internally invalid (customer/direct_sale mismatch)
    invalid_receipts = receipts.filter(billing_invoice__isnull=False).filter(
        Q(customer__isnull=False, billing_invoice__customer__isnull=False)
        | Q(direct_sale__isnull=False)
    )
    for receipt in invalid_receipts:
        invoice = receipt.billing_invoice
        mismatch_reasons: list[str] = []
        if receipt.customer_id and invoice.customer_id and receipt.customer_id != invoice.customer_id:
            mismatch_reasons.append("customer_id_mismatch")
        if receipt.direct_sale_id and invoice.direct_sale_id != receipt.direct_sale_id:
            mismatch_reasons.append("direct_sale_id_mismatch")

        if not mismatch_reasons:
            continue

        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_BILLING if not receipt.direct_sale_id else MODULE_DIRECT_SALE,
            source_type="ReceiptDocument",
            source_id=str(receipt.id),
            source_label=receipt.receipt_no or f"RCT-{receipt.id}",
            severity=ReconciliationSeverity.HIGH,
            status=ReconciliationItemStatus.STATUS_MISMATCH,
            exception_code="RECEIPT_DOCUMENT_INVOICE_LINK_INVALID",
            exception_message="ReceiptDocument.billing_invoice FK points to an invoice but linked customer/direct_sale fields are inconsistent.",
            recommended_action="Review receipt linkage and correct only through explicit billing workflows (no auto-correction).",
            metadata={
                "receipt_id": receipt.id,
                "receipt_no": receipt.receipt_no,
                "billing_invoice_id": receipt.billing_invoice_id,
                "receipt_customer_id": receipt.customer_id,
                "invoice_customer_id": invoice.customer_id,
                "receipt_direct_sale_id": receipt.direct_sale_id,
                "invoice_direct_sale_id": invoice.direct_sale_id,
                "mismatch_reasons": mismatch_reasons,
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
                "billing_invoice_id": receipt.billing_invoice_id,
                "direct_sale_id": receipt.direct_sale_id,
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="BillingInvoice",
            object_id=str(invoice.id),
            label=invoice.document_no or f"INV-{invoice.id}",
            amount=invoice.grand_total,
            status=invoice.status,
            metadata={},
        )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    return totals
