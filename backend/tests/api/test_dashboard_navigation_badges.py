from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import SubscriptionStatus
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class DashboardNavigationBadgesTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="nav_badge_admin", phone="9304555001")
        self.client.force_authenticate(self.admin)

    def _create_overdue_subscription(self, *, cancelled: bool = False) -> int:
        customer = create_customer_profile(
            user=create_customer_user(
                username=f"badge_customer_{'cancelled' if cancelled else 'active'}",
                phone=f"73100000{2 if cancelled else 1}",
            ),
            name="Badge Customer",
            phone=f"73100000{2 if cancelled else 1}",
        )
        product = create_product(
            name=f"Badge Product {'C' if cancelled else 'A'}",
            product_code=f"BADGE-{ 'C' if cancelled else 'A'}-001",
            base_price=Decimal("1200.00"),
        )
        batch = create_batch(
            batch_code=f"BADGEBATCH{'C' if cancelled else 'A'}",
            duration_months=6,
            total_slots=100,
            draw_day=5,
            start_date=timezone.localdate() - timedelta(days=30),
            status="OPEN",
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=55 if cancelled else 54)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("1200.00"),
            monthly_amount=Decimal("200.00"),
            tenure_months=6,
        )
        if cancelled:
            subscription.status = SubscriptionStatus.CANCELLED
            subscription.save(update_fields=["status"])
        create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("200.00"),
            due_date=timezone.localdate() - timedelta(days=2),
        )
        return subscription.id

    def test_admin_can_read_navigation_badges(self):
        self._create_overdue_subscription(cancelled=False)
        response = self.client.get("/api/v1/admin/dashboard/navigation-badges/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("outstanding_count", response.data)
        self.assertIn("overdue_count", response.data)
        self.assertIn("pending_delivery_count", response.data)
        self.assertIn("pending_reversal_count", response.data)

    def test_cancelled_subscriptions_do_not_inflate_overdue_badge(self):
        self._create_overdue_subscription(cancelled=False)
        self._create_overdue_subscription(cancelled=True)
        response = self.client.get("/api/v1/admin/dashboard/navigation-badges/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(int(response.data["overdue_count"]), 1)

    def test_navigation_badges_are_admin_only(self):
        non_admin = create_customer_user(username="nav_badge_customer", phone="7319990001")
        self.client.force_authenticate(non_admin)
        response = self.client.get("/api/v1/admin/dashboard/navigation-badges/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
