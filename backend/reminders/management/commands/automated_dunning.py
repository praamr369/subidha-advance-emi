from datetime import date
from django.core.management.base import BaseCommand
from django.utils import timezone
from reminders.services.emi_reminder_jobs import generate_emi_due_reminders_for_date, generate_emi_overdue_reminders
from reminders.models import PaymentReminder, ReminderStatus
from reminders.services.reminder_service import _audit
from django.conf import settings
import json
import urllib.request
import urllib.error
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = "Run automated dunning: generate reminders and send them via WhatsApp Cloud API templates."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Do not actually send via API")

    def handle(self, **options):
        dry_run = options["dry_run"]
        today = timezone.localdate()

        self.stdout.write("Generating due reminders...")
        due_result = generate_emi_due_reminders_for_date(on_date=today)
        self.stdout.write(f"Due: created {due_result['created_count']}, skipped {due_result['skipped_count']}")

        self.stdout.write("Generating overdue reminders...")
        overdue_result = generate_emi_overdue_reminders(as_of=today)
        self.stdout.write(f"Overdue: created {overdue_result['created_count']}, skipped {overdue_result['skipped_count']}")

        pending = PaymentReminder.objects.filter(
            status=ReminderStatus.PENDING,
            reminder_type__in=["EMI_DUE", "EMI_OVERDUE"]
        )
        self.stdout.write(f"Found {pending.count()} pending reminders to dispatch via WhatsApp.")

        token = getattr(settings, "WHATSAPP_BUSINESS_TOKEN", None)
        phone_number_id = getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", None)

        if not token or not phone_number_id:
            self.stdout.write(self.style.WARNING("WhatsApp Cloud API credentials not configured. Skipping send."))
            return

        url = f"https://graph.facebook.com/v19.0/{phone_number_id}/messages"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        for reminder in pending:
            customer = reminder.target_customer
            if not customer or not customer.phone:
                continue
            
            phone = customer.phone
            digits = "".join(c for c in phone if c.isdigit())
            if len(digits) == 10:
                digits = f"91{digits}"
                
            amount = f"{reminder.amount_due:.2f}"
            due_date = reminder.due_date.strftime("%d %b %Y") if reminder.due_date else "today"
            name = getattr(customer, "name", "Customer")
            
            # Map reminder type to a theoretical template name
            template_name = "payment_reminder_due" if reminder.reminder_type == "EMI_DUE" else "payment_reminder_overdue"
            ref = getattr(reminder.target_subscription, "contract_reference", "") or str(getattr(reminder.target_subscription, "id", ""))
            
            payload = {
                "messaging_product": "whatsapp",
                "to": digits,
                "type": "template",
                "template": {
                    "name": template_name,
                    "language": {"code": "en_US"},
                    "components": [
                        {
                            "type": "body",
                            "parameters": [
                                {"type": "text", "text": name},
                                {"type": "text", "text": amount},
                                {"type": "text", "text": due_date},
                                {"type": "text", "text": ref}
                            ]
                        }
                    ]
                }
            }

            if dry_run:
                self.stdout.write(f"[DRY RUN] Would send {template_name} to {digits}")
                continue

            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers=headers,
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    resp.read()
                
                reminder.status = ReminderStatus.SENT
                reminder.sent_at = timezone.now()
                reminder.notes = "Sent automatically via WhatsApp Cloud API Template."
                reminder.save(update_fields=["status", "sent_at", "notes", "updated_at"])
                
                _audit(
                    reminder=reminder,
                    performed_by=None,
                    event="WHATSAPP_TEMPLATE_SENT",
                    metadata={"to": digits, "template": template_name}
                )
                self.stdout.write(f"Sent reminder {reminder.id} to {digits}")
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Failed to send reminder {reminder.id}: {e}"))
                reminder.last_error = str(e)
                reminder.attempts = (reminder.attempts or 0) + 1
                reminder.save(update_fields=["last_error", "attempts", "updated_at"])

