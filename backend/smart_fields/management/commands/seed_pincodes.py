from __future__ import annotations

import csv
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from smart_fields.models import PincodeLocation, SmartFieldSource

DEFAULT_CSV = Path(__file__).resolve().parent.parent.parent / "data" / "pincodes.csv"

# Column aliases so the full India-Post "all-india-pincode" dataset loads as-is.
_ALIASES = {
    "pincode": ("pincode", "Pincode", "pin", "PIN Code", "pincode_no"),
    "office_name": ("office_name", "officename", "OfficeName", "office"),
    "city": ("city", "City", "Taluk", "taluk"),
    "district": ("district", "District", "Districtname", "districtname"),
    "state": ("state", "State", "StateName", "statename"),
    "state_code": ("state_code", "StateCode", "statecode"),
}


def _pick(row: dict, key: str) -> str:
    for alias in _ALIASES[key]:
        if alias in row and row[alias] is not None:
            return str(row[alias]).strip()
    return ""


class Command(BaseCommand):
    help = (
        "Idempotently load the offline pincode -> location dataset. Defaults to a "
        "bundled sample; pass --path to load the full India Post dataset."
    )

    def add_arguments(self, parser):
        parser.add_argument("--path", default=str(DEFAULT_CSV))
        parser.add_argument(
            "--batch-size",
            type=int,
            default=2000,
            help="Rows per transaction when loading large datasets.",
        )

    def handle(self, *args, **options):
        path = Path(options["path"])
        if not path.exists():
            self.stderr.write(self.style.ERROR(f"CSV not found: {path}"))
            return

        batch_size = max(int(options["batch_size"]), 1)
        created = updated = skipped = 0

        with path.open(newline="", encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh)
            buffer: list[dict] = []

            def flush(rows: list[dict]):
                nonlocal created, updated, skipped
                with transaction.atomic():
                    for parsed in rows:
                        obj, was_created = PincodeLocation.objects.update_or_create(
                            pincode=parsed["pincode"],
                            city=parsed["city"],
                            district=parsed["district"],
                            state=parsed["state"],
                            defaults={
                                "state_code": parsed["state_code"],
                                "office_name": parsed["office_name"],
                                "source": SmartFieldSource.SEED,
                            },
                        )
                        created += int(was_created)
                        updated += int(not was_created)

            for row in reader:
                pincode = _pick(row, "pincode")
                if not (pincode.isdigit() and len(pincode) == 6):
                    skipped += 1
                    continue
                buffer.append(
                    {
                        "pincode": pincode,
                        "office_name": _pick(row, "office_name"),
                        "city": _pick(row, "city"),
                        "district": _pick(row, "district"),
                        "state": _pick(row, "state"),
                        "state_code": _pick(row, "state_code"),
                    }
                )
                if len(buffer) >= batch_size:
                    flush(buffer)
                    buffer = []
            if buffer:
                flush(buffer)

        self.stdout.write(
            self.style.SUCCESS(
                f"Pincode seed complete: {created} created, {updated} updated, "
                f"{skipped} skipped."
            )
        )
