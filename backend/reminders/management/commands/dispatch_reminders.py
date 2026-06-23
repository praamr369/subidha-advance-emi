"""Management command: dispatch pending/scheduled email reminders.

Usage:
    python manage.py dispatch_reminders            # dispatch all due reminders
    python manage.py dispatch_reminders --limit 50  # cap batch size
    python manage.py dispatch_reminders --dry-run   # show what would be sent
    python manage.py dispatch_reminders --retry-failed  # retry FAILED reminders under max attempts

Intended to run via cron or task scheduler (e.g. every 5-15 minutes).
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from reminders.models import PaymentReminder, ReminderChannel, ReminderStatus


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

        qs = PaymentReminder.objects.filter(
            channel=ReminderChannel.EMAIL,
        ).select_related("target_customer", "target_subscription")

        pending_qs = qs.filter(
            status__in=[ReminderStatus.PENDING, ReminderStatus.SCHEDULED],
        ).filter(
            # PENDING: always due. SCHEDULED: due when scheduled_for <= now.
            **{}  # base filter
        ).exclude(
            status=ReminderStatus.SCHEDULED,
            scheduled_for__gt=now,
        )

        if retry_failed:
            failed_qs = qs.filter(
                status=ReminderStatus.FAILED,
                attempts__lt=MAX_ATTEMPTS,
            )
            combined = (pending_qs | failed_qs).distinct().order_by("created_at")[:limit]
        else:
            combined = pending_qs.order_by("created_at")[:limit]

        reminders = list(combined)

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
                from reminders.services.reminder_service import _dispatch_email_reminder
                _dispatch_email_reminder(reminder)
                reminder.status = ReminderStatus.SENT
                reminder.sent_at = now
                reminder.attempts = (reminder.attempts or 0) + 1
                reminder.last_error = ""
                reminder.save(update_fields=["status", "sent_at", "attempts", "last_error", "updated_at"])
                sent += 1
                self.stdout.write(f"  SENT #{reminder.reminder_no}")
            except Exception as exc:
                reminder.status = ReminderStatus.FAILED
                reminder.attempts = (reminder.attempts or 0) + 1
                reminder.last_error = str(exc)[:500]
                reminder.save(update_fields=["status", "attempts", "last_error", "updated_at"])
                failed += 1
                self.stderr.write(f"  FAILED #{reminder.reminder_no}: {exc}")

        if dry_run:
            self.stdout.write(f"Dry run complete. {len(reminders)} would be dispatched.")
        else:
            self.stdout.write(f"Dispatch complete: {sent} sent, {failed} failed.")
