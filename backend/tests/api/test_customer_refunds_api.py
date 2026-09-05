"""Customer refund-request endpoints.

Partial by design: the damage-assessment half of this surface has no model
behind it, so only the endpoints resting on rules ConsumerReturnRequest already
enforces are built.

The window rules are the substance. A return wrongly marked inside the window
commits the business to a refund it need not give; wrongly outside denies a
customer a statutory right.
"""
from datetime import timedelta
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from deliveries.models import ConsumerReturnRequest, Delivery, DeliveryStatus
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_lucky_id,
    create_product,
    create_subscription,
)


class RefundTestCase(APITestCase):
    def setUp(self):
        self.user = create_customer_user(username="ref_user", phone="9000008001")
        self.customer = create_customer_profile(
            user=self.user, name="Refund Customer", phone="9000008001"
        )
        self.other_user = create_customer_user(username="ref_other", phone="9000008002")
        self.other_customer = create_customer_profile(
            user=self.other_user, name="Other Customer", phone="9000008002"
        )
        self.product = create_product(
            name="Refund Sofa", product_code="TP-REFUND", base_price=Decimal("9000.00")
        )
        self.batch = create_batch()
        self.client.force_authenticate(user=self.user)

    def _subscription(self, customer=None, lucky_number=1):
        return create_subscription(
            customer=customer or self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=create_lucky_id(batch=self.batch, lucky_number=lucky_number),
        )

    def _deliver(self, subscription, days_ago: int):
        day = timezone.localdate() - timedelta(days=days_ago)
        return Delivery.objects.create(
            subscription=subscription,
            status=DeliveryStatus.DELIVERED,
            scheduled_date=day,
            delivered_date=day,
        )


class RefundRequestTests(RefundTestCase):
    def test_request_inside_the_window_is_marked_within_window(self):
        subscription = self._subscription()
        self._deliver(subscription, days_ago=2)

        response = self.client.post(
            reverse("refund-request"),
            {"subscription_id": subscription.id, "reason": "Wrong colour delivered."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "WITHIN_WINDOW")
        self.assertTrue(response.data["is_within_window"])
        self.assertEqual(response.data["return_window_days"], 7)

    def test_request_outside_the_window_is_marked_outside(self):
        """The model decides this, not the view — one definition of the rule."""
        subscription = self._subscription()
        self._deliver(subscription, days_ago=30)

        response = self.client.post(
            reverse("refund-request"),
            {"subscription_id": subscription.id, "reason": "Changed my mind."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "OUTSIDE_WINDOW")
        self.assertFalse(response.data["is_within_window"])

    def test_boundary_day_is_inside_the_window(self):
        """Day 7 of a 7-day window still counts."""
        subscription = self._subscription()
        self._deliver(subscription, days_ago=7)

        response = self.client.post(
            reverse("refund-request"),
            {"subscription_id": subscription.id, "reason": "Faulty."},
            format="json",
        )

        self.assertEqual(response.data["status"], "WITHIN_WINDOW")

    def test_undelivered_subscription_cannot_be_returned(self):
        subscription = self._subscription()

        response = self.client.post(
            reverse("refund-request"),
            {"subscription_id": subscription.id, "reason": "Do not want it."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ConsumerReturnRequest.objects.count(), 0)

    def test_reason_is_required(self):
        subscription = self._subscription()
        self._deliver(subscription, days_ago=1)

        response = self.client.post(
            reverse("refund-request"),
            {"subscription_id": subscription.id, "reason": "   "},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_open_request_is_refused(self):
        subscription = self._subscription()
        self._deliver(subscription, days_ago=1)
        payload = {"subscription_id": subscription.id, "reason": "Faulty."}
        first = self.client.post(reverse("refund-request"), payload, format="json")

        response = self.client.post(reverse("refund-request"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["existing_request_id"], first.data["id"])
        self.assertEqual(ConsumerReturnRequest.objects.count(), 1)

    def test_cannot_request_against_another_customers_subscription(self):
        theirs = self._subscription(customer=self.other_customer, lucky_number=9)
        self._deliver(theirs, days_ago=1)

        response = self.client.post(
            reverse("refund-request"),
            {"subscription_id": theirs.id, "reason": "Not mine."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(ConsumerReturnRequest.objects.count(), 0)


class RefundStatusAndHistoryTests(RefundTestCase):
    def _make_request(self, customer=None, lucky_number=1):
        subscription = self._subscription(customer=customer, lucky_number=lucky_number)
        self._deliver(subscription, days_ago=1)
        return ConsumerReturnRequest.objects.create(
            subscription=subscription,
            reason="Faulty item.",
            delivery_date=timezone.localdate() - timedelta(days=1),
        )

    def test_status_is_scoped_to_the_owner(self):
        theirs = self._make_request(customer=self.other_customer, lucky_number=9)

        response = self.client.get(reverse("refund-status", args=[theirs.id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_status_returns_the_customers_own_request(self):
        mine = self._make_request()

        response = self.client.get(reverse("refund-status", args=[mine.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], mine.id)

    def test_history_lists_only_my_requests(self):
        self._make_request()
        self._make_request(customer=self.other_customer, lucky_number=9)

        response = self.client.get(reverse("refund-history"))

        self.assertEqual(response.data["count"], 1)

    def test_customer_facing_rows_omit_internal_fields(self):
        """Rejection reasons and approver ids are staff working notes."""
        mine = self._make_request()

        response = self.client.get(reverse("refund-status", args=[mine.id]))

        self.assertNotIn("rejection_reason", response.data)
        self.assertNotIn("approved_by_id", response.data)


class RefundAdminListTests(RefundTestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="ref_admin", phone="9000008009")

    def _make_request(self, customer=None, lucky_number=1):
        subscription = self._subscription(customer=customer, lucky_number=lucky_number)
        self._deliver(subscription, days_ago=1)
        return ConsumerReturnRequest.objects.create(
            subscription=subscription,
            reason="Faulty item.",
            delivery_date=timezone.localdate() - timedelta(days=1),
        )

    def test_admin_sees_every_customers_requests(self):
        self._make_request()
        self._make_request(customer=self.other_customer, lucky_number=9)
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(reverse("refund-admin-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        self.assertIn("customer_name", response.data["results"][0])

    def test_admin_list_is_refused_to_customers(self):
        """The processing queue exposes every customer's return history."""
        self._make_request()

        response = self.client.get(reverse("refund-admin-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_status_filter_narrows_the_queue(self):
        self._make_request()
        self.client.force_authenticate(user=self.admin)

        matching = self.client.get(reverse("refund-admin-list"), {"status": "WITHIN_WINDOW"})
        other = self.client.get(reverse("refund-admin-list"), {"status": "REJECTED"})

        self.assertEqual(matching.data["count"], 1)
        self.assertEqual(other.data["count"], 0)


class RefundAuthTests(APITestCase):
    def test_anonymous_access_is_refused(self):
        response = self.client.get(reverse("refund-history"))
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_user_without_a_customer_profile_gets_404(self):
        self.client.force_authenticate(
            user=create_admin_user(username="ref_noprofile", phone="9000008019")
        )

        response = self.client.get(reverse("refund-history"))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
