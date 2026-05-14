from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from subscriptions.services.selective_reset_service import RESET_CONFIRM_PHRASE, execute_selective_reset


class Command(BaseCommand):
    help = "Selective reset for local sandbox data."

    def add_arguments(self, parser):
        parser.add_argument("--preserve-admin", required=True)
        parser.add_argument("--preserve-setup", action="store_true")
        parser.add_argument("--confirm", action="store_true")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        if not options["confirm"] and not options["dry_run"]:
            raise CommandError("Pass --confirm or --dry-run.")
        scopes = [
            "customers", "partners", "subscriptions", "payments", "direct_sales", "purchases",
            "inventory", "rent_lease", "deliveries", "service_desk", "commissions", "payouts", "crm",
        ]
        result = execute_selective_reset(
            scopes=scopes,
            preserve_admin_username=options["preserve_admin"],
            preserve_setup=bool(options["preserve_setup"]),
            confirm_phrase=RESET_CONFIRM_PHRASE,
            dry_run=bool(options["dry_run"]),
            sandbox_only=True,
        )
        self.stdout.write(self.style.SUCCESS(str(result)))
