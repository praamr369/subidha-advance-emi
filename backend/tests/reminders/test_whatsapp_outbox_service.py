from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone

from reminders.models import WhatsAppEventType, WhatsAppMessage, WhatsAppMessageStatus
from reminders.services.whatsapp_outbox_service import (
    queue_upcoming_emi_reminders,
    queue_whatsapp_message,
)
from subscriptions.models import EmiStatus, SubscriptionStatus
from tests.helpers import (
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class WhatsAppOutboxServiceTests(TestCase):
    def setUp(self):
        super().setUp()
        self.customer = create_customer_profile(
            name="Aarav Sharma",
            phone="9832000001",
        )
        self.product = create_product(name="Solid Wood Wardrobe")
        self.batch = create_batch(batch_code="OCT2026")
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=42)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            monthly_amount=Decimal("1500.00"),
            status=SubscriptionStatus.ACTIVE,
        )

    def test_queue_upcoming_emi_reminders_creates_and_deduplicates(self):
        target_date = timezone.localdate() + timedelta(days=2)
        emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1500.00"),
            due_date=target_date,
            status=EmiStatus.PENDING,
        )

        # First run: should queue exactly 1 message
        res1 = queue_upcoming_emi_reminders(days_ahead=2)
        self.assertEqual(res1["queued_count"], 1)
        self.assertEqual(res1["skipped_count"], 0)

        msg = WhatsAppMessage.objects.filter(source_model="Emi", source_id=str(emi.pk)).first()
        self.assertIsNotNone(msg)
        assert msg is not None
        self.assertEqual(msg.event_type, WhatsAppEventType.DUE_REMINDER)
        self.assertEqual(msg.customer, self.customer)
        self.assertEqual(msg.subscription, self.subscription)
        self.assertIn("1,500.00", msg.body)
        self.assertEqual(msg.status, WhatsAppMessageStatus.QUEUED)

        # Second run on the same date: should deduplicate (idempotent)
        res2 = queue_upcoming_emi_reminders(days_ahead=2)
        self.assertEqual(res2["queued_count"], 1)  # queue_whatsapp_message returns existing message
        self.assertEqual(WhatsAppMessage.objects.filter(source_model="Emi", source_id=str(emi.pk)).count(), 1)

    def test_queue_upcoming_emi_reminders_skips_cancelled_subscriptions(self):
        self.subscription.status = SubscriptionStatus.CANCELLED
        self.subscription.save(update_fields=["status"])

        target_date = timezone.localdate() + timedelta(days=2)
        create_emi(
            subscription=self.subscription,
            month_no=2,
            amount=Decimal("1500.00"),
            due_date=target_date,
            status=EmiStatus.PENDING,
        )

        res = queue_upcoming_emi_reminders(days_ahead=2)
        self.assertEqual(res["total_checked"], 0)
        self.assertEqual(res["queued_count"], 0)
