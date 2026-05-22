from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.db import models
from django.db.models import Count, Exists, OuterRef, Q, Sum
from django.db.models.functions import Cast

from accounting.models import (
    AccountingBridgePosting,
    JournalEntry,
    JournalEntryGroup,
    JournalEntryLine,
    JournalEntryStatus,
    MoneyMovement,
    MoneyMovementStatus,
)
from billing.models import ReceiptDocument
from reconciliation.models import (
    ReconciliationEvidence,
    ReconciliationItem,
    ReconciliationItemStatus,
    ReconciliationSeverity,
)
from subscriptions.models import Payment


MODULE = "CASH_BANK_UPI_SETTLEMENT_PHASE"


def _date_range_filter(prefix: str, date_from, date_to):
    q = Q()
    if date_from:
        q &= Q(**{f"{prefix}__gte": date_from})
    if date_to:
        q &= Q(**{f"{prefix}__lte": date_to})
    return q


@dataclass(frozen=True)
class _JournalAmount:
    total_debit: Decimal
    total_credit: Decimal

    @property
    def is_balanced(self) -> bool:
        return self.total_debit == self.total_credit

    @property
    def amount(self) -> Decimal:
        # Only safe to interpret when balanced.
        return self.total_debit


def _journal_amounts_by_id(*, journal_ids: list[int]) -> dict[int, _JournalAmount]:
    if not journal_ids:
        return {}
    rows = (
        JournalEntryLine.objects.filter(journal_entry_id__in=journal_ids)
        .values("journal_entry_id")
        .annotate(
            total_debit=Sum("debit_amount"),
            total_credit=Sum("credit_amount"),
        )
    )
    amounts: dict[int, _JournalAmount] = {}
    for row in rows:
        journal_entry_id = int(row["journal_entry_id"])
        total_debit = row["total_debit"] or Decimal("0.00")
        total_credit = row["total_credit"] or Decimal("0.00")
        amounts[journal_entry_id] = _JournalAmount(total_debit=total_debit, total_credit=total_credit)
    return amounts


def _journal_source_matches(*, journal: JournalEntry, expected_model: str, expected_id: str) -> bool:
    journal_model = (journal.source_model or "").strip() or None
    journal_id = (journal.source_id or "").strip() or None
    return bool(expected_model and expected_id and journal_model == expected_model and journal_id == expected_id)


def run_cash_bank_upi_settlement_checks(*, run, totals: dict) -> dict:
    """
    Cash / Bank / UPI settlement reconciliation (deterministic only).

    Strict constraints:
    - detection only; no auto-correction
    - no mutation of source records
    - no inferred settlement batches or bank statement matching
    """
    date_from = run.date_from
    date_to = run.date_to
    branch_id = run.branch_id

    payments = Payment.objects.all()
    if branch_id:
        payments = payments.filter(branch_id=branch_id)
    payments = payments.filter(_date_range_filter("payment_date", date_from, date_to))

    # 1) Payment missing bridge posting (PAYMENT_COLLECTION)
    bridge_exists = AccountingBridgePosting.objects.filter(
        source_model="Payment",
        source_id=Cast(OuterRef("pk"), output_field=models.CharField()),
        purpose="PAYMENT_COLLECTION",
    )

    for payment in payments.annotate(has_bridge=Exists(bridge_exists)).filter(has_bridge=False):
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE,
            source_type="Payment",
            source_id=str(payment.id),
            source_label=payment.reference_no or f"PAY-{payment.id}",
            severity=ReconciliationSeverity.HIGH,
            status=ReconciliationItemStatus.MISSING_SOURCE,
            exception_code="PAYMENT_SETTLEMENT_BRIDGE_MISSING",
            exception_message="Payment exists but AccountingBridgePosting is missing for purpose PAYMENT_COLLECTION.",
            recommended_action="Review payment posting workflow; post via existing accounting bridge workflow if required (no auto-correction).",
            metadata={
                "payment_id": payment.id,
                "payment_date": str(payment.payment_date),
                "bridge_expected": {"source_model": "Payment", "purpose": "PAYMENT_COLLECTION"},
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="Payment",
            object_id=str(payment.id),
            label=payment.reference_no or f"PAY-{payment.id}",
            amount=payment.amount,
            metadata={"method": payment.method, "finance_account_id": payment.finance_account_id},
        )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    # Bridges in scope for subsequent checks.
    bridges = AccountingBridgePosting.objects.filter(
        source_model="Payment",
        purpose="PAYMENT_COLLECTION",
    ).select_related("journal_entry")
    if date_from or date_to:
        bridges = bridges.filter(_date_range_filter("source_event_date", date_from, date_to))
    if branch_id:
        payment_ids_as_char = payments.annotate(pid=Cast("id", output_field=models.CharField())).values("pid")
        bridges = bridges.filter(source_id__in=payment_ids_as_char)

    totals["checked"] += bridges.count()

    # Pre-compute journal amounts for amount-mismatch checks.
    bridge_journal_ids = [bridge.journal_entry_id for bridge in bridges if bridge.journal_entry_id]
    journal_amounts = _journal_amounts_by_id(journal_ids=bridge_journal_ids)

    for bridge in bridges:
        expected_model = "Payment"
        expected_id = (bridge.source_id or "").strip()
        payment_label = bridge.source_reference or f"PAY-{expected_id}"

        journal = bridge.journal_entry

        # 2) Payment bridge journal source-link mismatch
        if not _journal_source_matches(journal=journal, expected_model=expected_model, expected_id=expected_id):
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="Payment",
                source_id=expected_id,
                source_label=payment_label,
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.NEEDS_REVIEW,
                exception_code="PAYMENT_SETTLEMENT_JOURNAL_SOURCE_LINK_INVALID",
                exception_message="Accounting bridge journal entry source_model/source_id does not match the expected Payment source reference.",
                recommended_action="Investigate bridge posting integrity; do not edit posted journals without explicit operational workflow.",
                metadata={
                    "bridge_posting_id": bridge.id,
                    "bridge_source_model": bridge.source_model,
                    "bridge_source_id": bridge.source_id,
                    "bridge_purpose": bridge.purpose,
                    "journal_entry_id": journal.id,
                    "journal_source_model": journal.source_model,
                    "journal_source_id": journal.source_id,
                    "journal_status": journal.status,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="AccountingBridgePosting",
                object_id=str(bridge.id),
                label=str(bridge),
                metadata={"purpose": bridge.purpose},
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

        # 4) Payment bridge journal amount mismatch vs Payment.amount (deterministic only)
        if journal.status == JournalEntryStatus.POSTED:
            payment = Payment.objects.filter(pk=expected_id).only("id", "amount", "reference_no").first()
            if payment is not None:
                amount_info = journal_amounts.get(journal.id)
                if amount_info is None:
                    # No lines -> cannot determine safely.
                    continue
                if not amount_info.is_balanced:
                    # Unbalanced journals are handled by other checks; do not emit amount mismatch to avoid duplicate noise.
                    continue
                journal_amount = amount_info.amount
                if journal_amount != payment.amount:
                    item = ReconciliationItem.objects.create(
                        run=run,
                        module=MODULE,
                        source_type="Payment",
                        source_id=str(payment.id),
                        source_label=payment.reference_no or f"PAY-{payment.id}",
                        severity=ReconciliationSeverity.HIGH,
                        status=ReconciliationItemStatus.AMOUNT_MISMATCH,
                        exception_code="PAYMENT_SETTLEMENT_JOURNAL_AMOUNT_MISMATCH",
                        exception_message="Posted journal totals do not match Payment.amount for PAYMENT_COLLECTION bridge posting.",
                        recommended_action="Investigate bridge journal lines and payment amount; resolve via existing accounting workflows (no auto-correction).",
                        expected_amount=payment.amount,
                        actual_amount=journal_amount,
                        amount_delta=(journal_amount - payment.amount),
                        metadata={
                            "bridge_posting_id": bridge.id,
                            "journal_entry_id": journal.id,
                            "journal_total_debit": str(amount_info.total_debit),
                            "journal_total_credit": str(amount_info.total_credit),
                        },
                    )
                    ReconciliationEvidence.objects.create(
                        item=item,
                        evidence_type="AccountingBridgePosting",
                        object_id=str(bridge.id),
                        label=str(bridge),
                        metadata={"purpose": bridge.purpose},
                    )
                    ReconciliationEvidence.objects.create(
                        item=item,
                        evidence_type="JournalEntry",
                        object_id=str(journal.id),
                        label=journal.entry_no,
                        status=journal.status,
                        amount=journal_amount,
                        metadata={},
                    )
                    ReconciliationEvidence.objects.create(
                        item=item,
                        evidence_type="Payment",
                        object_id=str(payment.id),
                        label=payment.reference_no or f"PAY-{payment.id}",
                        amount=payment.amount,
                        metadata={},
                    )
                    totals["exceptions"] += 1
                    totals["high_risk"] += 1

    # 3) Duplicate posted journal source reference for Payment (voucher_type deterministic)
    dupes = (
        JournalEntry.objects.filter(
            status=JournalEntryStatus.POSTED,
            source_model="Payment",
            voucher_type="PAYMENT_COLLECTION",
        )
        .exclude(source_id__isnull=True)
        .values("source_id")
        .annotate(journal_count=Count("id"))
        .filter(journal_count__gt=1)
    )
    if date_from or date_to:
        dupes = dupes.filter(_date_range_filter("entry_date", date_from, date_to))
    totals["checked"] += dupes.count()
    for row in dupes:
        payment_source_id = str(row["source_id"])
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE,
            source_type="Payment",
            source_id=payment_source_id,
            source_label=f"PAY-{payment_source_id}",
            severity=ReconciliationSeverity.CRITICAL,
            status=ReconciliationItemStatus.DUPLICATE_POSTING,
            exception_code="PAYMENT_SETTLEMENT_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            exception_message="Multiple POSTED journal entries reference the same Payment source_model/source_id/voucher_type.",
            recommended_action="Investigate duplicate posting vs reversals/voids; preserve audit trail (no auto-correction).",
            metadata={"journal_count": row["journal_count"], "voucher_type": "PAYMENT_COLLECTION"},
        )
        for journal in JournalEntry.objects.filter(
            status=JournalEntryStatus.POSTED,
            source_model="Payment",
            source_id=payment_source_id,
            voucher_type="PAYMENT_COLLECTION",
        ).only("id", "entry_no", "status", "entry_date")[:10]:
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="JournalEntry",
                object_id=str(journal.id),
                label=journal.entry_no,
                status=journal.status,
                metadata={"entry_date": str(journal.entry_date)},
            )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    # 5) ReceiptDocument bridge journal amount mismatch (deterministic only)
    receipts = ReceiptDocument.objects.exclude(posted_journal_entry_id__isnull=True).select_related("posted_journal_entry")
    if branch_id:
        receipts = receipts.filter(branch_id=branch_id)
    receipts = receipts.filter(_date_range_filter("receipt_date", date_from, date_to))
    totals["checked"] += receipts.count()

    receipt_journal_ids = [receipt.posted_journal_entry_id for receipt in receipts if receipt.posted_journal_entry_id]
    receipt_journal_amounts = _journal_amounts_by_id(journal_ids=receipt_journal_ids)

    for receipt in receipts:
        journal = receipt.posted_journal_entry
        if journal is None or journal.status != JournalEntryStatus.POSTED:
            continue
        amount_info = receipt_journal_amounts.get(journal.id)
        if amount_info is None or not amount_info.is_balanced:
            continue
        journal_amount = amount_info.amount
        if journal_amount != receipt.amount:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="ReceiptDocument",
                source_id=str(receipt.id),
                source_label=receipt.receipt_no or f"RCT-{receipt.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.AMOUNT_MISMATCH,
                exception_code="RECEIPT_SETTLEMENT_JOURNAL_AMOUNT_MISMATCH",
                exception_message="Posted journal totals do not match ReceiptDocument.amount.",
                recommended_action="Investigate receipt journal lines and receipt amount; resolve via existing billing/accounting workflows (no auto-correction).",
                expected_amount=receipt.amount,
                actual_amount=journal_amount,
                amount_delta=(journal_amount - receipt.amount),
                metadata={
                    "receipt_id": receipt.id,
                    "posted_journal_entry_id": journal.id,
                    "journal_total_debit": str(amount_info.total_debit),
                    "journal_total_credit": str(amount_info.total_credit),
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="ReceiptDocument",
                object_id=str(receipt.id),
                label=receipt.receipt_no or f"RCT-{receipt.id}",
                amount=receipt.amount,
                metadata={"receipt_type": receipt.receipt_type, "status": receipt.status},
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="JournalEntry",
                object_id=str(journal.id),
                label=journal.entry_no,
                status=journal.status,
                amount=journal_amount,
                metadata={},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

    # MoneyMovement checks
    movements = MoneyMovement.objects.all()
    if date_from or date_to:
        movements = movements.filter(_date_range_filter("movement_date", date_from, date_to))
    if branch_id:
        movements = movements.filter(
            Q(from_finance_account__branch_id=branch_id) | Q(to_finance_account__branch_id=branch_id)
        )
    movements = movements.select_related("posted_journal_entry", "posted_journal_entry__journal_group")

    # 6) MoneyMovement status POSTED but posted_journal_entry_id missing
    for movement in movements.filter(status=MoneyMovementStatus.POSTED, posted_journal_entry_id__isnull=True):
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE,
            source_type="MoneyMovement",
            source_id=str(movement.id),
            source_label=movement.movement_no,
            severity=ReconciliationSeverity.HIGH,
            status=ReconciliationItemStatus.MISSING_SOURCE,
            exception_code="MONEY_MOVEMENT_POSTED_JOURNAL_MISSING",
            exception_message="MoneyMovement is POSTED but posted_journal_entry_id is missing.",
            recommended_action="Investigate money movement posting workflow; avoid mutating posted records directly.",
            metadata={"movement_no": movement.movement_no, "movement_date": str(movement.movement_date)},
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="MoneyMovement",
            object_id=str(movement.id),
            label=movement.movement_no,
            amount=movement.amount,
            metadata={"from_finance_account_id": movement.from_finance_account_id, "to_finance_account_id": movement.to_finance_account_id},
        )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    posted_movements = movements.filter(status=MoneyMovementStatus.POSTED, posted_journal_entry_id__isnull=False)
    totals["checked"] += posted_movements.count()
    movement_journal_ids = [m.posted_journal_entry_id for m in posted_movements if m.posted_journal_entry_id]
    movement_journal_amounts = _journal_amounts_by_id(journal_ids=movement_journal_ids)

    for movement in posted_movements:
        journal = movement.posted_journal_entry
        if journal is None:
            continue

        expected_model = "MoneyMovement"
        expected_id = str(movement.id)

        # 7) MoneyMovement journal source-link mismatch
        if not _journal_source_matches(journal=journal, expected_model=expected_model, expected_id=expected_id):
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="MoneyMovement",
                source_id=str(movement.id),
                source_label=movement.movement_no,
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.NEEDS_REVIEW,
                exception_code="MONEY_MOVEMENT_JOURNAL_SOURCE_LINK_INVALID",
                exception_message="MoneyMovement posted_journal_entry source_model/source_id does not match the MoneyMovement.",
                recommended_action="Investigate money movement posting integrity; avoid editing posted journals without explicit workflow.",
                metadata={
                    "money_movement_id": movement.id,
                    "posted_journal_entry_id": journal.id,
                    "journal_source_model": journal.source_model,
                    "journal_source_id": journal.source_id,
                    "journal_status": journal.status,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="MoneyMovement",
                object_id=str(movement.id),
                label=movement.movement_no,
                amount=movement.amount,
                metadata={},
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="JournalEntry",
                object_id=str(journal.id),
                label=journal.entry_no,
                status=journal.status,
                metadata={},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

        # 8) MoneyMovement journal amount mismatch (deterministic only)
        if journal.status == JournalEntryStatus.POSTED:
            amount_info = movement_journal_amounts.get(journal.id)
            if amount_info is None or not amount_info.is_balanced:
                continue
            journal_amount = amount_info.amount
            if journal_amount != movement.amount:
                item = ReconciliationItem.objects.create(
                    run=run,
                    module=MODULE,
                    source_type="MoneyMovement",
                    source_id=str(movement.id),
                    source_label=movement.movement_no,
                    severity=ReconciliationSeverity.HIGH,
                    status=ReconciliationItemStatus.AMOUNT_MISMATCH,
                    exception_code="MONEY_MOVEMENT_JOURNAL_AMOUNT_MISMATCH",
                    exception_message="Posted journal totals do not match MoneyMovement.amount.",
                    recommended_action="Investigate money movement journal lines vs movement amount; resolve via existing accounting workflows (no auto-correction).",
                    expected_amount=movement.amount,
                    actual_amount=journal_amount,
                    amount_delta=(journal_amount - movement.amount),
                    metadata={
                        "posted_journal_entry_id": journal.id,
                        "journal_total_debit": str(amount_info.total_debit),
                        "journal_total_credit": str(amount_info.total_credit),
                    },
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="MoneyMovement",
                    object_id=str(movement.id),
                    label=movement.movement_no,
                    amount=movement.amount,
                    metadata={},
                )
                ReconciliationEvidence.objects.create(
                    item=item,
                    evidence_type="JournalEntry",
                    object_id=str(journal.id),
                    label=journal.entry_no,
                    status=journal.status,
                    amount=journal_amount,
                    metadata={},
                )
                totals["exceptions"] += 1
                totals["high_risk"] += 1

        # Note: journal group unbalanced is checked in a dedicated pass below (journal-driven),
        # because MoneyMovement journals may be linked to groups via explicit JournalEntry.journal_group.

    # 9) MoneyMovement unbalanced journal group (explicit JournalEntry.journal_group linkage only; no inference)
    unbalanced_movement_journals = JournalEntry.objects.filter(
        status=JournalEntryStatus.POSTED,
        source_model="MoneyMovement",
        journal_group__is_balanced=False,
    ).select_related("journal_group")
    if date_from or date_to:
        unbalanced_movement_journals = unbalanced_movement_journals.filter(
            _date_range_filter("entry_date", date_from, date_to)
        )
    totals["checked"] += unbalanced_movement_journals.count()
    for journal in unbalanced_movement_journals:
        movement_id = (journal.source_id or "").strip()
        if not movement_id:
            continue
        group = journal.journal_group
        if group is None or group.is_balanced:
            continue
        movement = MoneyMovement.objects.filter(pk=movement_id).only("id", "movement_no", "amount").first()
        movement_label = getattr(movement, "movement_no", None) or f"MOV-{movement_id}"
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE,
            source_type="MoneyMovement",
            source_id=movement_id,
            source_label=movement_label,
            severity=ReconciliationSeverity.CRITICAL,
            status=ReconciliationItemStatus.AMOUNT_MISMATCH,
            exception_code="MONEY_MOVEMENT_JOURNAL_GROUP_UNBALANCED",
            exception_message="MoneyMovement-linked journal entry group is marked unbalanced.",
            recommended_action="Investigate journal group totals and underlying lines; resolve via existing accounting workflows.",
            metadata={
                "money_movement_id": movement_id,
                "posted_journal_entry_id": journal.id,
                "journal_group_id": group.journal_group_id,
                "total_debit": str(group.total_debit),
                "total_credit": str(group.total_credit),
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="JournalEntry",
            object_id=str(journal.id),
            label=journal.entry_no,
            status=journal.status,
            metadata={"entry_date": str(journal.entry_date)},
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="JournalEntryGroup",
            object_id=str(group.id),
            label=group.journal_group_id,
            metadata={},
        )
        if movement is not None:
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="MoneyMovement",
                object_id=str(movement.id),
                label=movement.movement_no,
                amount=movement.amount,
                metadata={},
            )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    return totals
