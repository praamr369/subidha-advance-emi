from __future__ import annotations

from django.core.management.base import BaseCommand

from accounting.services.accounting_setup_service import AccountingSetupService


class Command(BaseCommand):
    help = "Bootstrap default chart of accounts, finance accounts, and mapping setup."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", default=False)

    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))
        payload = AccountingSetupService.bootstrap(actor=None, dry_run=dry_run)
        self.stdout.write(self.style.SUCCESS("Accounting setup bootstrap completed."))
        self.stdout.write(f"Dry run: {payload['dry_run']}")
        self.stdout.write(f"COA created: {payload['chart_of_accounts']['created']}")
        self.stdout.write(f"Finance accounts created: {payload['finance_accounts']['created']}")
        self.stdout.write(f"Mappings created: {payload['mappings']['created']}")
        self.stdout.write(f"Validation status: {payload['validation']['status']}")
