import logging
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounting.models import SalarySheet, SalarySheetStatus
from accounting.services.salary_posting_service import post_salary_sheet

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Auto-posts approved salary sheets into the accounting ledger as salary accruals."

    def add_arguments(self, parser):
        parser.add_argument("--user", required=True, type=str, help="Username recorded as the posting actor (must be an active admin/staff account).")
        parser.add_argument(
            "--dry-run", action="store_true", help="Report postable salary sheets without actually posting"
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        username = options.get("user")

        from django.contrib.auth import get_user_model
        User = get_user_model()
        actor = User.objects.filter(username=username, is_active=True).first()
        if actor is None:
            raise CommandError(f"Active user '{username}' was not found.")

        candidates = SalarySheet.objects.filter(status=SalarySheetStatus.APPROVED).order_by("year", "month", "id")

        if dry_run:
            self.stdout.write(self.style.SUCCESS(f"[DRY RUN] Found {candidates.count()} approved salary sheets."))
            return

        success_count = 0
        error_count = 0

        for sheet in candidates:
            try:
                with transaction.atomic():
                    post_salary_sheet(salary_sheet_id=sheet.id, posted_by=actor)
                    success_count += 1
                    self.stdout.write(self.style.SUCCESS(f"Posted Salary Sheet ID {sheet.id}"))
            except Exception as e:
                error_count += 1
                self.stdout.write(self.style.ERROR(f"Failed to post Salary Sheet ID {sheet.id}: {str(e)}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"Salary sweep complete. Posted: {success_count}. Failed: {error_count}."
            )
        )
