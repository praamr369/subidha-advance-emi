"""
Management command: backfill_direct_sale_numbers

Assigns SALE numbers to any DirectSale rows that currently have sale_no=NULL.

These rows were created before the DocumentSequence-based sale numbering was
in place (pre-Phase 3) and therefore missed auto-assignment.  The command is
safe to run multiple times (idempotent): rows that already have a sale_no are
skipped without modification.

Usage:
    python manage.py backfill_direct_sale_numbers
    python manage.py backfill_direct_sale_numbers --dry-run

The command processes rows in ascending PK order so numbers are assigned
chronologically.  Rows are committed one-at-a-time so a partial run can be
resumed safely.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Assign sale_no to DirectSale rows that currently have sale_no=NULL."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Show what would be done without making any changes.",
        )

    def handle(self, *args, **options):
        from billing.models import DirectSale
        from subscriptions.services.contract_number_service import assign_direct_sale_number

        dry_run: bool = options["dry_run"]

        null_sales = (
            DirectSale.objects.filter(sale_no__isnull=True)
            .order_by("pk")
        )
        total = null_sales.count()

        if total == 0:
            self.stdout.write(self.style.SUCCESS("No DirectSale rows with sale_no=NULL found. Nothing to do."))
            return

        self.stdout.write(f"Found {total} DirectSale row(s) with sale_no=NULL.")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be committed."))

        assigned = 0
        skipped = 0

        for sale in null_sales.iterator():
            if sale.sale_no:
                skipped += 1
                continue

            if dry_run:
                self.stdout.write(f"  [DRY RUN] Would assign sale_no to DirectSale #{sale.pk} (date={sale.sale_date})")
                assigned += 1
                continue

            try:
                with transaction.atomic():
                    number = assign_direct_sale_number(sale)
                self.stdout.write(f"  Assigned {number!r} to DirectSale #{sale.pk}")
                assigned += 1
            except Exception as exc:
                self.stderr.write(
                    self.style.ERROR(f"  ERROR assigning number to DirectSale #{sale.pk}: {exc}")
                )
                skipped += 1

        verb = "Would assign" if dry_run else "Assigned"
        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone. {verb} numbers to {assigned} row(s). Skipped {skipped} row(s)."
            )
        )
