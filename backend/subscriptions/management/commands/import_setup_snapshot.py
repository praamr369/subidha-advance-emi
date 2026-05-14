from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from subscriptions.services.setup_snapshot_service import import_setup_snapshot


class Command(BaseCommand):
    help = "Import setup/master-data snapshot from JSON file."

    def add_arguments(self, parser):
        parser.add_argument("--input", required=True)
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--confirm", action="store_true")

    def handle(self, *args, **options):
        if not options["dry_run"] and not options["confirm"]:
            raise CommandError("Use --dry-run or --confirm.")
        with open(options["input"], "r", encoding="utf-8") as fh:
            payload = json.load(fh)
        result = import_setup_snapshot(payload=payload, dry_run=bool(options["dry_run"]))
        self.stdout.write(json.dumps(result, indent=2, default=str))
