from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.apps import apps
from django.db.models import Count, Q, Sum

from accounting.models import JournalEntryGroup
from subscriptions.models import FinancialLedger, Payment


def validate_journal_group_balance(group: JournalEntryGroup) -> dict:
    journal_entries = group.journal_entries.prefetch_related("lines").all()
    debit_total = Decimal("0.00")
    credit_total = Decimal("0.00")
    for journal in journal_entries:
        agg = journal.lines.aggregate(
            debit=Sum("debit_amount"),
            credit=Sum("credit_amount"),
        )
        debit_total += Decimal(str(agg["debit"] or "0.00"))
        credit_total += Decimal(str(agg["credit"] or "0.00"))
    balanced = debit_total == credit_total and group.total_debit == group.total_credit
    return {
        "group_id": group.id,
        "journal_group_id": group.journal_group_id,
        "is_balanced": balanced,
        "computed_total_debit": f"{debit_total:.2f}",
        "computed_total_credit": f"{credit_total:.2f}",
        "stored_total_debit": f"{group.total_debit:.2f}",
        "stored_total_credit": f"{group.total_credit:.2f}",
    }


def validate_financial_period_balance(*, date_from: date | None = None, date_to: date | None = None) -> dict:
    groups = JournalEntryGroup.objects.all()
    if date_from:
        groups = groups.filter(transaction_date__gte=date_from)
    if date_to:
        groups = groups.filter(transaction_date__lte=date_to)

    unbalanced_groups = []
    for group in groups:
        row = validate_journal_group_balance(group)
        if not row["is_balanced"]:
            unbalanced_groups.append(row)

    orphan_ledger = FinancialLedger.objects.filter(journal_group__isnull=True).count()
    payment_without_ledger = Payment.objects.annotate(ledger_count=Count("ledger_entry")).filter(ledger_count=0).count()

    ledger_without_source_object = FinancialLedger.objects.filter(
        Q(payment__isnull=True) & Q(emi__isnull=True)
    ).count()

    missing_source_models = []
    for group in groups.exclude(source_module="").exclude(source_object_id=""):
        source_hint = (group.source_module or "").split(".")[-1]
        if not source_hint:
            continue
        # Best-effort source existence check, non-blocking for unknown model names.
        model = None
        for app_config in apps.get_app_configs():
            try:
                model = app_config.get_model(source_hint)
            except LookupError:
                continue
            if model is not None:
                break
        if model is None:
            continue
        if not model.objects.filter(pk=group.source_object_id).exists():
            missing_source_models.append(
                {
                    "journal_group_id": group.journal_group_id,
                    "source_module": group.source_module,
                    "source_object_id": group.source_object_id,
                }
            )

    return {
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "unbalanced_group_count": len(unbalanced_groups),
        "unbalanced_groups": unbalanced_groups,
        "orphan_ledger_entries": orphan_ledger,
        "payments_without_ledger": payment_without_ledger,
        "ledger_without_source_object": ledger_without_source_object,
        "missing_source_objects": missing_source_models,
    }

