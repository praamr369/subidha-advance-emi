from __future__ import annotations

from decimal import Decimal

from django.db import models
from django.db.models import Count, Exists, OuterRef, Q, Sum
from django.db.models.functions import Cast

from accounting.models import AccountingBridgePosting, JournalEntry, JournalEntryGroup
from accounting.services.accounting_bridge_candidate_service import BridgeCandidateFilters, list_bridge_candidates
from billing.models import BillingInvoice, ReceiptDocument
from subscriptions.models import Payment

from reconciliation.models import (
    ReconciliationEvidence,
    ReconciliationItem,
    ReconciliationItemStatus,
    ReconciliationSeverity,
)

MODULE = "ACCOUNTING_BRIDGE_PHASE_F"
BRIDGE_SOURCE_MODELS = ("Payment", "ReceiptDocument", "BillingInvoice")


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _date_range_filter(prefix: str, date_from, date_to):
    q = Q()
    if date_from:
        q &= Q(**{f"{prefix}__gte": date_from})
    if date_to:
        q &= Q(**{f"{prefix}__lte": date_to})
    return q


def _source_amount(*, source_model: str, source_id: str) -> Decimal | None:
    if source_model == "Payment":
        payment = Payment.objects.filter(pk=source_id).only("amount").first()
        return _money(payment.amount) if payment else None
    if source_model == "ReceiptDocument":
        receipt = ReceiptDocument.objects.filter(pk=source_id).only("amount").first()
        return _money(receipt.amount) if receipt else None
    if source_model == "BillingInvoice":
        invoice = BillingInvoice.objects.filter(pk=source_id).only("grand_total").first()
        return _money(invoice.grand_total) if invoice else None
    return None


def _source_label(*, source_model: str, source_id: str, fallback: str = "") -> str:
    if source_model == "Payment":
        payment = Payment.objects.filter(pk=source_id).only("reference_no").first()
        return (payment.reference_no if payment and payment.reference_no else f"PAY-{source_id}")
    if source_model == "ReceiptDocument":
        receipt = ReceiptDocument.objects.filter(pk=source_id).only("receipt_no", "source_reference").first()
        if receipt:
            return receipt.receipt_no or receipt.source_reference or f"RCT-{source_id}"
        return f"RCT-{source_id}"
    if source_model == "BillingInvoice":
        invoice = BillingInvoice.objects.filter(pk=source_id).only("document_no", "source_reference").first()
        if invoice:
            return invoice.document_no or invoice.source_reference or f"INV-{source_id}"
        return f"INV-{source_id}"
    return fallback or f"{source_model}-{source_id}"


def _create_missing_bridge_item(*, run, source_model: str, source_id: str, source_label: str, amount, exception_code: str, message: str, metadata: dict, totals: dict):
    item = ReconciliationItem.objects.create(
        run=run,
        module=MODULE,
        source_type=source_model,
        source_id=str(source_id),
        source_label=source_label,
        severity=ReconciliationSeverity.HIGH,
        status=ReconciliationItemStatus.MISSING_SOURCE,
        exception_code=exception_code,
        exception_message=message,
        recommended_action="Open bridge reconciliation and post this concrete source item only after explicit admin review.",
        expected_amount=amount,
        actual_amount=Decimal("0.00"),
        amount_delta=amount,
        metadata={**metadata, "bridge_status": "NOT_POSTED", "action_href": "/admin/accounting/bridge-reconciliation"},
    )
    ReconciliationEvidence.objects.create(item=item, evidence_type=source_model, object_id=str(source_id), label=source_label, amount=amount, metadata={})
    totals["exceptions"] += 1
    totals["high_risk"] += 1


def run_accounting_bridge_checks(*, run, totals: dict) -> dict:
    date_from = run.date_from
    date_to = run.date_to
    branch_id = run.branch_id

    payments = Payment.objects.all()
    if branch_id:
        payments = payments.filter(branch_id=branch_id)
    payments = payments.filter(_date_range_filter("payment_date", date_from, date_to))

    bridge_exists = AccountingBridgePosting.objects.filter(source_model="Payment", source_id=Cast(OuterRef("pk"), output_field=models.CharField()), purpose="PAYMENT_COLLECTION")
    for payment in payments.annotate(has_bridge=Exists(bridge_exists)).filter(has_bridge=False):
        _create_missing_bridge_item(run=run, source_model="Payment", source_id=str(payment.id), source_label=payment.reference_no or f"PAY-{payment.id}", amount=payment.amount, exception_code="PAYMENT_MISSING_ACCOUNTING_BRIDGE_POSTING", message="Payment exists but AccountingBridgePosting is missing for purpose PAYMENT_COLLECTION.", metadata={"payment_id": payment.id, "payment_date": str(payment.payment_date)}, totals=totals)

    receipt_candidates = list_bridge_candidates(BridgeCandidateFilters(date_from=date_from, date_to=date_to, source_model="ReceiptDocument"))
    for row in receipt_candidates:
        if row.get("status") != "READY_UNPOSTED":
            continue
        if branch_id:
            receipt = ReceiptDocument.objects.filter(pk=row.get("source_pk"), branch_id=branch_id).first()
            if receipt is None:
                continue
        _create_missing_bridge_item(run=run, source_model="ReceiptDocument", source_id=str(row["source_pk"]), source_label=row.get("source_reference_number") or f"RCT-{row['source_pk']}", amount=_money(row.get("amount")), exception_code="RECEIPT_DOCUMENT_MISSING_ACCOUNTING_BRIDGE_POSTING", message="ReceiptDocument exists as a supported concrete bridge candidate but AccountingBridgePosting is missing.", metadata={"receipt_document_id": row["source_pk"], "event_key": row.get("event_key"), "receipt_type": row.get("receipt_type"), "source_date": row.get("source_date")}, totals=totals)

    invoice_candidates = list_bridge_candidates(BridgeCandidateFilters(date_from=date_from, date_to=date_to, source_model="BillingInvoice"))
    for row in invoice_candidates:
        if row.get("status") != "READY_UNPOSTED":
            continue
        if branch_id:
            invoice = BillingInvoice.objects.filter(pk=row.get("source_pk"), branch_id=branch_id).first()
            if invoice is None:
                continue
        _create_missing_bridge_item(run=run, source_model="BillingInvoice", source_id=str(row["source_pk"]), source_label=row.get("source_reference_number") or f"INV-{row['source_pk']}", amount=_money(row.get("amount")), exception_code="BILLING_INVOICE_MISSING_ACCOUNTING_BRIDGE_POSTING", message="BillingInvoice exists as a supported concrete bridge candidate but AccountingBridgePosting is missing.", metadata={"billing_invoice_id": row["source_pk"], "event_key": row.get("event_key"), "invoice_type": row.get("invoice_type"), "invoice_status": row.get("invoice_status"), "taxable_amount": row.get("taxable_amount"), "tax_amount": row.get("tax_amount"), "source_date": row.get("source_date")}, totals=totals)

    bridges = AccountingBridgePosting.objects.filter(source_model__in=BRIDGE_SOURCE_MODELS).select_related("journal_entry")
    if date_from or date_to:
        bridges = bridges.filter(_date_range_filter("source_event_date", date_from, date_to))
    if branch_id:
        payment_source_ids = [str(pk) for pk in Payment.objects.filter(branch_id=branch_id).values_list("id", flat=True)]
        receipt_source_ids = [str(pk) for pk in ReceiptDocument.objects.filter(branch_id=branch_id).values_list("id", flat=True)]
        invoice_source_ids = [str(pk) for pk in BillingInvoice.objects.filter(branch_id=branch_id).values_list("id", flat=True)]
        bridges = bridges.filter(
            Q(trace_metadata__branch_id=branch_id)
            | Q(source_model="Payment", source_id__in=payment_source_ids)
            | Q(source_model="ReceiptDocument", source_id__in=receipt_source_ids)
            | Q(source_model="BillingInvoice", source_id__in=invoice_source_ids)
        )
    totals["checked"] += bridges.count()

    for bridge in bridges:
        journal = bridge.journal_entry
        source_model = bridge.source_model
        source_id = str(bridge.source_id)
        source_label = _source_label(source_model=source_model, source_id=source_id, fallback=bridge.source_reference)
        source_amount = _source_amount(source_model=source_model, source_id=source_id)
        if not journal_id_matches_bridge(bridge, journal):
            item = ReconciliationItem.objects.create(run=run, module=MODULE, source_type="AccountingBridgePosting", source_id=str(bridge.id), source_label=str(bridge), severity=ReconciliationSeverity.CRITICAL, status=ReconciliationItemStatus.NEEDS_REVIEW, exception_code="BRIDGE_JOURNAL_MISSING_SOURCE_REFERENCE", exception_message="Bridge posting journal entry is missing or mismatching source_model/source_id.", recommended_action="Investigate bridge posting integrity; do not edit posted journals without explicit operational workflow.", metadata={"bridge_posting_id": bridge.id, "bridge_source_model": bridge.source_model, "bridge_source_id": bridge.source_id, "bridge_purpose": bridge.purpose, "journal_entry_id": journal.id, "journal_source_model": journal.source_model, "journal_source_id": journal.source_id})
            ReconciliationEvidence.objects.create(item=item, evidence_type="AccountingBridgePosting", object_id=str(bridge.id), label=str(bridge), metadata={"purpose": bridge.purpose})
            ReconciliationEvidence.objects.create(item=item, evidence_type="JournalEntry", object_id=str(journal.id), label=journal.entry_no, status=journal.status, metadata={})
            totals["exceptions"] += 1
            totals["high_risk"] += 1
            continue
        line_totals = journal.lines.aggregate(total_debit=Sum("debit_amount"), total_credit=Sum("credit_amount"))
        total_debit = _money(line_totals["total_debit"])
        total_credit = _money(line_totals["total_credit"])
        if total_debit != total_credit:
            item = ReconciliationItem.objects.create(run=run, module=MODULE, source_type=source_model, source_id=source_id, source_label=source_label, severity=ReconciliationSeverity.CRITICAL, status=ReconciliationItemStatus.AMOUNT_MISMATCH, exception_code="JOURNAL_UNBALANCED", exception_message="Posted bridge journal debit and credit totals do not balance.", recommended_action="Investigate journal lines; resolve only through explicit accounting workflows.", expected_amount=total_debit, actual_amount=total_credit, amount_delta=total_debit - total_credit, metadata={"journal_entry_id": journal.id, "bridge_posting_id": bridge.id})
            ReconciliationEvidence.objects.create(item=item, evidence_type="JournalEntry", object_id=str(journal.id), label=journal.entry_no, status=journal.status)
            totals["exceptions"] += 1
            totals["high_risk"] += 1
            continue
        if source_amount is not None and total_debit != source_amount:
            item = ReconciliationItem.objects.create(run=run, module=MODULE, source_type=source_model, source_id=source_id, source_label=source_label, severity=ReconciliationSeverity.HIGH, status=ReconciliationItemStatus.AMOUNT_MISMATCH, exception_code="AMOUNT_MISMATCH", exception_message=f"Posted bridge journal amount does not match the source {source_model} amount.", recommended_action="Investigate source amount and bridge journal; do not auto-correct.", expected_amount=source_amount, actual_amount=total_debit, amount_delta=total_debit - source_amount, metadata={"journal_entry_id": journal.id, "bridge_posting_id": bridge.id, "bridge_status": "AMOUNT_MISMATCH"})
            ReconciliationEvidence.objects.create(item=item, evidence_type=source_model, object_id=source_id, label=source_label, amount=source_amount)
            ReconciliationEvidence.objects.create(item=item, evidence_type="JournalEntry", object_id=str(journal.id), label=journal.entry_no, amount=total_debit, status=journal.status)
            totals["exceptions"] += 1
            continue
        if source_amount is not None:
            item = ReconciliationItem.objects.create(run=run, module=MODULE, source_type=source_model, source_id=source_id, source_label=source_label, severity=ReconciliationSeverity.LOW, status=ReconciliationItemStatus.NEEDS_REVIEW, exception_code="POSTED_UNVERIFIED", exception_message="Bridge journal matches source amount and link checks, but explicit verification is still required.", recommended_action="Verify from bridge reconciliation after operator review.", expected_amount=source_amount, actual_amount=total_debit, amount_delta=Decimal("0.00"), metadata={"journal_entry_id": journal.id, "bridge_posting_id": bridge.id, "bridge_status": "POSTED_UNVERIFIED", "action_href": "/admin/accounting/bridge-reconciliation"})
            ReconciliationEvidence.objects.create(item=item, evidence_type=source_model, object_id=source_id, label=source_label, amount=source_amount)
            ReconciliationEvidence.objects.create(item=item, evidence_type="JournalEntry", object_id=str(journal.id), label=journal.entry_no, amount=total_debit, status=journal.status)

    groups = JournalEntryGroup.objects.filter(is_balanced=False)
    if date_from or date_to:
        groups = groups.filter(_date_range_filter("transaction_date", date_from, date_to))
    totals["checked"] += groups.count()
    for group in groups:
        item = ReconciliationItem.objects.create(run=run, module=MODULE, source_type="JournalEntryGroup", source_id=str(group.id), source_label=group.journal_group_id, severity=ReconciliationSeverity.CRITICAL, status=ReconciliationItemStatus.AMOUNT_MISMATCH, exception_code="JOURNAL_GROUP_UNBALANCED", exception_message="Journal entry group is marked unbalanced.", recommended_action="Investigate journal group totals and underlying lines; resolve via existing accounting workflows.", metadata={"journal_group_id": group.journal_group_id, "total_debit": str(group.total_debit), "total_credit": str(group.total_credit), "source_module": group.source_module, "source_object_id": group.source_object_id})
        ReconciliationEvidence.objects.create(item=item, evidence_type="JournalEntryGroup", object_id=str(group.id), label=group.journal_group_id, metadata={})
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    journal_dupes = JournalEntry.objects.filter(source_model__in=BRIDGE_SOURCE_MODELS, status="POSTED").exclude(source_id__isnull=True).values("source_model", "source_id", "voucher_type").annotate(journal_count=Count("id")).filter(journal_count__gt=1)
    totals["checked"] += journal_dupes.count()
    for row in journal_dupes:
        source_model = row["source_model"]
        source_id = str(row["source_id"])
        item = ReconciliationItem.objects.create(run=run, module=MODULE, source_type=source_model, source_id=source_id, source_label=_source_label(source_model=source_model, source_id=source_id), severity=ReconciliationSeverity.HIGH, status=ReconciliationItemStatus.DUPLICATE_POSTING, exception_code="DUPLICATE_JOURNAL_SOURCE_REFERENCE", exception_message=f"Multiple journal entries reference the same {source_model} source_model/source_id/voucher_type.", recommended_action="Investigate potential duplicate posting; confirm one is reversal/void and audit trail is intact.", metadata={"journal_count": row["journal_count"], "voucher_type": row["voucher_type"]})
        for journal in JournalEntry.objects.filter(source_model=source_model, source_id=source_id, voucher_type=row["voucher_type"], status="POSTED").only("id", "entry_no", "status", "entry_date")[:10]:
            ReconciliationEvidence.objects.create(item=item, evidence_type="JournalEntry", object_id=str(journal.id), label=journal.entry_no, status=journal.status, metadata={"entry_date": str(journal.entry_date)})
        totals["exceptions"] += 1
    return totals


def journal_id_matches_bridge(bridge: AccountingBridgePosting, journal: JournalEntry) -> bool:
    expected_model = (bridge.source_model or "").strip() or None
    expected_id = (bridge.source_id or "").strip() or None
    journal_model = (journal.source_model or "").strip() or None
    journal_id = (journal.source_id or "").strip() or None
    return bool(expected_model and expected_id and journal_model == expected_model and journal_id == expected_id)
