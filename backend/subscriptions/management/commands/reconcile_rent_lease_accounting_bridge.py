"""Reconcile / backfill rent-lease security-deposit damage deductions onto the
canonical accounting bridge.

Damage deduction is the one rent/lease deposit event that historically posted
through the legacy direct-journal sync. It now posts through the canonical
``AccountingBridgePosting`` path (purpose ``SECURITY_DEPOSIT_DAMAGE_DEDUCTION``,
``source_model="RentLeaseDepositTransaction"``). This command finds DEDUCTION
source rows that do not yet have a canonical bridge posting and (with
``--execute``) posts them. It is **dry-run by default** and never mutates the
operational source records.

It also prints a read-only coverage summary that reuses the existing rent/lease
collection and security-deposit candidate services, so an operator can see the
whole rent/lease bridge picture from one place.

Examples
--------
    python manage.py reconcile_rent_lease_accounting_bridge
    python manage.py reconcile_rent_lease_accounting_bridge --execute
    python manage.py reconcile_rent_lease_accounting_bridge --subscription-id 42
    python manage.py reconcile_rent_lease_accounting_bridge --from-date 2026-01-01 --to-date 2026-03-31
"""
from __future__ import annotations

from datetime import datetime

from django.core.management.base import BaseCommand, CommandError

from accounting.models import AccountingBridgePosting
from subscriptions.models import (
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionStatus,
    RentLeaseDepositTransactionType,
)
from subscriptions.services.rent_lease_accounting_bridge_service import (
    PURPOSE_SECURITY_DEPOSIT_DAMAGE_DEDUCTION,
    post_security_deposit_damage_deduction,
)

SUPPORTED_EVENTS = {"damage_deduction"}


class Command(BaseCommand):
    help = (
        "Reconcile/backfill rent-lease security-deposit damage deductions onto the "
        "canonical accounting bridge (dry-run by default; --execute to post)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--execute",
            action="store_true",
            help="Post eligible items. Without this flag the command is a read-only dry run.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Explicit dry run (the default behaviour when --execute is absent).",
        )
        parser.add_argument("--subscription-id", type=int, default=None)
        parser.add_argument("--from-date", type=str, default=None, help="YYYY-MM-DD (inclusive).")
        parser.add_argument("--to-date", type=str, default=None, help="YYYY-MM-DD (inclusive).")
        parser.add_argument(
            "--event",
            type=str,
            default=None,
            help="Restrict to an event key. Currently only 'damage_deduction' is supported.",
        )

    def _parse_date(self, value, label):
        if not value:
            return None
        try:
            return datetime.strptime(value.strip(), "%Y-%m-%d").date()
        except ValueError as exc:
            raise CommandError(f"Invalid --{label} '{value}'. Use YYYY-MM-DD.") from exc

    def handle(self, *args, **options):
        execute = bool(options.get("execute"))
        dry_run = not execute  # dry-run is the safe default
        event = (options.get("event") or "").strip().lower()
        if event and event not in SUPPORTED_EVENTS:
            raise CommandError(
                f"Unsupported --event '{event}'. Supported: {', '.join(sorted(SUPPORTED_EVENTS))}."
            )
        from_date = self._parse_date(options.get("from_date"), "from-date")
        to_date = self._parse_date(options.get("to_date"), "to-date")
        subscription_id = options.get("subscription_id")

        qs = RentLeaseDepositTransaction.objects.select_related(
            "subscription", "demand"
        ).filter(
            transaction_type=RentLeaseDepositTransactionType.DEDUCTION,
            status=RentLeaseDepositTransactionStatus.ACTIVE,
        )
        if subscription_id:
            qs = qs.filter(subscription_id=subscription_id)
        if from_date:
            qs = qs.filter(created_at__date__gte=from_date)
        if to_date:
            qs = qs.filter(created_at__date__lte=to_date)
        qs = qs.order_by("created_at", "id")

        counts = {
            "eligible": 0,
            "posted": 0,
            "already_posted": 0,
            "deferred": 0,
            "skipped": 0,
            "blocked": 0,
        }

        mode = "DRY RUN" if dry_run else "EXECUTE"
        self.stdout.write(
            self.style.MIGRATE_HEADING(
                f"Rent/lease damage-deduction accounting bridge reconcile [{mode}]"
            )
        )

        posted_ids = set(
            AccountingBridgePosting.objects.filter(
                source_model="RentLeaseDepositTransaction",
                purpose=PURPOSE_SECURITY_DEPOSIT_DAMAGE_DEDUCTION,
            ).values_list("source_id", flat=True)
        )

        for tx in qs.iterator():
            if str(tx.id) in posted_ids:
                counts["already_posted"] += 1
                continue
            counts["eligible"] += 1
            if dry_run:
                continue
            result = post_security_deposit_damage_deduction(tx, performed_by=None)
            status = (result.get("status") or "").upper()
            if status == "POSTED":
                counts["posted"] += 1
            elif status == "ALREADY_POSTED":
                counts["already_posted"] += 1
            elif status == "DEFERRED":
                counts["deferred"] += 1
            elif status == "BLOCKED":
                counts["blocked"] += 1
            else:
                counts["skipped"] += 1

        self.stdout.write("")
        self.stdout.write("Damage deduction (RentLeaseDepositTransaction):")
        for key in ("eligible", "posted", "already_posted", "deferred", "skipped", "blocked"):
            self.stdout.write(f"  {key:<14}: {counts[key]}")
        if dry_run and counts["eligible"]:
            self.stdout.write(
                self.style.WARNING(
                    f"  {counts['eligible']} eligible row(s) would be posted with --execute "
                    "(subject to the rent/lease posting bridge being enabled)."
                )
            )

        self._print_existing_candidate_coverage()
        return None

    def _print_existing_candidate_coverage(self):
        """Read-only summary that reuses the existing rent/lease candidate services."""
        self.stdout.write("")
        self.stdout.write("Existing canonical bridge coverage (read-only):")
        try:
            from accounting.services import (
                accounting_bridge_rent_lease_collection_service as collection_service,
            )
            from accounting.services import (
                accounting_bridge_security_deposit_service as deposit_service,
            )

            collection_rows = collection_service.list_bridge_candidates()
            deposit_rows = deposit_service.list_bridge_candidates()
            self.stdout.write(
                f"  rent/lease collections : {collection_service.summarize_candidate_statuses(collection_rows)}"
            )
            self.stdout.write(
                f"  security deposits      : {deposit_service.summarize_candidate_statuses(deposit_rows)}"
            )
        except Exception as exc:  # pragma: no cover - diagnostic convenience only
            self.stdout.write(
                self.style.WARNING(f"  (coverage summary unavailable: {exc})")
            )
