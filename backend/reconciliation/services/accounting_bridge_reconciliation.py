from __future__ import annotations

from django.db import models
from django.db.models import Count, Exists, OuterRef, Q
from django.db.models.functions import Cast

from accounting.models import AccountingBridgePosting, JournalEntry, JournalEntryGroup
from subscriptions.models import Payment

from reconciliation.models import (
    ReconciliationEvidence,
    ReconciliationItem,
    ReconciliationItemStatus,
    ReconciliationSeverity,
)


MODULE = "ACCOUNTING_BRIDGE_PHASE_F"


def _date_range_filter(prefix: str, date_from, date_to):
    q = Q()
    if date_from:
        q &= Q(**{f"{prefix}__gte": date_from})
    if date_to:
        q &= Q(**{f"{prefix}__lte": date_to})
    return q


def run_accounting_bridge_checks(*, run, totals: dict) -> dict:
    date_from = run.date_from
    date_to = run.date_to
    branch_id = run.branch_id

    payments = Payment.objects.all()
    if branch_id:
        payments = payments.filter(branch_id=branch_id)
    payments = payments.filter(_date_range_filter("payment_date", date_from, date_to))

    # 5) Payment exists but accounting bridge posting missing
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
            exception_code="PAYMENT_MISSING_ACCOUNTING_BRIDGE_POSTING",
            exception_message="Payment exists but AccountingBridgePosting is missing for purpose PAYMENT_COLLECTION.",
            recommended_action="Review accounting posting workflow; post via existing bridge runner if required (no auto-correction).",
            metadata={
                "payment_id": payment.id,
                "payment_date": str(payment.payment_date),
            },
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

    # 8) Bridge-created journal missing source reference (source_model/source_id expected)
    bridges = AccountingBridgePosting.objects.filter(
        source_model="Payment",
        purpose="PAYMENT_COLLECTION",
    ).select_related("journal_entry")
    if date_from or date_to:
        bridges = bridges.filter(_date_range_filter("source_event_date", date_from, date_to))
    totals["checked"] += bridges.count()

    for bridge in bridges:
        journal = bridge.journal_entry
        if not journal_id_matches_bridge(bridge, journal):
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="AccountingBridgePosting",
                source_id=str(bridge.id),
                source_label=str(bridge),
                severity=ReconciliationSeverity.CRITICAL,
                status=ReconciliationItemStatus.NEEDS_REVIEW,
                exception_code="BRIDGE_JOURNAL_MISSING_SOURCE_REFERENCE",
                exception_message="Bridge posting journal entry is missing or mismatching source_model/source_id.",
                recommended_action="Investigate bridge posting integrity; do not edit posted journals without explicit operational workflow.",
                metadata={
                    "bridge_posting_id": bridge.id,
                    "bridge_source_model": bridge.source_model,
                    "bridge_source_id": bridge.source_id,
                    "bridge_purpose": bridge.purpose,
                    "journal_entry_id": journal.id,
                    "journal_source_model": journal.source_model,
                    "journal_source_id": journal.source_id,
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
                metadata={},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

    # 7) Journal entry group unbalanced
    groups = JournalEntryGroup.objects.filter(is_balanced=False)
    if date_from or date_to:
        groups = groups.filter(_date_range_filter("transaction_date", date_from, date_to))
    totals["checked"] += groups.count()
    for group in groups:
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE,
            source_type="JournalEntryGroup",
            source_id=str(group.id),
            source_label=group.journal_group_id,
            severity=ReconciliationSeverity.CRITICAL,
            status=ReconciliationItemStatus.AMOUNT_MISMATCH,
            exception_code="JOURNAL_GROUP_UNBALANCED",
            exception_message="Journal entry group is marked unbalanced.",
            recommended_action="Investigate journal group totals and underlying lines; resolve via existing accounting workflows.",
            metadata={
                "journal_group_id": group.journal_group_id,
                "total_debit": str(group.total_debit),
                "total_credit": str(group.total_credit),
                "source_module": group.source_module,
                "source_object_id": group.source_object_id,
            },
        )
        ReconciliationEvidence.objects.create(
            item=item,
            evidence_type="JournalEntryGroup",
            object_id=str(group.id),
            label=group.journal_group_id,
            metadata={},
        )
        totals["exceptions"] += 1
        totals["high_risk"] += 1

    # 6) Duplicate accounting posting detection via journal source reference (best-effort, deterministic: count > 1)
    # This does not assume purposes; it flags multiple journal entries referencing the same payment source.
    journal_dupes = (
        JournalEntry.objects.filter(
            source_model="Payment",
            voucher_type="PAYMENT_COLLECTION",
            status="POSTED",
        )
        .exclude(source_id__isnull=True)
        .values("source_id")
        .annotate(journal_count=Count("id"))
        .filter(journal_count__gt=1)
    )
    totals["checked"] += journal_dupes.count()
    for row in journal_dupes:
        source_id = str(row["source_id"])
        item = ReconciliationItem.objects.create(
            run=run,
            module=MODULE,
            source_type="Payment",
            source_id=source_id,
            source_label=f"PAY-{source_id}",
            severity=ReconciliationSeverity.HIGH,
            status=ReconciliationItemStatus.DUPLICATE_POSTING,
            exception_code="DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            exception_message="Multiple journal entries reference the same Payment source_model/source_id.",
            recommended_action="Investigate potential duplicate posting; confirm one is reversal/void and audit trail is intact.",
            metadata={"journal_count": row["journal_count"]},
        )
        for journal in JournalEntry.objects.filter(
            source_model="Payment",
            source_id=source_id,
            voucher_type="PAYMENT_COLLECTION",
            status="POSTED",
        ).only(
            "id", "entry_no", "status", "entry_date"
        )[:10]:
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="JournalEntry",
                object_id=str(journal.id),
                label=journal.entry_no,
                status=journal.status,
                metadata={"entry_date": str(journal.entry_date)},
            )
        totals["exceptions"] += 1

    return totals


def journal_id_matches_bridge(bridge: AccountingBridgePosting, journal: JournalEntry) -> bool:
    expected_model = (bridge.source_model or "").strip() or None
    expected_id = (bridge.source_id or "").strip() or None
    journal_model = (journal.source_model or "").strip() or None
    journal_id = (journal.source_id or "").strip() or None
    return bool(expected_model and expected_id and journal_model == expected_model and journal_id == expected_id)
