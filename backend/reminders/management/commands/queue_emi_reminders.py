"""Management command to queue upcoming EMI due reminders into the 1-click WhatsApp outbox.

Usage:
    python manage.py queue_emi_reminders
    python manage.py queue_emi_reminders --days-ahead 2
    python manage.py queue_emi_reminders --date 2026-11-01
"""
from __future__ import annotations

from datetime import datetime
from django.core.management.base import BaseCommand
from reminders.services.whatsapp_outbox_service import queue_upcoming_emi_reminders


class Command(BaseCommand):
    help = "Queue click-to-send WhatsApp due reminders for upcoming EMIs into WhatsAppMessage outbox."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days-ahead",
            type=int,
            default=2,
            help="Number of days in advance to queue reminders (default: 2)",
        )
        parser.add_argument(
            "--date",
            type=str,
            default=None,
            help="Explicit target date (YYYY-MM-DD) instead of calculating from days-ahead",
        )

    def handle(self, *args, **options):
        days_ahead = options["days_ahead"]
        raw_date = options.get("date")

        on_date = None
        if raw_date:
            try:
                on_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
            except ValueError:
                self.stderr.write(self.style.ERROR(f"Invalid date format: {raw_date}. Expected YYYY-MM-DD."))
                return

        self.stdout.write(
            f"Queueing upcoming EMI reminders (days_ahead={days_ahead}, explicit_date={on_date})..."
        )
        result = queue_upcoming_emi_reminders(days_ahead=days_ahead, on_date=on_date)

        self.stdout.write(
            self.style.SUCCESS(
                f"Completed: target_date={result['target_date']} | "
                f"queued={result['queued_count']} | "
                f"skipped={result['skipped_count']} | "
                f"total_checked={result['total_checked']}"
            )
        )

