from django.core.management.base import BaseCommand

from subscriptions.services.contract_reference_service import (
    backfill_contract_references,
)


class Command(BaseCommand):
    help = "Backfill missing ContractReference rows without touching financial source records."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report missing references without creating rows.",
        )

    def handle(self, *args, **options):
        dry_run = bool(options["dry_run"])
        result = backfill_contract_references(dry_run=dry_run)
        mode = "DRY RUN" if dry_run else "APPLY"
        self.stdout.write(f"ContractReference backfill mode: {mode}")

        for contract_type in sorted(result.scanned):
            self.stdout.write(
                " ".join(
                    [
                        contract_type,
                        f"scanned={result.scanned.get(contract_type, 0)}",
                        f"existing={result.existing.get(contract_type, 0)}",
                        f"{'would_create' if dry_run else 'created'}={result.created.get(contract_type, 0)}",
                        f"skipped={result.skipped.get(contract_type, 0)}",
                    ]
                )
            )

