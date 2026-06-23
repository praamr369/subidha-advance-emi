"""Management command: dispatch pending/scheduled email reminders.

Usage:
    python manage.py dispatch_reminders            # dispatch all due reminders
    python manage.py dispatch_reminders --limit 50  # cap batch size
    python manage.py dispatch_reminders --dry-run   # show what would be sent
    python manage.py dispatch_reminders --retry-failed  # retry FAILED reminders under max attempts

Intended to run via cron or task scheduler (e.g. every 5-15 minutes).
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from reminders.models import PaymentReminder, ReminderChannel, ReminderStatus
from reminders.services.reminder_service import send_payment_reminder


MAX_ATTEMPTS = 3


class Command(BaseCommand):
    help = "Dispatch pending/scheduled email reminders that are due."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100, help="Max reminders per run")
        parser.add_argument("--dry-run", action="store_true", help="Show what would be sent without sending")
        parser.add_argument("--retry-failed", action="store_true", help="Also retry FAILED reminders under max attempts")

    def handle(self, **options):
        now = timezone.now()
        limit = options["limit"]
        dry_run = options["dry_run"]
        retry_failed = options["retry_failed"]

        statuses = [ReminderStatus.PENDING, ReminderStatus.SCHEDULED]
        if retry_failed:
            statuses.append(ReminderStatus.FAILED)

        with transaction.atomic():
            qs = PaymentReminder.objects.filter(
                channel=ReminderChannel.EMAIL,
                status__in=statuses,
            ).select_related("target_customer", "target_subscription")

            if not retry_failed:
                qs = qs.exclude(status=ReminderStatus.SCHEDULED, scheduled_for__gt=now)
            else:
                qs = qs.exclude(status=ReminderStatus.SCHEDULED, scheduled_for__gt=now)
                qs = qs.filter(attempts__lt=MAX_ATTEMPTS)

            reminders = list(
                qs.select_for_update(skip_locked=True).order_by("created_at", "id")[:limit]
            )

            if not reminders:
                self.stdout.write("No reminders due for dispatch.")
                return

            self.stdout.write(f"Found {len(reminders)} reminder(s) to dispatch.")

            sent = 0
            failed = 0
            for reminder in reminders:
                if dry_run:
                    self.stdout.write(f"  [DRY-RUN] Would send #{reminder.reminder_no} to {reminder.customer_contact}")
                    continue

                try:
                    send_payment_reminder(
                        reminder_id=reminder.id,
                        performed_by=None,
                        notes="Sent during reminder dispatch command.",
                        manual_send=False,
                    )
                    sent += 1
                    self.stdout.write(f"  SENT #{reminder.reminder_no}")
                except Exception as exc:
                    failed += 1
                    self.stderr.write(f"  FAILED #{reminder.reminder_no}: {exc}")

            if dry_run:
                self.stdout.write(f"Dry run complete. {len(reminders)} would be dispatched.")
            else:
                self.stdout.write(f"Dispatch complete: {sent} sent, {failed} failed.")
