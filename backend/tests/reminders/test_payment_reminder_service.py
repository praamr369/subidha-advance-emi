from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from reminders.models import ReminderStatus
from reminders.services.reminder_service import (
    cancel_payment_reminder,
    create_payment_reminder,
    schedule_payment_reminder,
    send_payment_reminder,
)
from tests.helpers import create_admin_user, create_customer_profile


class PaymentReminderServiceTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="reminder_admin",
            phone="9385000001",
        )
        self.customer = create_customer_profile(
            name="Reminder Customer",
            phone="7385000001",
        )

    def test_reminder_schedule_send_and_cancel_rules(self):
        reminder = create_payment_reminder(
            performed_by=self.admin,
            channel="SMS",
            reminder_type="EMI_DUE",
            target_customer=self.customer,
            due_date=timezone.localdate() + timedelta(days=2),
            amount_due=Decimal("450.00"),
            notes="Upcoming EMI reminder",
        )
        self.assertEqual(reminder.status, ReminderStatus.DRAFT)

        scheduled_for = timezone.now() + timedelta(hours=2)
        reminder, updated = schedule_payment_reminder(
            reminder_id=reminder.id,
            scheduled_for=scheduled_for,
            performed_by=self.admin,
        )
        self.assertTrue(updated)
        self.assertEqual(reminder.status, ReminderStatus.SCHEDULED)

        reminder, sent = send_payment_reminder(
            reminder_id=reminder.id,
            performed_by=self.admin,
        )
        self.assertTrue(sent)
        self.assertEqual(reminder.status, ReminderStatus.SENT)

        with self.assertRaisesMessage(ValueError, "Sent reminders cannot be cancelled."):
            cancel_payment_reminder(reminder_id=reminder.id, performed_by=self.admin)

