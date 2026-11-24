from __future__ import annotations

from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounting.models import (
    ChartOfAccount,
    FinanceAccount,
    FinanceAccountKind,
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
)
from payments.models import RentLeaseCollection, Payment
from subscriptions.models import AuditLog, settlement_channel_for_method
from subscriptions.services.audit_service import log_audit
from payments.services.payment_service import _fallback_finance_account_for_method


class Command(BaseCommand):
    help = (
        "Audit and realign misclassified non-cash (UPI/Bank) collections that were debited to Cash Desk / Cash in Hand."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply the realignment changes to database. Default is dry-run mode.",
        )
        parser.add_argument(
            "--entry-no",
            type=str,
            default="",
            help="Target a specific journal entry number (e.g. JV/FY2026-27/00040).",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        target_entry_no = (options.get("entry_no") or "").strip()

        mode_str = "APPLYING CHANGES" if apply_changes else "DRY-RUN (read-only)"
        self.stdout.write(self.style.NOTICE(f"=== Realigning Non-Cash Collections from Cash Desk [{mode_str}] ==="))

        cash_charts = set(
            ChartOfAccount.objects.filter(
                system_code__in=["CASH_COLLECTION"], is_active=True
            ).values_list("id", flat=True)
        )
        cash_accounts = set(
            FinanceAccount.objects.filter(kind=FinanceAccountKind.CASH).values_list("chart_account_id", flat=True)
        )
        cash_charts.update(cash_accounts)

        realigned_collections = 0
        realigned_journals = 0

        with transaction.atomic():
            # 1. Target specific journal entry or scan rent/lease collections
            if target_entry_no:
                journals = JournalEntry.objects.filter(entry_no=target_entry_no).exclude(status=JournalEntryStatus.VOID)
            else:
                journals = JournalEntry.objects.filter(
                    source_model="Subscription",
                    source_type="RENT_LEASE_MONTHLY_PAYMENT",
                ).exclude(status=JournalEntryStatus.VOID)

            for journal in journals:
                debit_line = journal.lines.filter(debit_amount__gt=Decimal("0.00")).first()
                if not debit_line:
                    continue

                if debit_line.chart_account_id not in cash_charts:
                    continue

                # Check if linked to RentLeaseCollection or collection reference
                collection = None
                if "COLLECTION:" in (journal.source_reference or ""):
                    try:
                        coll_id = int(journal.source_reference.split("COLLECTION:")[1].split(":")[0])
                        collection = RentLeaseCollection.objects.filter(pk=coll_id).first()
                    except (ValueError, IndexError):
                        pass

                if collection is None and journal.source_id:
                    collection = (
                        RentLeaseCollection.objects.filter(
                            subscription_id=int(journal.source_id),
                            amount=debit_line.debit_amount,
                        )
                        .order_by("-id")
                        .first()
                    )

                method = collection.payment_method if collection else None
                if not method and "UPI" in (journal.memo or ""):
                    method = "UPI"

                if not method:
                    # Check if memo or context indicates UPI
                    continue

                channel = settlement_channel_for_method(method)
                if channel != "BANK":
                    continue

                target_fa = _fallback_finance_account_for_method(method)
                if not target_fa or not target_fa.chart_account:
                    self.stdout.write(self.style.ERROR(f"No fallback Bank/UPI chart account found for method {method}"))
                    continue

                target_chart = target_fa.chart_account
                self.stdout.write(
                    self.style.WARNING(
                        f"Found misclassified journal {journal.entry_no} (amount: {debit_line.debit_amount}, "
                        f"method: {method}): {debit_line.chart_account.name} -> {target_chart.name}"
                    )
                )

                if apply_changes:
                    old_chart_name = debit_line.chart_account.name
                    now = timezone.now()
                    JournalEntryLine.objects.filter(pk=debit_line.pk).update(
                        chart_account=target_chart,
                        description=f"{debit_line.description or ''} [Reclassified to {target_chart.code}]".strip(),
                        updated_at=now,
                    )

                    if collection and collection.finance_account.kind == FinanceAccountKind.CASH:
                        RentLeaseCollection.objects.filter(pk=collection.pk).update(
                            finance_account=target_fa,
                            updated_at=now,
                        )
                        realigned_collections += 1

                    log_audit(
                        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                        instance=journal,
                        metadata={
                            "event": "COLLECTION_JOURNAL_RECLASSIFIED_FROM_CASH_TO_BANK",
                            "entry_no": journal.entry_no,
                            "previous_chart": old_chart_name,
                            "new_chart": target_chart.name,
                            "payment_method": method,
                        },
                    )
                    realigned_journals += 1

            if not apply_changes:
                self.stdout.write(self.style.SUCCESS("Dry-run complete. Re-run with --apply to execute changes."))
            else:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Realignment complete. Realigned {realigned_journals} journal(s) and {realigned_collections} collection(s)."
                    )
                )
