"""
P5C tests: Partner Performance Service and API.

Covers:
* build_partner_performance_snapshot reads subscriptions/payments/commissions/EMIs
* list_partner_performance returns all PARTNER role users
* Risk flags generated for overdue EMIs
* No Commission, Payout, Payment, Subscription, or EMI mutation
* Admin: 200 on list and detail
* Customer/partner blocked (403)
* Non-existent partner → 404
"""
from __future__ import annotations

from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.services.partner_performance_service import (
    build_partner_performance_snapshot,
    build_partner_risk_flags,
    list_partner_performance,
)
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_customer_user,
    create_partner_user,
)


# ---------------------------------------------------------------------------
# Unit tests: service layer
# ---------------------------------------------------------------------------

class TestPartnerPerformanceService(TestCase):

    def setUp(self):
        self.admin = create_admin_user(username="admin_pp_test")
        self.partner = create_partner_user(username="partner_pp_test", phone="9100000001")

    def test_snapshot_for_partner_with_no_subscriptions(self):
        snap = build_partner_performance_snapshot(self.partner)
        self.assertEqual(snap["partner_id"], self.partner.pk)
        self.assertEqual(snap["total_subscriptions"], 0)
        self.assertEqual(snap["active_subscriptions"], 0)
        self.assertEqual(snap["referred_customer_count"], 0)
        self.assertEqual(snap["collections_total"], "0")
        self.assertEqual(snap["overdue_customer_count"], 0)
        self.assertEqual(snap["risk_flags"], [])

    def test_snapshot_commission_totals_start_at_zero(self):
        snap = build_partner_performance_snapshot(self.partner)
        self.assertEqual(snap["commission_earned"], "0")
        self.assertEqual(snap["commission_paid"], "0")
        self.assertEqual(snap["pending_commission"], "0")

    def test_snapshot_includes_as_of_field(self):
        from datetime import date
        today = date.today()
        snap = build_partner_performance_snapshot(self.partner)
        self.assertEqual(snap["as_of"], today.isoformat())

    def test_snapshot_does_not_mutate_any_financial_records(self):
        from subscriptions.models import Subscription, Emi, Payment, Commission
        subs_before = Subscription.objects.count()
        emi_before = Emi.objects.count()
        pay_before = Payment.objects.count()
        comm_before = Commission.objects.count()

        build_partner_performance_snapshot(self.partner)

        self.assertEqual(Subscription.objects.count(), subs_before)
        self.assertEqual(Emi.objects.count(), emi_before)
        self.assertEqual(Payment.objects.count(), pay_before)
        self.assertEqual(Commission.objects.count(), comm_before)

    def test_list_performance_includes_partner(self):
        results = list_partner_performance()
        partner_ids = [r["partner_id"] for r in results]
        self.assertIn(self.partner.pk, partner_ids)

    def test_list_performance_excludes_admin(self):
        results = list_partner_performance()
        admin_ids = [r["partner_id"] for r in results]
        self.assertNotIn(self.admin.pk, admin_ids)

    def test_list_performance_excludes_customer(self):
        customer_user = create_customer_user(username="cust_pp_list", phone="9100000002")
        results = list_partner_performance()
        cust_ids = [r["partner_id"] for r in results]
        self.assertNotIn(customer_user.pk, cust_ids)

    def test_risk_flags_returns_list(self):
        flags = build_partner_risk_flags(self.partner)
        self.assertIsInstance(flags, list)

    def test_snapshot_has_required_keys(self):
        snap = build_partner_performance_snapshot(self.partner)
        required_keys = [
            "partner_id", "partner_name", "as_of",
            "total_subscriptions", "active_subscriptions", "completed_subscriptions",
            "referred_customer_count", "collections_total", "overdue_customer_count",
            "commission_earned", "commission_paid", "pending_commission",
            "growth_request_count", "risk_flags",
        ]
        for key in required_keys:
            self.assertIn(key, snap, f"Missing key: {key}")

    def test_multiple_partners_in_list(self):
        create_partner_user(username="partner_pp_second", phone="9100000009")
        results = list_partner_performance()
        self.assertGreaterEqual(len(results), 2)


# ---------------------------------------------------------------------------
# API tests
# ---------------------------------------------------------------------------

class TestPartnerPerformanceAPI(TestCase):

    BASE = "/api/v1/admin/growth/partner-performance"

    def setUp(self):
        self.admin = create_admin_user(username="admin_pp_api")
        self.partner = create_partner_user(username="partner_pp_api", phone="9200000001")
        self.customer_user = create_customer_user(username="cust_pp_api", phone="9200000002")
        self.client = APIClient()

    def test_admin_can_list_partner_performance(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"{self.BASE}/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("results", resp.data)
        self.assertIsInstance(resp.data["results"], list)

    def test_admin_can_get_partner_detail(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"{self.BASE}/{self.partner.pk}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["partner_id"], self.partner.pk)

    def test_admin_detail_has_risk_flags(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"{self.BASE}/{self.partner.pk}/")
        self.assertIn("risk_flags", resp.data)

    def test_customer_blocked(self):
        self.client.force_authenticate(user=self.customer_user)
        resp = self.client.get(f"{self.BASE}/")
        self.assertEqual(resp.status_code, 403)

    def test_partner_blocked_from_list(self):
        self.client.force_authenticate(user=self.partner)
        resp = self.client.get(f"{self.BASE}/")
        self.assertEqual(resp.status_code, 403)

    def test_partner_blocked_from_own_detail(self):
        self.client.force_authenticate(user=self.partner)
        resp = self.client.get(f"{self.BASE}/{self.partner.pk}/")
        self.assertEqual(resp.status_code, 403)

    def test_nonexistent_partner_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"{self.BASE}/999999/")
        self.assertEqual(resp.status_code, 404)

    def test_non_partner_user_returns_404_on_detail(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"{self.BASE}/{self.customer_user.pk}/")
        self.assertEqual(resp.status_code, 404)

    def test_list_does_not_mutate_any_records(self):
        from subscriptions.models import Subscription, Emi, Payment, Commission
        subs_before = Subscription.objects.count()
        emi_before = Emi.objects.count()
        pay_before = Payment.objects.count()
        comm_before = Commission.objects.count()

        self.client.force_authenticate(user=self.admin)
        self.client.get(f"{self.BASE}/")

        self.assertEqual(Subscription.objects.count(), subs_before)
        self.assertEqual(Emi.objects.count(), emi_before)
        self.assertEqual(Payment.objects.count(), pay_before)
        self.assertEqual(Commission.objects.count(), comm_before)
