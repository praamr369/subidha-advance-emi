from __future__ import annotations

import json

from django.core.management.base import BaseCommand

from subscriptions.services.setup_snapshot_service import export_setup_snapshot


class Command(BaseCommand):
    help = "Export setup/master-data snapshot to JSON file."

    def add_arguments(self, parser):
        parser.add_argument("--output", required=True)

    def handle(self, *args, **options):
        output = options["output"]
        result = export_setup_snapshot()
        with open(output, "w", encoding="utf-8") as fh:
            json.dump(result.payload, fh, indent=2)
        self.stdout.write(self.style.SUCCESS(f"Setup snapshot exported to {output}"))
