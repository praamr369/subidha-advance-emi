from __future__ import annotations

from django.db.models import Count, Q

from accounting.models import JournalEntry, JournalEntryStatus
from billing.models import PurchaseReturn, PurchaseReturnStatus
from inventory.models import (
    PurchaseBill,
    PurchaseBillStatus,
    VendorBill,
    VendorBillStatus,
    VendorPayment,
    VendorPaymentStatus,
)
from reconciliation.models import (
    ReconciliationEvidence,
    ReconciliationItem,
    ReconciliationItemStatus,
    ReconciliationSeverity,
)


MODULE_VENDOR = "vendor"
MODULE_PURCHASE = "purchase"
MODULE_PAYABLE = "payable"


def _date_range_filter(prefix: str, date_from, date_to) -> Q:
    q = Q()
    if date_from:
        q &= Q(**{f"{prefix}__gte": date_from})
    if date_to:
        q &= Q(**{f"{prefix}__lte": date_to})
    return q


def _journal_source_matches(*, journal: JournalEntry, expected_model: str, expected_id: str) -> bool:
    journal_model = (getattr(journal, "source_model", None) or "").strip() or None
    journal_id = (getattr(journal, "source_id", None) or "").strip() or None
    return bool(expected_model and expected_id and journal_model == expected_model and journal_id == expected_id)


def run_vendor_payable_checks(*, run, totals: dict) -> dict:
    """
    Phase J: Vendor payable / purchase accounting reconciliation (deterministic).

    Constraints:
    - Detection only (no mutation of source records).
    - Use explicit FK / OneToOne / source_model+source_id links only.
    - No inferred joins, no auto-correction.
    """

    date_from = run.date_from
    date_to = run.date_to
    branch_id = run.branch_id

    # ---------------------------------------------------------------------
    # PurchaseBill accounting evidence (explicit OneToOne posted_journal_entry)
    # ---------------------------------------------------------------------
    purchase_bills = PurchaseBill.objects.select_related("posted_journal_entry").all()
    if branch_id:
        purchase_bills = purchase_bills.filter(branch_id=branch_id)
    purchase_bills = purchase_bills.filter(_date_range_filter("bill_date", date_from, date_to))
    totals["checked"] += purchase_bills.count()

    missing_purchase_bill_journal = purchase_bills.filter(
        status=PurchaseBillStatus.POSTED,
        posted_journal_entry__isnull=True,
    )
    for bill in missing_purchase_bill_journal:
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_PURCHASE,
            source_type="PurchaseBill",
            source_id=str(bill.id),
            source_label=bill.bill_no or f"PB-{bill.id}",
            severity=ReconciliationSeverity.HIGH,
            status=ReconciliationItemStatus.MISSING_SOURCE,
            exception_code="PURCHASE_BILL_POSTED_JOURNAL_MISSING",
            exception_message="PurchaseBill is POSTED but posted_journal_entry_id is NULL.",
            recommended_action="Investigate purchase bill posting integrity; ensure posting is completed via the standard workflow (no auto-correction).",
            metadata={
                "purchase_bill_id": bill.id,
                "bill_no": bill.bill_no,
                "bill_date": str(bill.bill_date),
                "status": bill.status,
                "branch_id": bill.branch_id,
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="PurchaseBill",
            object_id=str(bill.id),
            label=bill.bill_no or f"PB-{bill.id}",
            amount=bill.grand_total,
            status=bill.status,
            metadata={},
        )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    for bill in purchase_bills.exclude(posted_journal_entry__isnull=True):
        journal = bill.posted_journal_entry
        if not _journal_source_matches(
            journal=journal, expected_model="PurchaseBill", expected_id=str(bill.id)
        ):
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_PURCHASE,
                source_type="PurchaseBill",
                source_id=str(bill.id),
                source_label=bill.bill_no or f"PB-{bill.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.NEEDS_REVIEW,
                exception_code="PURCHASE_BILL_JOURNAL_SOURCE_LINK_INVALID",
                exception_message="PurchaseBill posted_journal_entry is not source-linked to this PurchaseBill (source_model/source_id mismatch).",
                recommended_action="Investigate how the journal entry was linked; correct only through explicit accounting/inventory workflows (no auto-correction).",
                metadata={
                    "purchase_bill_id": bill.id,
                    "bill_no": bill.bill_no,
                    "purchase_bill_status": bill.status,
                    "journal_entry_id": journal.id,
                    "journal_source_model": journal.source_model,
                    "journal_source_id": journal.source_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="PurchaseBill",
                object_id=str(bill.id),
                label=bill.bill_no or f"PB-{bill.id}",
                amount=bill.grand_total,
                status=bill.status,
                metadata={},
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="JournalEntry",
                object_id=str(journal.id),
                label=journal.entry_no,
                status=journal.status,
                metadata={"voucher_type": journal.voucher_type},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

    purchase_bill_dupes = (
        JournalEntry.objects.filter(
            source_model="PurchaseBill",
            voucher_type="PURCHASE_BILL",
            status=JournalEntryStatus.POSTED,
        )
        .exclude(source_id__isnull=True)
        .values("source_id")
        .annotate(journal_count=Count("id"))
        .filter(journal_count__gt=1)
    )
    totals["checked"] += purchase_bill_dupes.count()
    for row in purchase_bill_dupes:
        source_id = str(row["source_id"])
        bill = PurchaseBill.objects.filter(pk=source_id).only("id", "bill_no", "status").first()
        label = (getattr(bill, "bill_no", None) or f"PB-{source_id}") if bill else f"PB-{source_id}"
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_PURCHASE,
            source_type="PurchaseBill",
            source_id=source_id,
            source_label=label,
            severity=ReconciliationSeverity.CRITICAL,
            status=ReconciliationItemStatus.DUPLICATE_POSTING,
            exception_code="PURCHASE_BILL_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            exception_message="Multiple posted journal entries reference the same PurchaseBill source_model/source_id.",
            recommended_action="Investigate potential duplicate posting; confirm audit trail and reversal/void behavior follows existing operational workflows (no auto-correction).",
            metadata={"journal_count": row["journal_count"]},
        )
        if bill:
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="PurchaseBill",
                object_id=str(bill.id),
                label=label,
                status=bill.status,
                metadata={},
            )
        for journal in JournalEntry.objects.filter(
            source_model="PurchaseBill",
            source_id=source_id,
            voucher_type="PURCHASE_BILL",
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

    # ---------------------------------------------------------------------
    # VendorBill accounting evidence (explicit OneToOne posted_journal_entry)
    # ---------------------------------------------------------------------
    vendor_bills = VendorBill.objects.select_related("posted_journal_entry", "finance_account").all()
    if branch_id:
        vendor_bills = vendor_bills.filter(finance_account__branch_id=branch_id)
    vendor_bills = vendor_bills.filter(_date_range_filter("bill_date", date_from, date_to))
    totals["checked"] += vendor_bills.count()

    missing_vendor_bill_journal = vendor_bills.filter(
        status=VendorBillStatus.POSTED,
        posted_journal_entry__isnull=True,
    )
    for bill in missing_vendor_bill_journal:
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_VENDOR,
            source_type="VendorBill",
            source_id=str(bill.id),
            source_label=bill.bill_no or f"VB-{bill.id}",
            severity=ReconciliationSeverity.HIGH,
            status=ReconciliationItemStatus.MISSING_SOURCE,
            exception_code="VENDOR_BILL_POSTED_JOURNAL_MISSING",
            exception_message="VendorBill is POSTED but posted_journal_entry_id is NULL.",
            recommended_action="Investigate vendor bill posting integrity; ensure posting is completed via the standard workflow (no auto-correction).",
            metadata={
                "vendor_bill_id": bill.id,
                "bill_no": bill.bill_no,
                "bill_date": str(bill.bill_date),
                "status": bill.status,
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="VendorBill",
            object_id=str(bill.id),
            label=bill.bill_no or f"VB-{bill.id}",
            amount=bill.grand_total,
            status=bill.status,
            metadata={},
        )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    for bill in vendor_bills.exclude(posted_journal_entry__isnull=True):
        journal = bill.posted_journal_entry
        if not _journal_source_matches(journal=journal, expected_model="VendorBill", expected_id=str(bill.id)):
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_VENDOR,
                source_type="VendorBill",
                source_id=str(bill.id),
                source_label=bill.bill_no or f"VB-{bill.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.NEEDS_REVIEW,
                exception_code="VENDOR_BILL_JOURNAL_SOURCE_LINK_INVALID",
                exception_message="VendorBill posted_journal_entry is not source-linked to this VendorBill (source_model/source_id mismatch).",
                recommended_action="Investigate how the journal entry was linked; correct only through explicit inventory/accounting workflows (no auto-correction).",
                metadata={
                    "vendor_bill_id": bill.id,
                    "bill_no": bill.bill_no,
                    "vendor_bill_status": bill.status,
                    "journal_entry_id": journal.id,
                    "journal_source_model": journal.source_model,
                    "journal_source_id": journal.source_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="VendorBill",
                object_id=str(bill.id),
                label=bill.bill_no or f"VB-{bill.id}",
                amount=bill.grand_total,
                status=bill.status,
                metadata={},
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="JournalEntry",
                object_id=str(journal.id),
                label=journal.entry_no,
                status=journal.status,
                metadata={"voucher_type": journal.voucher_type},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

    vendor_bill_dupes = (
        JournalEntry.objects.filter(
            source_model="VendorBill",
            voucher_type="VENDOR_BILL",
            status=JournalEntryStatus.POSTED,
        )
        .exclude(source_id__isnull=True)
        .values("source_id")
        .annotate(journal_count=Count("id"))
        .filter(journal_count__gt=1)
    )
    totals["checked"] += vendor_bill_dupes.count()
    for row in vendor_bill_dupes:
        source_id = str(row["source_id"])
        bill = VendorBill.objects.filter(pk=source_id).only("id", "bill_no", "status").first()
        label = (getattr(bill, "bill_no", None) or f"VB-{source_id}") if bill else f"VB-{source_id}"
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_VENDOR,
            source_type="VendorBill",
            source_id=source_id,
            source_label=label,
            severity=ReconciliationSeverity.CRITICAL,
            status=ReconciliationItemStatus.DUPLICATE_POSTING,
            exception_code="VENDOR_BILL_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            exception_message="Multiple posted journal entries reference the same VendorBill source_model/source_id.",
            recommended_action="Investigate potential duplicate posting; confirm audit trail and reversal/void behavior follows existing operational workflows (no auto-correction).",
            metadata={"journal_count": row["journal_count"]},
        )
        if bill:
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="VendorBill",
                object_id=str(bill.id),
                label=label,
                status=bill.status,
                metadata={},
            )
        for journal in JournalEntry.objects.filter(
            source_model="VendorBill",
            source_id=source_id,
            voucher_type="VENDOR_BILL",
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

    # ---------------------------------------------------------------------
    # VendorPayment accounting evidence (explicit OneToOne posted_journal_entry)
    # ---------------------------------------------------------------------
    vendor_payments = VendorPayment.objects.select_related("posted_journal_entry", "finance_account").all()
    if branch_id:
        vendor_payments = vendor_payments.filter(finance_account__branch_id=branch_id)
    vendor_payments = vendor_payments.filter(_date_range_filter("payment_date", date_from, date_to))
    totals["checked"] += vendor_payments.count()

    missing_vendor_payment_journal = vendor_payments.filter(
        status=VendorPaymentStatus.POSTED,
        posted_journal_entry__isnull=True,
    )
    for payment in missing_vendor_payment_journal:
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_PAYABLE,
            source_type="VendorPayment",
            source_id=str(payment.id),
            source_label=payment.payment_no or f"VPAY-{payment.id}",
            severity=ReconciliationSeverity.HIGH,
            status=ReconciliationItemStatus.MISSING_SOURCE,
            exception_code="VENDOR_PAYMENT_POSTED_JOURNAL_MISSING",
            exception_message="VendorPayment is POSTED but posted_journal_entry_id is NULL.",
            recommended_action="Investigate vendor payment posting integrity; ensure posting is completed via the standard workflow (no auto-correction).",
            metadata={
                "vendor_payment_id": payment.id,
                "payment_no": payment.payment_no,
                "payment_date": str(payment.payment_date),
                "status": payment.status,
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="VendorPayment",
            object_id=str(payment.id),
            label=payment.payment_no or f"VPAY-{payment.id}",
            amount=payment.amount,
            status=payment.status,
            metadata={},
        )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    for payment in vendor_payments.exclude(posted_journal_entry__isnull=True):
        journal = payment.posted_journal_entry
        if not _journal_source_matches(
            journal=journal, expected_model="VendorPayment", expected_id=str(payment.id)
        ):
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_PAYABLE,
                source_type="VendorPayment",
                source_id=str(payment.id),
                source_label=payment.payment_no or f"VPAY-{payment.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.NEEDS_REVIEW,
                exception_code="VENDOR_PAYMENT_JOURNAL_SOURCE_LINK_INVALID",
                exception_message="VendorPayment posted_journal_entry is not source-linked to this VendorPayment (source_model/source_id mismatch).",
                recommended_action="Investigate how the journal entry was linked; correct only through explicit inventory/accounting workflows (no auto-correction).",
                metadata={
                    "vendor_payment_id": payment.id,
                    "payment_no": payment.payment_no,
                    "vendor_payment_status": payment.status,
                    "journal_entry_id": journal.id,
                    "journal_source_model": journal.source_model,
                    "journal_source_id": journal.source_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="VendorPayment",
                object_id=str(payment.id),
                label=payment.payment_no or f"VPAY-{payment.id}",
                amount=payment.amount,
                status=payment.status,
                metadata={},
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="JournalEntry",
                object_id=str(journal.id),
                label=journal.entry_no,
                status=journal.status,
                metadata={"voucher_type": journal.voucher_type},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

    vendor_payment_dupes = (
        JournalEntry.objects.filter(
            source_model="VendorPayment",
            voucher_type="VENDOR_PAYMENT",
            status=JournalEntryStatus.POSTED,
        )
        .exclude(source_id__isnull=True)
        .values("source_id")
        .annotate(journal_count=Count("id"))
        .filter(journal_count__gt=1)
    )
    totals["checked"] += vendor_payment_dupes.count()
    for row in vendor_payment_dupes:
        source_id = str(row["source_id"])
        payment = VendorPayment.objects.filter(pk=source_id).only("id", "payment_no", "status").first()
        label = (getattr(payment, "payment_no", None) or f"VPAY-{source_id}") if payment else f"VPAY-{source_id}"
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_PAYABLE,
            source_type="VendorPayment",
            source_id=source_id,
            source_label=label,
            severity=ReconciliationSeverity.CRITICAL,
            status=ReconciliationItemStatus.DUPLICATE_POSTING,
            exception_code="VENDOR_PAYMENT_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            exception_message="Multiple posted journal entries reference the same VendorPayment source_model/source_id.",
            recommended_action="Investigate potential duplicate posting; confirm audit trail and reversal/void behavior follows existing operational workflows (no auto-correction).",
            metadata={"journal_count": row["journal_count"]},
        )
        if payment:
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="VendorPayment",
                object_id=str(payment.id),
                label=label,
                status=payment.status,
                metadata={},
            )
        for journal in JournalEntry.objects.filter(
            source_model="VendorPayment",
            source_id=source_id,
            voucher_type="VENDOR_PAYMENT",
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

    # ---------------------------------------------------------------------
    # PurchaseReturn accounting evidence (explicit OneToOne posted_journal_entry)
    # ---------------------------------------------------------------------
    purchase_returns = PurchaseReturn.objects.select_related("posted_journal_entry", "purchase_bill").all()
    if branch_id:
        purchase_returns = purchase_returns.filter(purchase_bill__branch_id=branch_id)
    purchase_returns = purchase_returns.filter(_date_range_filter("return_date", date_from, date_to))
    totals["checked"] += purchase_returns.count()

    missing_purchase_return_journal = purchase_returns.filter(
        status=PurchaseReturnStatus.POSTED,
        posted_journal_entry__isnull=True,
    )
    for ret in missing_purchase_return_journal:
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_PURCHASE,
            source_type="PurchaseReturn",
            source_id=str(ret.id),
            source_label=ret.return_no or f"PR-{ret.id}",
            severity=ReconciliationSeverity.HIGH,
            status=ReconciliationItemStatus.MISSING_SOURCE,
            exception_code="PURCHASE_RETURN_POSTED_JOURNAL_MISSING",
            exception_message="PurchaseReturn is POSTED but posted_journal_entry_id is NULL.",
            recommended_action="Investigate purchase return posting integrity; ensure posting is completed via the standard workflow (no auto-correction).",
            metadata={
                "purchase_return_id": ret.id,
                "return_no": ret.return_no,
                "return_date": str(ret.return_date),
                "status": ret.status,
                "purchase_bill_id": ret.purchase_bill_id,
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="PurchaseReturn",
            object_id=str(ret.id),
            label=ret.return_no or f"PR-{ret.id}",
            amount=ret.grand_total,
            status=ret.status,
            metadata={},
        )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    for ret in purchase_returns.exclude(posted_journal_entry__isnull=True):
        journal = ret.posted_journal_entry
        if not _journal_source_matches(journal=journal, expected_model="PurchaseReturn", expected_id=str(ret.id)):
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE_PURCHASE,
                source_type="PurchaseReturn",
                source_id=str(ret.id),
                source_label=ret.return_no or f"PR-{ret.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.NEEDS_REVIEW,
                exception_code="PURCHASE_RETURN_JOURNAL_SOURCE_LINK_INVALID",
                exception_message="PurchaseReturn posted_journal_entry is not source-linked to this PurchaseReturn (source_model/source_id mismatch).",
                recommended_action="Investigate how the journal entry was linked; correct only through explicit billing/accounting workflows (no auto-correction).",
                metadata={
                    "purchase_return_id": ret.id,
                    "return_no": ret.return_no,
                    "purchase_return_status": ret.status,
                    "journal_entry_id": journal.id,
                    "journal_source_model": journal.source_model,
                    "journal_source_id": journal.source_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="PurchaseReturn",
                object_id=str(ret.id),
                label=ret.return_no or f"PR-{ret.id}",
                amount=ret.grand_total,
                status=ret.status,
                metadata={},
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="JournalEntry",
                object_id=str(journal.id),
                label=journal.entry_no,
                status=journal.status,
                metadata={"voucher_type": journal.voucher_type},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

    purchase_return_dupes = (
        JournalEntry.objects.filter(
            source_model="PurchaseReturn",
            voucher_type="PURCHASE_RETURN",
            status=JournalEntryStatus.POSTED,
        )
        .exclude(source_id__isnull=True)
        .values("source_id")
        .annotate(journal_count=Count("id"))
        .filter(journal_count__gt=1)
    )
    totals["checked"] += purchase_return_dupes.count()
    for row in purchase_return_dupes:
        source_id = str(row["source_id"])
        ret = PurchaseReturn.objects.filter(pk=source_id).only("id", "return_no", "status").first()
        label = (getattr(ret, "return_no", None) or f"PR-{source_id}") if ret else f"PR-{source_id}"
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE_PURCHASE,
            source_type="PurchaseReturn",
            source_id=source_id,
            source_label=label,
            severity=ReconciliationSeverity.CRITICAL,
            status=ReconciliationItemStatus.DUPLICATE_POSTING,
            exception_code="PURCHASE_RETURN_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            exception_message="Multiple posted journal entries reference the same PurchaseReturn source_model/source_id.",
            recommended_action="Investigate potential duplicate posting; confirm audit trail and reversal/void behavior follows existing operational workflows (no auto-correction).",
            metadata={"journal_count": row["journal_count"]},
        )
        if ret:
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="PurchaseReturn",
                object_id=str(ret.id),
                label=label,
                status=ret.status,
                metadata={},
            )
        for journal in JournalEntry.objects.filter(
            source_model="PurchaseReturn",
            source_id=source_id,
            voucher_type="PURCHASE_RETURN",
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

