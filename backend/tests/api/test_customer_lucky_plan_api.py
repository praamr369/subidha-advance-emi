"""Customer-facing lucky plan endpoints.

Deliberately narrow: only eligibility, lucky-id and waiver-history. draw-results,
draw-audit and verify-seed duplicate working endpoints, and in a cryptographic
draw a second implementation is an integrity problem.

The frozen-snapshot rule is the substance. Once a batch's entries are locked
into a DrawEligibilitySnapshot, that snapshot decides who is in the draw — not
the live filter. Telling a customer they are eligible when the frozen draw
excludes them would be a promise the draw cannot keep, and EMI waivers turn on
the outcome.
"""
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from lucky_plan.models import DrawEligibilitySnapshot, LuckyDraw, LuckyIdStatus
from payments.models import EmiWaiverSettlement
from subscriptions.enums import SubscriptionStatus
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


class LuckyPlanTestCase(APITestCase):
    def setUp(self):
        self.user = create_customer_user(username="lp_user", phone="9000009001")
        self.customer = create_customer_profile(
            user=self.user, name="Lucky Customer", phone="9000009001"
        )
        self.other_user = create_customer_user(username="lp_other", phone="9000009002")
        self.other_customer = create_customer_profile(
            user=self.other_user, name="Other Customer", phone="9000009002"
        )
        self.product = create_product(
            name="Lucky Sofa", product_code="TP-LUCKY", base_price=Decimal("15000.00")
        )
        self.batch = create_batch()
        self.client.force_authenticate(user=self.user)

    def _subscription(self, *, customer=None, lucky_number=1, assign=True, **kwargs):
        """Subscription.clean() requires the lucky ID to be AVAILABLE.

        Assignment is part of creating the subscription, so the ID is created
        available and only moved to ASSIGNED afterwards.
        """
        lucky_id = create_lucky_id(batch=self.batch, lucky_number=lucky_number)
        subscription = create_subscription(
            customer=customer or self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=lucky_id,
            **kwargs,
        )
        if assign:
            lucky_id.status = LuckyIdStatus.ASSIGNED
            lucky_id.save(update_fields=["status"])
            subscription.refresh_from_db()
        return subscription

    def _snapshot(self, subscription, *, version=1, sort_order=1):
        """A complete snapshot row.

        DrawEligibilitySnapshot denormalises customer, lucky_id and product and
        carries a row_hash, so a partial row will not save.
        """
        return DrawEligibilitySnapshot.objects.create(
            batch=self.batch,
            subscription=subscription,
            customer=subscription.customer,
            lucky_id=subscription.lucky_id,
            product=subscription.product,
            snapshot_version=version,
            sort_order=sort_order,
            row_hash=f"test-hash-{subscription.id}-{version}",
        )


class EligibilityTests(LuckyPlanTestCase):
    def test_active_subscription_with_assigned_id_is_eligible(self):
        self._subscription()

        response = self.client.get(reverse("lucky-plan-eligibility"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_eligible"])
        self.assertEqual(response.data["lucky_id"], 1)

    def test_inactive_subscription_is_not_eligible_and_says_why(self):
        self._subscription(status=SubscriptionStatus.CANCELLED)

        response = self.client.get(reverse("lucky-plan-eligibility"))

        self.assertFalse(response.data["is_eligible"])
        self.assertIn("CANCELLED", response.data["reason"])

    def test_unassigned_lucky_id_is_not_eligible(self):
        """Exercises the view's defensive branch.

        Subscription.save() auto-assigns the lucky ID for EMI plans, so this
        state is not reachable by creating a subscription — it is forced here.
        The branch still matters: an ID released back to AVAILABLE after a
        reassignment would land in exactly this state.
        """
        subscription = self._subscription()
        subscription.lucky_id.status = LuckyIdStatus.AVAILABLE
        subscription.lucky_id.save(update_fields=["status"])

        response = self.client.get(reverse("lucky-plan-eligibility"))

        self.assertFalse(response.data["is_eligible"])
        self.assertIn("not assigned", response.data["reason"])

    def test_account_with_no_emi_subscription(self):
        response = self.client.get(reverse("lucky-plan-eligibility"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["is_eligible"])
        self.assertIsNone(response.data["subscription_status"])

    def test_frozen_snapshot_overrides_the_live_filter_when_included(self):
        """Once entries are locked, the snapshot decides."""
        subscription = self._subscription()
        self._snapshot(subscription)
        # Would fail the live filter, but the snapshot already locked them in.
        subscription.status = SubscriptionStatus.CANCELLED
        subscription.save(update_fields=["status"])

        response = self.client.get(reverse("lucky-plan-eligibility"))

        self.assertTrue(response.data["is_eligible"])
        self.assertIn("Entered", response.data["reason"])

    def test_frozen_snapshot_excludes_a_subscription_that_passes_the_live_filter(self):
        """The dangerous direction: live-eligible but not in the locked draw.

        Reporting eligibility here would promise entry into a draw that cannot
        include them.
        """
        included = self._subscription(lucky_number=1)
        mine = self._subscription(
            customer=self.customer, lucky_number=2
        )  # active, assigned — passes the live filter
        self._snapshot(included)

        response = self.client.get(reverse("lucky-plan-eligibility"))

        # The most recent subscription is the one reported, and it is absent
        # from the snapshot.
        self.assertEqual(response.data["subscription_id"], mine.id)
        self.assertFalse(response.data["is_eligible"])
        self.assertIn("locked", response.data["reason"])

    def test_latest_snapshot_version_wins(self):
        subscription = self._subscription()
        self._snapshot(subscription, version=1)
        # A re-freeze that drops them.
        other = self._subscription(customer=self.other_customer, lucky_number=5)
        self._snapshot(other, version=2)

        response = self.client.get(reverse("lucky-plan-eligibility"))

        self.assertFalse(response.data["is_eligible"])

    def test_paid_and_overdue_amounts_are_reported(self):
        subscription = self._subscription()
        create_emi(subscription=subscription, month_no=1, status="PAID")
        create_emi(subscription=subscription, month_no=2, status="OVERDUE")

        response = self.client.get(reverse("lucky-plan-eligibility"))

        self.assertEqual(Decimal(response.data["paid_amount"]), Decimal("1000.00"))
        self.assertEqual(Decimal(response.data["overdue_amount"]), Decimal("1000.00"))


class LuckyIdTrackerTests(LuckyPlanTestCase):
    def test_returns_the_customers_lucky_id(self):
        self._subscription(lucky_number=42)

        response = self.client.get(reverse("lucky-plan-lucky-id"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["has_lucky_id"])
        self.assertEqual(response.data["lucky_id"], 42)
        self.assertFalse(response.data["is_winner"])

    def test_won_status_is_reported_as_winner(self):
        """WON is the draw's own record; it is read, not recomputed."""
        subscription = self._subscription(lucky_number=7)
        subscription.lucky_id.status = LuckyIdStatus.WON
        subscription.lucky_id.save(update_fields=["status"])

        response = self.client.get(reverse("lucky-plan-lucky-id"))

        self.assertTrue(response.data["is_winner"])

    def test_account_without_a_lucky_id(self):
        response = self.client.get(reverse("lucky-plan-lucky-id"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["has_lucky_id"])

    def test_another_customers_lucky_id_is_not_returned(self):
        self._subscription(customer=self.other_customer, lucky_number=9)

        response = self.client.get(reverse("lucky-plan-lucky-id"))

        self.assertFalse(response.data["has_lucky_id"])


class WaiverHistoryTests(LuckyPlanTestCase):
    def _draw(self):
        """EmiWaiverSettlement.lucky_draw and .settled_by are both non-null."""
        if not hasattr(self, "_draw_cache"):
            # draw_month is a PositiveIntegerField — the month *number* within
            # the batch's duration, not a date. It must be > 0 and <= the
            # batch's duration_months.
            self._draw_cache = LuckyDraw.objects.create(
                batch=self.batch,
                committed_hash="0" * 64,
                draw_month=1,
            )
        return self._draw_cache

    def _staff(self):
        if not hasattr(self, "_staff_cache"):
            self._staff_cache = create_admin_user(
                username="lp_settler", phone="9000009019"
            )
        return self._staff_cache

    def _waiver(self, subscription, amount="1000.00", month_no=1):
        emi = create_emi(subscription=subscription, month_no=month_no)
        return EmiWaiverSettlement.objects.create(
            lucky_draw=self._draw(),
            subscription=subscription,
            emi=emi,
            waived_amount=Decimal(amount),
            settlement_date=timezone.localdate(),
            settled_by=self._staff(),
        )

    def test_lists_only_my_waivers(self):
        mine = self._subscription(lucky_number=1)
        theirs = self._subscription(customer=self.other_customer, lucky_number=9)
        self._waiver(mine)
        self._waiver(theirs)

        response = self.client.get(reverse("lucky-plan-waiver-history"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_total_waived_is_summed_across_settlements(self):
        subscription = self._subscription()
        self._waiver(subscription, "1000.00", month_no=1)
        self._waiver(subscription, "500.00", month_no=2)

        response = self.client.get(reverse("lucky-plan-waiver-history"))

        self.assertEqual(response.data["count"], 2)
        self.assertEqual(Decimal(response.data["total_waived_amount"]), Decimal("1500.00"))

    def test_empty_history_is_zero_not_null(self):
        response = self.client.get(reverse("lucky-plan-waiver-history"))

        self.assertEqual(response.data["count"], 0)
        self.assertEqual(Decimal(response.data["total_waived_amount"]), Decimal("0.00"))


class LuckyPlanAuthTests(APITestCase):
    def test_anonymous_access_is_refused(self):
        for name in (
            "lucky-plan-eligibility",
            "lucky-plan-lucky-id",
            "lucky-plan-waiver-history",
        ):
            with self.subTest(endpoint=name):
                response = self.client.get(reverse(name))
                self.assertIn(
                    response.status_code,
                    (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
                )

    def test_user_without_a_customer_profile_gets_404(self):
        self.client.force_authenticate(
            user=create_admin_user(username="lp_admin", phone="9000009009")
        )

        response = self.client.get(reverse("lucky-plan-eligibility"))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
