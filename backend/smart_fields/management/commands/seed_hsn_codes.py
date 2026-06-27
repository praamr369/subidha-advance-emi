from __future__ import annotations

import csv
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.core.management.base import BaseCommand

from smart_fields.models import HsnCode

DEFAULT_CSV = Path(__file__).resolve().parent.parent.parent / "data" / "hsn_codes.csv"


class Command(BaseCommand):
    help = "Idempotently load the offline HSN/SAC master from a CSV file."

    def add_arguments(self, parser):
        parser.add_argument(
            "--path",
            default=str(DEFAULT_CSV),
            help="CSV path (columns: code,description,gst_rate,chapter,keywords).",
        )

    def handle(self, *args, **options):
        path = Path(options["path"])
        if not path.exists():
            self.stderr.write(self.style.ERROR(f"CSV not found: {path}"))
            return

        created = updated = 0
        with path.open(newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                code = (row.get("code") or "").strip().upper()
                if not code:
                    continue
                try:
                    rate = Decimal(str(row.get("gst_rate") or "0"))
                except (InvalidOperation, ValueError):
                    rate = None
                defaults = {
                    "description": (row.get("description") or "").strip(),
                    "gst_rate": rate,
                    "chapter": (row.get("chapter") or "").strip(),
                    "keywords": (row.get("keywords") or "").strip().lower(),
                    "is_active": True,
                }
                obj, was_created = HsnCode.objects.update_or_create(
                    code=code, defaults=defaults
                )
                created += int(was_created)
                updated += int(not was_created)

        self.stdout.write(
            self.style.SUCCESS(
                f"HSN seed complete: {created} created, {updated} updated."
            )
        )
