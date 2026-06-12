from __future__ import annotations

from decimal import Decimal

from django.db import models
from django.db.models import Count, Exists, OuterRef, Q, Sum
from django.db.models.functions import Cast

from accounting.models import AccountingBridgePosting, JournalEntry, JournalEntryGroup
from accounting.services.accounting_bridge_purchase_bill_service import BridgeCandidateFilters, list_bridge_candidates, stock_ledger_candidate
from billing.models import BillingCreditNote, BillingDebitNote, BillingInvoice, DirectSaleReturn, ReceiptDocument
from inventory.models import PurchaseBill, StockLedger, VendorPayment
from subscriptions.models import Commission, Payment

from reconciliation.models import ReconciliationEvidence, ReconciliationItem, ReconciliationItemStatus, ReconciliationSeverity

MODULE = "ACCOUNTING_BRIDGE_PHASE_F"
BRIDGE_SOURCE_MODELS = ("Payment", "ReceiptDocument", "BillingInvoice", "BillingCreditNote", "DirectSaleReturn", "BillingDebitNote", "PurchaseBill", "VendorPayment", "StockLedger", "Commission")


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
        row = Payment.objects.filter(pk=source_id).only("amount").first()
        return _money(row.amount) if row else None
    if source_model == "ReceiptDocument":
        row = ReceiptDocument.objects.filter(pk=source_id).only("amount").first()
        return _money(row.amount) if row else None
    if source_model == "BillingInvoice":
        row = BillingInvoice.objects.filter(pk=source_id).only("grand_total").first()
        return _money(row.grand_total) if row else None
    if source_model == "BillingCreditNote":
        row = BillingCreditNote.objects.filter(pk=source_id).only("total_adjustment").first()
        return _money(row.total_adjustment) if row else None
    if source_model == "BillingDebitNote":
        row = BillingDebitNote.objects.filter(pk=source_id).only("total_adjustment").first()
        return _money(row.total_adjustment) if row else None
    if source_model == "DirectSaleReturn":
        row = DirectSaleReturn.objects.filter(pk=source_id).only("grand_total").first()
        return _money(row.grand_total) if row else None
    if source_model == "PurchaseBill":
        row = PurchaseBill.objects.filter(pk=source_id).only("grand_total").first()
        return _money(row.grand_total) if row else None
    if source_model == "VendorPayment":
        row = VendorPayment.objects.filter(pk=source_id).only("amount").first()
        return _money(row.amount) if row else None
    if source_model == "StockLedger":
        row = StockLedger.objects.select_related("inventory_item", "inventory_item__product", "stock_location", "stock_location__branch").filter(pk=source_id).first()
        if row is None:
            return None
        candidate = stock_ledger_candidate(row)
        return _money(candidate.get("amount")) if candidate else None
    if source_model == "Commission":
        row = Commission.objects.filter(pk=source_id).only("commission_amount").first()
        return _money(row.commission_amount) if row else None
    return None


def _source_label(*, source_model: str, source_id: str, fallback: str = "") -> str:
    if source_model == "Payment":
        row = Payment.objects.filter(pk=source_id).only("reference_no").first()
        return (row.reference_no if row and row.reference_no else f"PAY-{source_id}")
    if source_model == "ReceiptDocument":
        row = ReceiptDocument.objects.filter(pk=source_id).only("receipt_no", "source_reference").first()
        return (row.receipt_no or row.source_reference or f"RCT-{source_id}") if row else f"RCT-{source_id}"
    if source_model == "BillingInvoice":
        row = BillingInvoice.objects.filter(pk=source_id).only("document_no", "source_reference").first()
        return (row.document_no or row.source_reference or f"INV-{source_id}") if row else f"INV-{source_id}"
    if source_model == "BillingCreditNote":
        row = BillingCreditNote.objects.filter(pk=source_id).only("note_no").first()
        return (row.note_no or f"CN-{source_id}") if row else f"CN-{source_id}"
    if source_model == "BillingDebitNote":
        row = BillingDebitNote.objects.filter(pk=source_id).only("note_no").first()
        return (row.note_no or f"DN-{source_id}") if row else f"DN-{source_id}"
    if source_model == "DirectSaleReturn":
        row = DirectSaleReturn.objects.filter(pk=source_id).only("return_no").first()
        return (row.return_no or f"RET-{source_id}") if row else f"RET-{source_id}"
    if source_model == "PurchaseBill":
        row = PurchaseBill.objects.filter(pk=source_id).only("bill_no").first()
        return (row.bill_no or f"PB-{source_id}") if row else f"PB-{source_id}"
    if source_model == "VendorPayment":
        row = VendorPayment.objects.filter(pk=source_id).only("payment_no", "reference_no").first()
        return (row.payment_no or row.reference_no or f"VP-{source_id}") if row else f"VP-{source_id}"
    if source_model == "StockLedger":
        return f"SL-{source_id}"
    if source_model == "Commission":
        row = Commission.objects.select_related("payment").filter(pk=source_id).only("id", "payment__reference_no").first()
        if row is None:
            return f"COMM-{source_id}"
        reference = getattr(row.payment, "reference_no", None) if row.payment_id else None
        return f"COMM-{source_id}-{reference}" if reference else f"COMM-{source_id}"
    return fallback or f"{source_model}-{source_id}"


def _create_missing_bridge_item(*, run, source_model: str, source_id: str, source_label: str, amount, exception_code: str, message: str, metadata: dict, totals: dict):
    item = ReconciliationItem.objects.create(run=run, module=MODULE, source_type=source_model, source_id=str(source_id), source_label=source_label, severity=ReconciliationSeverity.HIGH, status=ReconciliationItemStatus.MISSING_SOURCE, exception_code=exception_code, exception_message=message, recommended_action="Open bridge reconciliation and post this concrete source item only after explicit admin review.", expected_amount=amount, actual_amount=Decimal("0.00"), amount_delta=amount, metadata={**metadata, "bridge_status": "NOT_POSTED", "action_href": "/admin/accounting/bridge-reconciliation"})
    ReconciliationEvidence.objects.create(item=item, evidence_type=source_model, object_id=str(source_id), label=source_label, amount=amount, metadata={})
    totals["exceptions"] += 1
    totals["high_risk"] += 1


def _emit_ready_unposted_candidates(*, run, totals: dict, date_from, date_to, branch_id):
    specs = [
        ("ReceiptDocument", "RECEIPT_DOCUMENT_MISSING_ACCOUNTING_BRIDGE_POSTING", "ReceiptDocument exists as a supported concrete bridge candidate but AccountingBridgePosting is missing."),
        ("BillingInvoice", "BILLING_INVOICE_MISSING_ACCOUNTING_BRIDGE_POSTING", "BillingInvoice exists as a supported concrete bridge candidate but AccountingBridgePosting is missing."),
        ("BillingCreditNote", "BILLING_CREDIT_NOTE_MISSING_ACCOUNTING_BRIDGE_POSTING", "BillingCreditNote exists as a supported concrete bridge candidate but AccountingBridgePosting is missing."),
        ("DirectSaleReturn", "DIRECT_SALE_RETURN_MISSING_ACCOUNTING_BRIDGE_POSTING", "DirectSaleReturn exists as a supported concrete bridge candidate but AccountingBridgePosting is missing."),
        ("BillingDebitNote", "BILLING_DEBIT_NOTE_MISSING_ACCOUNTING_BRIDGE_POSTING", "BillingDebitNote exists as a supported concrete bridge candidate but AccountingBridgePosting is missing."),
        ("PurchaseBill", "PURCHASE_BILL_MISSING_ACCOUNTING_BRIDGE_POSTING", "PurchaseBill exists as a supported concrete bridge candidate but AccountingBridgePosting is missing."),
        ("VendorPayment", "VENDOR_PAYMENT_MISSING_ACCOUNTING_BRIDGE_POSTING", "VendorPayment exists as a supported concrete bridge candidate but AccountingBridgePosting is missing."),
        ("StockLedger", "STOCK_LEDGER_MISSING_ACCOUNTING_BRIDGE_POSTING", "StockLedger exists as a supported concrete bridge candidate but AccountingBridgePosting is missing."),
        ("Commission", "COMMISSION_MISSING_ACCOUNTING_BRIDGE_POSTING", "Commission exists as a supported concrete bridge candidate but AccountingBridgePosting is missing."),
    ]
    for source_model, code, message in specs:
        for row in list_bridge_candidates(BridgeCandidateFilters(date_from=date_from, date_to=date_to, source_model=source_model)):
            if row.get("status") != "READY_UNPOSTED":
                continue
            if branch_id and source_model == "ReceiptDocument" and not ReceiptDocument.objects.filter(pk=row.get("source_pk"), branch_id=branch_id).exists():
                continue
            if branch_id and source_model == "BillingInvoice" and not BillingInvoice.objects.filter(pk=row.get("source_pk"), branch_id=branch_id).exists():
                continue
            if branch_id and source_model == "BillingCreditNote" and not BillingCreditNote.objects.filter(pk=row.get("source_pk"), original_invoice__branch_id=branch_id).exists():
                continue
            if branch_id and source_model == "BillingDebitNote" and not BillingDebitNote.objects.filter(pk=row.get("source_pk"), original_invoice__branch_id=branch_id).exists():
                continue
            if branch_id and source_model == "DirectSaleReturn" and not DirectSaleReturn.objects.filter(pk=row.get("source_pk"), direct_sale__branch_id=branch_id).exists():
                continue
            if branch_id and source_model == "PurchaseBill" and not PurchaseBill.objects.filter(pk=row.get("source_pk"), branch_id=branch_id).exists():
                continue
            if branch_id and source_model == "VendorPayment" and not VendorPayment.objects.filter(pk=row.get("source_pk"), finance_account__branch_id=branch_id).exists():
                continue
            if branch_id and source_model == "StockLedger" and not StockLedger.objects.filter(pk=row.get("source_pk"), stock_location__branch_id=branch_id).exists():
                continue
            if branch_id and source_model == "Commission" and not Commission.objects.filter(pk=row.get("source_pk"), payment__branch_id=branch_id).exists():
                continue
            _create_missing_bridge_item(run=run, source_model=source_model, source_id=str(row["source_pk"]), source_label=row.get("source_reference_number") or f"{source_model}-{row['source_pk']}", amount=_money(row.get("amount")), exception_code=code, message=message, metadata={"source_pk": row["source_pk"], "event_key": row.get("event_key"), "source_date": row.get("source_date"), "taxable_amount": row.get("taxable_amount"), "tax_amount": row.get("tax_amount")}, totals=totals)


def _emit_stock_ledger_cogs_nonpostable(*, run, totals: dict, date_from, date_to, branch_id):
    for row in list_bridge_candidates(BridgeCandidateFilters(date_from=date_from, date_to=date_to, source_model="StockLedger")):
        event_key = row.get("event_key")
        if event_key not in {"deferred_cogs", "unsupported_stockledger"}:
            continue
        if branch_id and not StockLedger.objects.filter(pk=row.get("source_pk"), stock_location__branch_id=branch_id).exists():
            continue
        code = "DEFERRED_COGS" if event_key == "deferred_cogs" else "UNSUPPORTED_SOURCE"
        message = row.get("blocker_reason") or row.get("value_blocker_reason") or "StockLedger row is not postable by the controlled COGS bridge."
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE,
            source_type="StockLedger",
            source_id=str(row["source_pk"]),
            source_label=row.get("source_reference_number") or f"SL-{row['source_pk']}",
            severity=ReconciliationSeverity.MEDIUM,
            status=ReconciliationItemStatus.NEEDS_REVIEW,
            exception_code=code,
            exception_message=message,
            recommended_action="Keep this COGS row non-postable until finalized source and persisted cost evidence are available.",
            expected_amount=_money(row.get("amount")),
            actual_amount=Decimal("0.00"),
            amount_delta=_money(row.get("amount")),
            metadata={"source_pk": row["source_pk"], "event_key": event_key, "movement_type": row.get("movement_type"), "reference_model": row.get("reference_model"), "reference_id": row.get("reference_id"), "bridge_status": code, "cogs_state": row.get("cogs_state"), "value_blocker_reason": row.get("value_blocker_reason")},
        )
        ReconciliationEvidence.objects.create(item=item, evidence_type="StockLedger", object_id=str(row["source_pk"]), label=item.source_label, amount=_money(row.get("amount")), metadata={"movement_type": row.get("movement_type")})
        totals["exceptions"] += 1


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

    _emit_ready_unposted_candidates(run=run, totals=totals, date_from=date_from, date_to=date_to, branch_id=branch_id)
    _emit_stock_ledger_cogs_nonpostable(run=run, totals=totals, date_from=date_from, date_to=date_to, branch_id=branch_id)

    bridges = AccountingBridgePosting.objects.filter(source_model__in=BRIDGE_SOURCE_MODELS).select_related("journal_entry")
    if date_from or date_to:
        bridges = bridges.filter(_date_range_filter("source_event_date", date_from, date_to))
    if branch_id:
        payment_ids = [str(pk) for pk in Payment.objects.filter(branch_id=branch_id).values_list("id", flat=True)]
        receipt_ids = [str(pk) for pk in ReceiptDocument.objects.filter(branch_id=branch_id).values_list("id", flat=True)]
        invoice_ids = [str(pk) for pk in BillingInvoice.objects.filter(branch_id=branch_id).values_list("id", flat=True)]
        credit_ids = [str(pk) for pk in BillingCreditNote.objects.filter(original_invoice__branch_id=branch_id).values_list("id", flat=True)]
        debit_ids = [str(pk) for pk in BillingDebitNote.objects.filter(original_invoice__branch_id=branch_id).values_list("id", flat=True)]
        return_ids = [str(pk) for pk in DirectSaleReturn.objects.filter(direct_sale__branch_id=branch_id).values_list("id", flat=True)]
        purchase_ids = [str(pk) for pk in PurchaseBill.objects.filter(branch_id=branch_id).values_list("id", flat=True)]
        vendor_payment_ids = [str(pk) for pk in VendorPayment.objects.filter(finance_account__branch_id=branch_id).values_list("id", flat=True)]
        stock_ledger_ids = [str(pk) for pk in StockLedger.objects.filter(stock_location__branch_id=branch_id).values_list("id", flat=True)]
        commission_ids = [str(pk) for pk in Commission.objects.filter(payment__branch_id=branch_id).values_list("id", flat=True)]
        bridges = bridges.filter(Q(trace_metadata__branch_id=branch_id) | Q(source_model="Payment", source_id__in=payment_ids) | Q(source_model="ReceiptDocument", source_id__in=receipt_ids) | Q(source_model="BillingInvoice", source_id__in=invoice_ids) | Q(source_model="BillingCreditNote", source_id__in=credit_ids) | Q(source_model="BillingDebitNote", source_id__in=debit_ids) | Q(source_model="DirectSaleReturn", source_id__in=return_ids) | Q(source_model="PurchaseBill", source_id__in=purchase_ids) | Q(source_model="VendorPayment", source_id__in=vendor_payment_ids) | Q(source_model="StockLedger", source_id__in=stock_ledger_ids) | Q(source_model="Commission", source_id__in=commission_ids))
    totals["checked"] += bridges.count()

    for bridge in bridges:
        journal = bridge.journal_entry
        source_model = bridge.source_model
        source_id = str(bridge.source_id)
        source_label = _source_label(source_model=source_model, source_id=source_id, fallback=bridge.source_reference)
        source_amount = _source_amount(source_model=source_model, source_id=source_id)
        if not journal_id_matches_bridge(bridge, journal):
            item = ReconciliationItem.objects.create(run=run, module=MODULE, source_type="AccountingBridgePosting", source_id=str(bridge.id), source_label=str(bridge), severity=ReconciliationSeverity.CRITICAL, status=ReconciliationItemStatus.NEEDS_REVIEW, exception_code="BRIDGE_JOURNAL_MISSING_SOURCE_REFERENCE", exception_message="Bridge posting journal entry is missing or mismatching source_model/source_id.", recommended_action="Investigate bridge posting integrity; do not edit posted journals without explicit operational workflow.", metadata={"bridge_posting_id": bridge.id, "bridge_source_model": bridge.source_model, "bridge_source_id": bridge.source_id, "bridge_purpose": bridge.purpose, "journal_entry_id": getattr(journal, "id", None), "journal_source_model": getattr(journal, "source_model", None), "journal_source_id": getattr(journal, "source_id", None)})
            ReconciliationEvidence.objects.create(item=item, evidence_type="AccountingBridgePosting", object_id=str(bridge.id), label=str(bridge), metadata={"purpose": bridge.purpose})
            totals["exceptions"] += 1
            totals["high_risk"] += 1
            continue
        line_totals = journal.lines.aggregate(total_debit=Sum("debit_amount"), total_credit=Sum("credit_amount"))
        total_debit = _money(line_totals["total_debit"])
        total_credit = _money(line_totals["total_credit"])
        if total_debit != total_credit:
            ReconciliationItem.objects.create(run=run, module=MODULE, source_type=source_model, source_id=source_id, source_label=source_label, severity=ReconciliationSeverity.CRITICAL, status=ReconciliationItemStatus.AMOUNT_MISMATCH, exception_code="JOURNAL_UNBALANCED", exception_message="Posted bridge journal debit and credit totals do not balance.", recommended_action="Investigate journal lines; resolve only through explicit accounting workflows.", expected_amount=total_debit, actual_amount=total_credit, amount_delta=total_debit - total_credit, metadata={"journal_entry_id": journal.id, "bridge_posting_id": bridge.id})
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
        ReconciliationItem.objects.create(run=run, module=MODULE, source_type="JournalEntryGroup", source_id=str(group.id), source_label=group.journal_group_id, severity=ReconciliationSeverity.CRITICAL, status=ReconciliationItemStatus.AMOUNT_MISMATCH, exception_code="JOURNAL_GROUP_UNBALANCED", exception_message="Journal entry group is marked unbalanced.", recommended_action="Investigate journal group totals and underlying lines; resolve via existing accounting workflows.", metadata={"journal_group_id": group.journal_group_id, "total_debit": str(group.total_debit), "total_credit": str(group.total_credit), "source_module": group.source_module, "source_object_id": group.source_object_id})
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
    if journal is None:
        return False
    expected_model = (bridge.source_model or "").strip() or None
    expected_id = (bridge.source_id or "").strip() or None
    journal_model = (journal.source_model or "").strip() or None
    journal_id = (journal.source_id or "").strip() or None
    return bool(expected_model and expected_id and journal_model == expected_model and journal_id == expected_id)
