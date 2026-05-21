from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, Q

from accounting.models import JournalEntry, JournalEntryStatus
from billing.models import (
    BillingDocumentStatus,
    BillingCreditNote,
    CustomerRefund,
    CustomerRefundStatus,
    DirectSaleReturn,
    DirectSaleReturnStatus,
)
from reconciliation.models import (
    ReconciliationEvidence,
    ReconciliationItem,
    ReconciliationItemStatus,
    ReconciliationSeverity,
)


MODULE_RETURNS = "returns"

MONEY_ZERO = Decimal("0.00")


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _date_range_filter(prefix: str, date_from, date_to) -> Q:
    q = Q()
    if date_from:
        q &= Q(**{f"{prefix}__gte": date_from})
    if date_to:
        q &= Q(**{f"{prefix}__lte": date_to})
    return q


def _normalized_source_fields(journal: JournalEntry) -> tuple[str | None, str | None]:
    source_model = (getattr(journal, "source_model", None) or "").strip() or None
    source_id = (getattr(journal, "source_id", None) or "").strip() or None
    return source_model, source_id


def run_return_cancellation_checks(*, run, totals: dict) -> dict:
    """Phase H: deterministic cancellation/return/refund reconciliation checks.

    Constraints:
    - Detection only (no mutation of source records).
    - Use explicit FK / OneToOne links only. No inferred joins.
    """

    date_from = run.date_from
    date_to = run.date_to
    branch_id = run.branch_id

    # H4/H5/H6/H8) DirectSaleReturn integrity + required credit-note accounting evidence.
    returns = DirectSaleReturn.objects.select_related(
        "direct_sale",
        "original_invoice",
        "credit_note",
        "credit_note__posted_journal_entry",
        "customer",
    ).all()
    if branch_id:
        returns = returns.filter(Q(direct_sale__branch_id=branch_id) | Q(original_invoice__branch_id=branch_id))
    # Prefer posted timestamp for scope; fall back to created_at date for legacy records.
    posted_q = _date_range_filter("posted_at__date", date_from, date_to)
    created_q = _date_range_filter("created_at__date", date_from, date_to)
    returns = returns.filter(posted_q | created_q)
    totals["checked"] += returns.count()

    for ret in returns:
        expected_grand = _money(_money(ret.subtotal) + _money(ret.tax_total))
        actual_grand = _money(ret.grand_total)
        if expected_grand != actual_grand:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_RETURNS,
                source_type="DirectSaleReturn",
                source_id=str(ret.id),
                source_label=ret.return_no or f"DSRET-{ret.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.AMOUNT_MISMATCH,
                exception_code="DIRECT_SALE_RETURN_AMOUNT_FIELDS_MISMATCH",
                exception_message="DirectSaleReturn grand_total does not equal subtotal + tax_total.",
                recommended_action="Investigate return totals for internal consistency; correct only through existing billing workflows (no auto-correction).",
                expected_amount=expected_grand,
                actual_amount=actual_grand,
                amount_delta=_money(actual_grand - expected_grand),
                metadata={
                    "direct_sale_return_id": ret.id,
                    "return_no": ret.return_no,
                    "status": ret.status,
                    "subtotal": str(ret.subtotal),
                    "tax_total": str(ret.tax_total),
                    "grand_total": str(ret.grand_total),
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="DirectSaleReturn",
                object_id=str(ret.id),
                label=ret.return_no or f"DSRET-{ret.id}",
                amount=ret.grand_total,
                status=ret.status,
                metadata={
                    "direct_sale_id": ret.direct_sale_id,
                    "original_invoice_id": ret.original_invoice_id,
                    "credit_note_id": ret.credit_note_id,
                },
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

        invoice = ret.original_invoice
        if invoice and invoice.direct_sale_id and ret.direct_sale_id and invoice.direct_sale_id != ret.direct_sale_id:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_RETURNS,
                source_type="DirectSaleReturn",
                source_id=str(ret.id),
                source_label=ret.return_no or f"DSRET-{ret.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.STATUS_MISMATCH,
                exception_code="DIRECT_SALE_RETURN_ORIGINAL_INVOICE_LINK_INVALID",
                exception_message="DirectSaleReturn.original_invoice does not belong to the same direct_sale.",
                recommended_action="Investigate return linkage; correct only through explicit billing return workflows (no auto-correction).",
                metadata={
                    "direct_sale_return_id": ret.id,
                    "direct_sale_id": ret.direct_sale_id,
                    "original_invoice_id": ret.original_invoice_id,
                    "invoice_direct_sale_id": invoice.direct_sale_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="DirectSaleReturn",
                object_id=str(ret.id),
                label=ret.return_no or f"DSRET-{ret.id}",
                status=ret.status,
                metadata={
                    "direct_sale_id": ret.direct_sale_id,
                    "original_invoice_id": ret.original_invoice_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="BillingInvoice",
                object_id=str(invoice.id),
                label=invoice.document_no or f"INV-{invoice.id}",
                amount=invoice.grand_total,
                status=invoice.status,
                metadata={"direct_sale_id": invoice.direct_sale_id},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

        if invoice and ret.customer_id and invoice.customer_id and invoice.customer_id != ret.customer_id:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_RETURNS,
                source_type="DirectSaleReturn",
                source_id=str(ret.id),
                source_label=ret.return_no or f"DSRET-{ret.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.NEEDS_REVIEW,
                exception_code="DIRECT_SALE_RETURN_CUSTOMER_LINK_MISMATCH",
                exception_message="DirectSaleReturn.customer does not match original_invoice.customer.",
                recommended_action="Investigate return/customer linkage; correct only through explicit billing return workflows (no auto-correction).",
                metadata={
                    "direct_sale_return_id": ret.id,
                    "return_customer_id": ret.customer_id,
                    "invoice_customer_id": invoice.customer_id,
                    "original_invoice_id": ret.original_invoice_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="DirectSaleReturn",
                object_id=str(ret.id),
                label=ret.return_no or f"DSRET-{ret.id}",
                status=ret.status,
                metadata={"customer_id": ret.customer_id},
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="BillingInvoice",
                object_id=str(invoice.id),
                label=invoice.document_no or f"INV-{invoice.id}",
                status=invoice.status,
                metadata={"customer_id": invoice.customer_id},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

        financial_mode = str((ret.metadata or {}).get("financial_mode") or "STANDARD_REVERSAL").strip().upper()
        requires_note = ret.status == DirectSaleReturnStatus.POSTED and financial_mode != "NO_ACTIVE_CUSTOMER_VALUE"

        if requires_note and not ret.credit_note_id:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_RETURNS,
                source_type="DirectSaleReturn",
                source_id=str(ret.id),
                source_label=ret.return_no or f"DSRET-{ret.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.MISSING_SOURCE,
                exception_code="DIRECT_SALE_RETURN_CREDIT_NOTE_MISSING",
                exception_message="DirectSaleReturn is POSTED but expected credit_note is missing for financial_mode.",
                recommended_action="Investigate return posting integrity; if required, post the return through the standard reversal workflow (no auto-correction).",
                metadata={
                    "direct_sale_return_id": ret.id,
                    "return_no": ret.return_no,
                    "status": ret.status,
                    "financial_mode": financial_mode,
                    "direct_sale_id": ret.direct_sale_id,
                    "original_invoice_id": ret.original_invoice_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="DirectSaleReturn",
                object_id=str(ret.id),
                label=ret.return_no or f"DSRET-{ret.id}",
                status=ret.status,
                metadata={"financial_mode": financial_mode},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

        note = ret.credit_note
        if note and requires_note and note.status in {BillingDocumentStatus.POSTED, BillingDocumentStatus.VOID} and not note.posted_journal_entry_id:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_RETURNS,
                source_type="BillingCreditNote",
                source_id=str(note.id),
                source_label=note.note_no or f"CN-{note.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.MISSING_SOURCE,
                exception_code="DIRECT_SALE_RETURN_CREDIT_NOTE_JOURNAL_MISSING",
                exception_message="Return credit note is POSTED/VOID but posted_journal_entry_id is NULL.",
                recommended_action="Investigate credit note posting; ensure the note is posted via the standard billing workflow and stores its journal link (no auto-correction).",
                metadata={
                    "credit_note_id": note.id,
                    "note_no": note.note_no,
                    "note_status": note.status,
                    "direct_sale_return_id": ret.id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="DirectSaleReturn",
                object_id=str(ret.id),
                label=ret.return_no or f"DSRET-{ret.id}",
                status=ret.status,
                metadata={"credit_note_id": note.id},
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="BillingCreditNote",
                object_id=str(note.id),
                label=note.note_no or f"CN-{note.id}",
                amount=note.total_adjustment,
                status=note.status,
                metadata={"original_invoice_id": note.original_invoice_id},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

        if note and ret.original_invoice_id and note.original_invoice_id != ret.original_invoice_id:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_RETURNS,
                source_type="DirectSaleReturn",
                source_id=str(ret.id),
                source_label=ret.return_no or f"DSRET-{ret.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.NEEDS_REVIEW,
                exception_code="DIRECT_SALE_RETURN_CREDIT_NOTE_SOURCE_LINK_INVALID",
                exception_message="DirectSaleReturn.credit_note.original_invoice does not match DirectSaleReturn.original_invoice.",
                recommended_action="Investigate return/credit-note linkage; correct only through standard workflows (no auto-correction).",
                metadata={
                    "direct_sale_return_id": ret.id,
                    "credit_note_id": note.id,
                    "return_original_invoice_id": ret.original_invoice_id,
                    "credit_note_original_invoice_id": note.original_invoice_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="BillingCreditNote",
                object_id=str(note.id),
                label=note.note_no or f"CN-{note.id}",
                amount=note.total_adjustment,
                status=note.status,
                metadata={"original_invoice_id": note.original_invoice_id},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

        if note and note.posted_journal_entry_id:
            journal = note.posted_journal_entry
            source_model, source_id = _normalized_source_fields(journal)
            if source_model != "BillingCreditNote" or source_id != str(note.id):
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_RETURNS,
                    source_type="BillingCreditNote",
                    source_id=str(note.id),
                    source_label=note.note_no or f"CN-{note.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.NEEDS_REVIEW,
                    exception_code="DIRECT_SALE_RETURN_CREDIT_NOTE_JOURNAL_SOURCE_LINK_INVALID",
                    exception_message="Credit note posted_journal_entry is not source-linked to this BillingCreditNote (source_model/source_id mismatch).",
                    recommended_action="Investigate journal source reference; correct only via explicit posting workflows (no auto-correction).",
                    metadata={
                        "credit_note_id": note.id,
                        "journal_entry_id": journal.id,
                        "journal_source_model": source_model,
                        "journal_source_id": source_id,
                    },
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="BillingCreditNote",
                    object_id=str(note.id),
                    label=note.note_no or f"CN-{note.id}",
                    amount=note.total_adjustment,
                    status=note.status,
                    metadata={},
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="JournalEntry",
                    object_id=str(journal.id),
                    label=journal.entry_no,
                    status=journal.status,
                    metadata={
                        "source_model": source_model,
                        "source_id": source_id,
                        "voucher_type": journal.voucher_type,
                    },
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1

        if note:
            expected_total = _money(_money(note.taxable_adjustment) + _money(note.tax_adjustment))
            actual_total = _money(note.total_adjustment)
            if expected_total != actual_total:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_RETURNS,
                    source_type="BillingCreditNote",
                    source_id=str(note.id),
                    source_label=note.note_no or f"CN-{note.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.AMOUNT_MISMATCH,
                    exception_code="CREDIT_NOTE_AMOUNT_FIELDS_MISMATCH",
                    exception_message="BillingCreditNote total_adjustment does not equal taxable_adjustment + tax_adjustment.",
                    recommended_action="Investigate credit note totals for internal consistency; correct only through existing posting workflows (no auto-correction).",
                    expected_amount=expected_total,
                    actual_amount=actual_total,
                    amount_delta=_money(actual_total - expected_total),
                    metadata={
                        "credit_note_id": note.id,
                        "note_no": note.note_no,
                        "status": note.status,
                        "taxable_adjustment": str(note.taxable_adjustment),
                        "tax_adjustment": str(note.tax_adjustment),
                        "total_adjustment": str(note.total_adjustment),
                    },
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="BillingCreditNote",
                    object_id=str(note.id),
                    label=note.note_no or f"CN-{note.id}",
                    amount=note.total_adjustment,
                    status=note.status,
                    metadata={},
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1

    # H7) Duplicate posted journal source reference for the same credit note (deterministic).
    note_journal_dupes = (
        JournalEntry.objects.filter(
            source_model="BillingCreditNote",
            status=JournalEntryStatus.POSTED,
        )
        .exclude(source_id__isnull=True)
        .values("source_id")
        .annotate(journal_count=Count("id"))
        .filter(journal_count__gt=1)
    )
    totals["checked"] += note_journal_dupes.count()
    for row in note_journal_dupes:
        source_id = str(row["source_id"])
        note = BillingCreditNote.objects.filter(pk=source_id).only("id", "note_no", "status", "total_adjustment").first()
        label = (getattr(note, "note_no", None) or f"CN-{source_id}") if note else f"CN-{source_id}"
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_RETURNS,
            source_type="BillingCreditNote",
            source_id=source_id,
            source_label=label,
            severity=ReconciliationSeverity.CRITICAL,
            status=ReconciliationItemStatus.DUPLICATE_POSTING,
            exception_code="CREDIT_NOTE_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            exception_message="Multiple posted journal entries reference the same BillingCreditNote source_model/source_id.",
            recommended_action="Investigate potential duplicate posting; confirm audit trail and reversal behavior follows existing workflows (no auto-correction).",
            metadata={"journal_count": row["journal_count"]},
        )
        if note:
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="BillingCreditNote",
                object_id=str(note.id),
                label=label,
                amount=note.total_adjustment,
                status=note.status,
                metadata={},
            )
        for journal in JournalEntry.objects.filter(
            source_model="BillingCreditNote",
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

    # H4/H5/H6/H7/H8) CustomerRefund integrity + accounting evidence.
    refunds = CustomerRefund.objects.select_related(
        "direct_sale_return",
        "direct_sale_return__direct_sale",
        "direct_sale_return__original_invoice",
        "customer",
        "posted_journal_entry",
        "finance_account",
    ).all()
    if branch_id:
        refunds = refunds.filter(
            Q(finance_account__branch_id=branch_id)
            | Q(direct_sale_return__direct_sale__branch_id=branch_id)
            | Q(direct_sale_return__original_invoice__branch_id=branch_id)
        )
    paid_q = _date_range_filter("paid_at__date", date_from, date_to)
    created_q = _date_range_filter("created_at__date", date_from, date_to)
    refunds = refunds.filter(paid_q | created_q)
    totals["checked"] += refunds.count()

    for refund in refunds:
        ret = refund.direct_sale_return
        if ret and refund.customer_id and ret.customer_id and refund.customer_id != ret.customer_id:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_RETURNS,
                source_type="CustomerRefund",
                source_id=str(refund.id),
                source_label=refund.refund_no or f"REF-{refund.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.NEEDS_REVIEW,
                exception_code="CUSTOMER_REFUND_DIRECT_SALE_RETURN_LINK_INVALID",
                exception_message="CustomerRefund.customer does not match linked DirectSaleReturn.customer.",
                recommended_action="Investigate refund linkage; correct only through existing refund workflows (no auto-correction).",
                metadata={
                    "customer_refund_id": refund.id,
                    "refund_no": refund.refund_no,
                    "refund_customer_id": refund.customer_id,
                    "direct_sale_return_id": refund.direct_sale_return_id,
                    "return_customer_id": ret.customer_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="CustomerRefund",
                object_id=str(refund.id),
                label=refund.refund_no or f"REF-{refund.id}",
                amount=refund.amount,
                status=refund.status,
                metadata={"direct_sale_return_id": refund.direct_sale_return_id},
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="DirectSaleReturn",
                object_id=str(ret.id),
                label=ret.return_no or f"DSRET-{ret.id}",
                amount=ret.grand_total,
                status=ret.status,
                metadata={"customer_id": ret.customer_id},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

        if refund.status == CustomerRefundStatus.PAID and not refund.posted_journal_entry_id:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_RETURNS,
                source_type="CustomerRefund",
                source_id=str(refund.id),
                source_label=refund.refund_no or f"REF-{refund.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.MISSING_SOURCE,
                exception_code="CUSTOMER_REFUND_PAID_JOURNAL_MISSING",
                exception_message="CustomerRefund is PAID but posted_journal_entry_id is NULL.",
                recommended_action="Investigate refund payment posting; ensure refund is paid via the standard workflow and stores its journal link (no auto-correction).",
                metadata={
                    "customer_refund_id": refund.id,
                    "refund_no": refund.refund_no,
                    "status": refund.status,
                    "paid_at": str(refund.paid_at) if refund.paid_at else None,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="CustomerRefund",
                object_id=str(refund.id),
                label=refund.refund_no or f"REF-{refund.id}",
                amount=refund.amount,
                status=refund.status,
                metadata={"direct_sale_return_id": refund.direct_sale_return_id, "method": refund.method},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

        if refund.posted_journal_entry_id:
            journal = refund.posted_journal_entry
            source_model, source_id = _normalized_source_fields(journal)
            if source_model != "CustomerRefund" or source_id != str(refund.id):
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE_RETURNS,
                    source_type="CustomerRefund",
                    source_id=str(refund.id),
                    source_label=refund.refund_no or f"REF-{refund.id}",
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.NEEDS_REVIEW,
                    exception_code="CUSTOMER_REFUND_JOURNAL_SOURCE_LINK_INVALID",
                    exception_message="CustomerRefund posted_journal_entry is not source-linked to this refund (source_model/source_id mismatch).",
                    recommended_action="Investigate journal source reference; correct only via explicit posting workflows (no auto-correction).",
                    metadata={
                        "customer_refund_id": refund.id,
                        "journal_entry_id": journal.id,
                        "journal_source_model": source_model,
                        "journal_source_id": source_id,
                    },
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="CustomerRefund",
                    object_id=str(refund.id),
                    label=refund.refund_no or f"REF-{refund.id}",
                    amount=refund.amount,
                    status=refund.status,
                    metadata={},
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="JournalEntry",
                    object_id=str(journal.id),
                    label=journal.entry_no,
                    status=journal.status,
                    metadata={
                        "source_model": source_model,
                        "source_id": source_id,
                        "voucher_type": journal.voucher_type,
                    },
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1

    refund_journal_dupes = (
        JournalEntry.objects.filter(
            source_model="CustomerRefund",
            status=JournalEntryStatus.POSTED,
        )
        .exclude(source_id__isnull=True)
        .values("source_id")
        .annotate(journal_count=Count("id"))
        .filter(journal_count__gt=1)
    )
    totals["checked"] += refund_journal_dupes.count()
    for row in refund_journal_dupes:
        source_id = str(row["source_id"])
        refund = CustomerRefund.objects.filter(pk=source_id).only("id", "refund_no", "status", "amount").first()
        label = (getattr(refund, "refund_no", None) or f"REF-{source_id}") if refund else f"REF-{source_id}"
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_RETURNS,
            source_type="CustomerRefund",
            source_id=source_id,
            source_label=label,
            severity=ReconciliationSeverity.CRITICAL,
            status=ReconciliationItemStatus.DUPLICATE_POSTING,
            exception_code="CUSTOMER_REFUND_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            exception_message="Multiple posted journal entries reference the same CustomerRefund source_model/source_id.",
            recommended_action="Investigate potential duplicate posting; confirm audit trail and refund workflow followed existing controls (no auto-correction).",
            metadata={"journal_count": row["journal_count"]},
        )
        if refund:
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="CustomerRefund",
                object_id=str(refund.id),
                label=label,
                amount=refund.amount,
                status=refund.status,
                metadata={},
            )
        for journal in JournalEntry.objects.filter(
            source_model="CustomerRefund",
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

    return totals

