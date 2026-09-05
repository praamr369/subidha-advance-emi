"""Customer-facing warranty endpoints.

These pages have existed since July 2026 and every request 404'd — the routes
were never written. The admin warranty surface existed all along; only the
customer half was missing.

Coverage dates are the substance here: a warranty that starts on the wrong date
either denies a customer cover they paid for, or grants cover the business
never sold.
"""
from datetime import date, timedelta
from unittest.mock import patch
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from deliveries.models import Delivery, DeliveryStatus
from service_desk.models import WarrantyClaim, WarrantyExtendedPlan
from service_desk.services.warranty_coverage_service import _add_months, build_coverage
from tests.helpers import (
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_lucky_id,
    create_product,
    create_subscription,
)


class WarrantyTestCase(APITestCase):
    def setUp(self):
        self.user = create_customer_user(username="warr_user", phone="9000007001")
        self.customer = create_customer_profile(
            user=self.user, name="Warranty Customer", phone="9000007001"
        )
        self.other_user = create_customer_user(username="warr_other", phone="9000007002")
        self.other_customer = create_customer_profile(
            user=self.other_user, name="Other Customer", phone="9000007002"
        )
        self.product = create_product(
            name="Warranty Sofa", product_code="TP-WARR", base_price=Decimal("20000.00")
        )
        self.product.warranty_enabled = True
        self.product.warranty_months_manufacturing = 12
        self.product.warranty_months_structural = 24
        self.product.warranty_months_extended_max = 24
        self.product.extended_warranty_cost_percentage = Decimal("5.00")
        self.product.save()
        self.batch = create_batch()
        self.client.force_authenticate(user=self.user)

    def _subscription(self, customer=None, lucky_number=1):
        customer = customer or self.customer
        return create_subscription(
            customer=customer,
            product=self.product,
            batch=self.batch,
            lucky_id=create_lucky_id(batch=self.batch, lucky_number=lucky_number),
        )

    def _deliver(self, subscription, delivered_on: date):
        return Delivery.objects.create(
            subscription=subscription,
            status=DeliveryStatus.DELIVERED,
            scheduled_date=delivered_on,
            delivered_date=delivered_on,
        )


class AddMonthsTests(APITestCase):
    """Month arithmetic decides when cover ends, so it is pinned directly."""

    def test_clamps_to_end_of_shorter_month(self):
        self.assertEqual(_add_months(date(2026, 8, 31), 6), date(2027, 2, 28))

    def test_handles_leap_february(self):
        self.assertEqual(_add_months(date(2027, 8, 31), 6), date(2028, 2, 29))

    def test_same_day_next_year(self):
        self.assertEqual(_add_months(date(2026, 1, 15), 12), date(2027, 1, 15))

    def test_zero_months_is_the_start_date(self):
        self.assertEqual(_add_months(date(2026, 5, 10), 0), date(2026, 5, 10))


class WarrantyCheckTests(WarrantyTestCase):
    def test_coverage_runs_from_delivery_not_signup(self):
        """An advance-EMI customer may pay for months before delivery.

        Starting the clock at signup would silently eat the cover they bought.
        """
        subscription = self._subscription()
        delivered = timezone.localdate() - timedelta(days=30)
        self._deliver(subscription, delivered)

        response = self.client.get(reverse("warranty-check", args=[self.product.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["purchase_date"], delivered.isoformat())
        self.assertEqual(response.data["coverage_basis"], "DELIVERED")
        self.assertEqual(
            response.data["manufacturing_expiry"], _add_months(delivered, 12).isoformat()
        )
        self.assertTrue(response.data["is_manufacturing_active"])

    def test_undelivered_product_reports_no_started_cover(self):
        self._subscription()

        response = self.client.get(reverse("warranty-check", args=[self.product.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["purchase_date"])
        self.assertEqual(response.data["coverage_basis"], "AWAITING_DELIVERY")
        self.assertFalse(response.data["is_manufacturing_active"])

    def test_expired_manufacturing_but_active_structural(self):
        subscription = self._subscription()
        self._deliver(subscription, timezone.localdate() - timedelta(days=400))

        response = self.client.get(reverse("warranty-check", args=[self.product.id]))

        self.assertFalse(response.data["is_manufacturing_active"])
        self.assertTrue(response.data["is_structural_active"])

    def test_disabled_warranty_is_never_active(self):
        self.product.warranty_enabled = False
        self.product.save()
        subscription = self._subscription()
        self._deliver(subscription, timezone.localdate())

        response = self.client.get(reverse("warranty-check", args=[self.product.id]))

        self.assertFalse(response.data["warranty_enabled"])
        self.assertFalse(response.data["is_manufacturing_active"])
        self.assertFalse(response.data["is_structural_active"])

    def test_expiry_day_itself_is_still_covered(self):
        """The boundary decides whether a last-day claim is honoured.

        Asserted at service level with fixed dates rather than through the API
        with today's date: deriving "exactly 12 months ago" from today has no
        valid answer on 29 February, which would make this fail once every four
        years for reasons unrelated to the rule being tested.
        """
        subscription = self._subscription()
        delivered = date(2026, 3, 15)
        self._deliver(subscription, delivered)
        expiry = _add_months(delivered, 12)

        for today, expected_active in (
            (expiry - timedelta(days=1), True),
            (expiry, True),  # the boundary: last day is still covered
            (expiry + timedelta(days=1), False),
        ):
            with self.subTest(today=today):
                with patch(
                    "service_desk.services.warranty_coverage_service.timezone.localdate",
                    return_value=today,
                ):
                    coverage = build_coverage(
                        product=self.product, subscription=subscription
                    )

                self.assertEqual(coverage.manufacturing_expiry, expiry)
                self.assertEqual(coverage.is_manufacturing_active, expected_active)

    def test_product_the_customer_does_not_own_is_404(self):
        # create_product defaults product_code to "TP-001", so a second product
        # needs an explicit code or it collides with the one in setUp.
        other_product = create_product(
            name="Not Mine", product_code="TP-NOTMINE", base_price=Decimal("500.00")
        )

        response = self.client.get(reverse("warranty-check", args=[other_product.id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_another_customers_subscription_does_not_grant_coverage(self):
        self._subscription(customer=self.other_customer, lucky_number=9)

        response = self.client.get(reverse("warranty-check", args=[self.product.id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class WarrantyClaimTests(WarrantyTestCase):
    def test_filing_creates_a_claim_and_its_service_case(self):
        """WarrantyClaim.service_case is a non-null OneToOne."""
        subscription = self._subscription()
        self._deliver(subscription, timezone.localdate() - timedelta(days=10))

        response = self.client.post(
            reverse("warranty-claim-create"),
            {
                "subscription_id": subscription.id,
                "defect_description": "Frame joint has split.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        claim = WarrantyClaim.objects.get(pk=response.data["id"])
        self.assertIsNotNone(claim.service_case)
        self.assertEqual(claim.claim_status, "SUBMITTED")
        self.assertTrue(claim.is_in_warranty)
        self.assertEqual(claim.defect_classification, "UNVERIFIED")

    def test_out_of_warranty_claim_is_recorded_not_refused(self):
        """The customer is entitled to a decision and a record.

        is_in_warranty carries the honest answer for staff to assess.
        """
        subscription = self._subscription()
        self._deliver(subscription, timezone.localdate() - timedelta(days=1200))

        response = self.client.post(
            reverse("warranty-claim-create"),
            {"subscription_id": subscription.id, "defect_description": "Fabric torn."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data["is_in_warranty"])

    def test_claim_before_delivery_is_rejected(self):
        subscription = self._subscription()

        response = self.client.post(
            reverse("warranty-claim-create"),
            {"subscription_id": subscription.id, "defect_description": "Broken."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["coverage_basis"], "AWAITING_DELIVERY")

    def test_cannot_claim_against_another_customers_subscription(self):
        theirs = self._subscription(customer=self.other_customer, lucky_number=9)
        self._deliver(theirs, timezone.localdate())

        response = self.client.post(
            reverse("warranty-claim-create"),
            {"subscription_id": theirs.id, "defect_description": "Mine, honest."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(WarrantyClaim.objects.count(), 0)

    def test_description_is_required(self):
        subscription = self._subscription()

        response = self.client.post(
            reverse("warranty-claim-create"),
            {"subscription_id": subscription.id, "defect_description": "   "},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_claim_status_is_scoped_to_the_owner(self):
        theirs_sub = self._subscription(customer=self.other_customer, lucky_number=9)
        self._deliver(theirs_sub, timezone.localdate())
        self.client.force_authenticate(user=self.other_user)
        created = self.client.post(
            reverse("warranty-claim-create"),
            {"subscription_id": theirs_sub.id, "defect_description": "Theirs."},
            format="json",
        )
        claim_id = created.data["id"]

        self.client.force_authenticate(user=self.user)
        response = self.client.get(reverse("warranty-claim-status", args=[claim_id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_service_history_lists_only_my_claims(self):
        mine = self._subscription()
        self._deliver(mine, timezone.localdate())
        self.client.post(
            reverse("warranty-claim-create"),
            {"subscription_id": mine.id, "defect_description": "Mine."},
            format="json",
        )

        response = self.client.get(reverse("warranty-service-history"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)


class ExtendedWarrantyTests(WarrantyTestCase):
    def test_plans_are_offered_up_to_the_configured_maximum(self):
        subscription = self._subscription()
        self._deliver(subscription, timezone.localdate())

        response = self.client.get(
            reverse("warranty-extended-plans", args=[self.product.id])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        months = [p["plan_duration_months"] for p in response.data["plans"]]
        self.assertEqual(months, [12, 24])  # 36 exceeds the 24-month max

    def test_extended_cover_starts_when_the_base_warranty_ends(self):
        """Otherwise the customer pays for months they already have."""
        subscription = self._subscription()
        delivered = timezone.localdate()
        self._deliver(subscription, delivered)

        response = self.client.post(
            reverse("warranty-enroll-extended"),
            {"subscription_id": subscription.id, "plan_duration_months": 12},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        expected_start = _add_months(delivered, 12)
        self.assertEqual(response.data["coverage_start_date"], expected_start.isoformat())
        self.assertEqual(
            response.data["coverage_end_date"], _add_months(expected_start, 12).isoformat()
        )

    def test_enrolment_is_pending_payment_not_active_cover(self):
        subscription = self._subscription()
        self._deliver(subscription, timezone.localdate())

        response = self.client.post(
            reverse("warranty-enroll-extended"),
            {"subscription_id": subscription.id, "plan_duration_months": 12},
            format="json",
        )

        self.assertEqual(response.data["payment_status"], "PENDING")

    def test_duration_above_the_maximum_is_rejected(self):
        subscription = self._subscription()
        self._deliver(subscription, timezone.localdate())

        response = self.client.post(
            reverse("warranty-enroll-extended"),
            {"subscription_id": subscription.id, "plan_duration_months": 60},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(WarrantyExtendedPlan.objects.count(), 0)

    def test_double_enrolment_is_rejected(self):
        subscription = self._subscription()
        self._deliver(subscription, timezone.localdate())
        payload = {"subscription_id": subscription.id, "plan_duration_months": 12}
        self.client.post(reverse("warranty-enroll-extended"), payload, format="json")

        response = self.client.post(
            reverse("warranty-enroll-extended"), payload, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(WarrantyExtendedPlan.objects.count(), 1)

    def test_cannot_enrol_before_delivery(self):
        subscription = self._subscription()

        response = self.client.post(
            reverse("warranty-enroll-extended"),
            {"subscription_id": subscription.id, "plan_duration_months": 12},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_product_without_extended_cover_offers_nothing(self):
        self.product.warranty_months_extended_max = 0
        self.product.save()
        subscription = self._subscription()
        self._deliver(subscription, timezone.localdate())

        response = self.client.get(
            reverse("warranty-extended-plans", args=[self.product.id])
        )

        self.assertFalse(response.data["available"])
        self.assertEqual(response.data["plans"], [])


class WarrantyAuthTests(APITestCase):
    def test_anonymous_access_is_refused(self):
        response = self.client.get(reverse("warranty-service-history"))
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_user_without_a_customer_profile_gets_404(self):
        from tests.helpers import create_admin_user

        self.client.force_authenticate(
            user=create_admin_user(username="warr_admin", phone="9000007009")
        )

        response = self.client.get(reverse("warranty-service-history"))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
