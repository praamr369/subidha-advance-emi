from datetime import date
from decimal import Decimal

from django.test import TestCase

from subscriptions.models import AuditLog, BatchStatus, LuckyIdStatus, Subscription
from subscriptions.services.operational_cancellation_service import cancel_subscription
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
)


class LuckyIdReleaseOnCancellationTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_lucky_release", phone="9307100001")
        self.customer = create_customer_profile(name="Lucky Release Customer", phone="7307100001")
        self.product = create_product(
            name="Lucky Release Product",
            product_code="LREL-001",
            base_price=Decimal("3000.00"),
        )

    def _make_subscription(self, *, batch_status: str, lucky_number: int) -> Subscription:
        batch = create_batch(
            batch_code=f"LREL-{batch_status}-{lucky_number}",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
            status=batch_status,
        )
        lucky = create_lucky_id(batch=batch, lucky_number=lucky_number, status=LuckyIdStatus.AVAILABLE)
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )
        lucky.status = LuckyIdStatus.ASSIGNED
        lucky.save(update_fields=["status"])
        return subscription

    def test_open_batch_cancellation_releases_lucky_id(self):
        sub = self._make_subscription(batch_status=BatchStatus.OPEN, lucky_number=21)
        lucky_id = sub.lucky_id
        cancel_subscription(subscription_id=sub.id, actor=self.admin, reason="Customer withdrawal")

        sub.refresh_from_db()
        lucky_id.refresh_from_db()
        self.assertEqual(sub.status, "CANCELLED")
        self.assertIsNone(sub.lucky_id_id)
        self.assertEqual(lucky_id.status, LuckyIdStatus.AVAILABLE)
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="Subscription",
                object_id=sub.id,
                metadata__event="LUCKY_ID_RELEASED_FROM_CANCELLED_SUBSCRIPTION",
                metadata__lucky_id=lucky_id.id,
            ).exists()
        )

    def test_draft_batch_cancellation_releases_lucky_id(self):
        sub = self._make_subscription(batch_status=BatchStatus.DRAFT, lucky_number=22)
        lucky_id = sub.lucky_id
        cancel_subscription(subscription_id=sub.id, actor=self.admin, reason="Customer request")

        sub.refresh_from_db()
        lucky_id.refresh_from_db()
        self.assertIsNone(sub.lucky_id_id)
        self.assertEqual(lucky_id.status, LuckyIdStatus.AVAILABLE)

    def test_frozen_batch_cancellation_keeps_lucky_id_frozen(self):
        frozen_statuses = [
            BatchStatus.READY_TO_LOCK,
            BatchStatus.LOCKED,
            BatchStatus.DRAW_COMMITTED,
            BatchStatus.DRAW_COMPLETED,
            BatchStatus.CANCELLED,
        ]
        for index, batch_status in enumerate(frozen_statuses, start=30):
            sub = self._make_subscription(batch_status=batch_status, lucky_number=index)
            lucky_id = sub.lucky_id
            cancel_subscription(
                subscription_id=sub.id,
                actor=self.admin,
                reason=f"Cancellation under frozen batch {batch_status}",
            )
            sub.refresh_from_db()
            lucky_id.refresh_from_db()
            self.assertEqual(sub.status, "CANCELLED")
            self.assertIsNotNone(sub.lucky_id_id)
            self.assertEqual(lucky_id.status, LuckyIdStatus.ASSIGNED)
            self.assertTrue(
                AuditLog.objects.filter(
                    model_name="Subscription",
                    object_id=sub.id,
                    metadata__event="LUCKY_ID_RELEASE_BLOCKED_BATCH_FROZEN",
                    metadata__batch_status=batch_status,
                ).exists()
            )

    def test_open_batch_released_lucky_id_can_be_reused(self):
        sub = self._make_subscription(batch_status=BatchStatus.OPEN, lucky_number=40)
        lucky_id = sub.lucky_id
        cancel_subscription(subscription_id=sub.id, actor=self.admin, reason="Cancelled before activation")
        sub.refresh_from_db()
        lucky_id.refresh_from_db()

        reused = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=sub.batch,
            lucky_id=lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )
        self.assertIsNotNone(reused.id)
        self.assertTrue(Subscription.objects.filter(pk=sub.id).exists())
