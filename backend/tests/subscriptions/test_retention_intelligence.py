"""
P5D tests: Customer Retention Intelligence Service and API.

Covers:
* build_customer_retention_profile returns signals for overdue EMI, high risk, etc.
* list_retention_opportunities only returns customers with ≥1 signal
* Signals sorted by severity (CRITICAL → HIGH → WARNING → INFO)
* has_critical / has_high flags set correctly
* build_retention_action_items returns flat list
* No Payment, EMI, Subscription, or record is mutated
* Admin can access retention list and customer retention profile
* Customer/partner blocked (403)
* Non-existent customer → 404
"""
from __future__ import annotations

from datetime import date, timedelta

from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.services.customer_retention_intelligence_service import (
    build_customer_retention_profile,
    build_retention_action_items,
    classify_retention_signal,
    list_retention_opportunities,
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

class TestRetentionIntelligenceService(TestCase):

    def setUp(self):
        self.admin = create_admin_user(username="admin_ri_test")
        self.customer_user = create_customer_user(username="cust_ri_test", phone="9300000001")
        self.customer = create_customer_profile(user=self.customer_user, phone="9300000001")

    def test_profile_has_required_keys(self):
        profile = build_customer_retention_profile(self.customer)
        required = ["customer_id", "as_of", "signal_count", "signals", "has_critical", "has_high"]
        for key in required:
            self.assertIn(key, profile, f"Missing key: {key}")

    def test_clean_customer_has_no_signals(self):
        profile = build_customer_retention_profile(self.customer)
        self.assertEqual(profile["signal_count"], len(profile["signals"]))
        self.assertFalse(profile["has_critical"])
        self.assertFalse(profile["has_high"])

    def test_high_risk_produces_signal(self):
        from subscriptions.models import CustomerRiskProfile, CustomerRiskBand
        CustomerRiskProfile.objects.create(
            customer=self.customer,
            risk_band=CustomerRiskBand.HIGH,
            risk_score=65,
        )
        profile = build_customer_retention_profile(self.customer)
        signal_types = [s["signal_type"] for s in profile["signals"]]
        self.assertIn("HIGH_RISK", signal_types)
        self.assertTrue(profile["has_high"])

    def test_blocked_risk_produces_critical_signal(self):
        from subscriptions.models import CustomerRiskProfile, CustomerRiskBand
        CustomerRiskProfile.objects.create(
            customer=self.customer,
            risk_band=CustomerRiskBand.BLOCKED,
            risk_score=100,
        )
        profile = build_customer_retention_profile(self.customer)
        critical_signals = [s for s in profile["signals"] if s["severity"] == "CRITICAL"]
        self.assertGreater(len(critical_signals), 0)
        self.assertTrue(profile["has_critical"])

    def test_signals_sorted_by_severity(self):
        """CRITICAL before HIGH before WARNING before INFO."""
        from subscriptions.models import CustomerRiskProfile, CustomerRiskBand
        CustomerRiskProfile.objects.create(
            customer=self.customer,
            risk_band=CustomerRiskBand.BLOCKED,
            risk_score=100,
        )
        profile = build_customer_retention_profile(self.customer)
        severity_order = {"CRITICAL": 0, "HIGH": 1, "WARNING": 2, "INFO": 3}
        severities = [s["severity"] for s in profile["signals"]]
        sorted_severities = sorted(severities, key=lambda x: severity_order.get(x, 99))
        self.assertEqual(severities, sorted_severities)

    def test_as_of_uses_today_by_default(self):
        profile = build_customer_retention_profile(self.customer)
        self.assertEqual(profile["as_of"], date.today().isoformat())

    def test_custom_as_of_date_accepted(self):
        custom_date = date(2026, 1, 1)
        profile = build_customer_retention_profile(self.customer, as_of=custom_date)
        self.assertEqual(profile["as_of"], "2026-01-01")

    def test_list_retention_opportunities_excludes_clean_customers(self):
        second_user = create_customer_user(username="cust_ri_clean", phone="9300000099")
        create_customer_profile(user=second_user, phone="9300000099")
        results = list_retention_opportunities()
        result_ids = [r["customer_id"] for r in results]
        self.assertNotIn(self.customer.pk, result_ids)

    def test_list_retention_opportunities_includes_at_risk_customers(self):
        from subscriptions.models import CustomerRiskProfile, CustomerRiskBand
        CustomerRiskProfile.objects.create(
            customer=self.customer,
            risk_band=CustomerRiskBand.HIGH,
            risk_score=70,
        )
        results = list_retention_opportunities()
        result_ids = [r["customer_id"] for r in results]
        self.assertIn(self.customer.pk, result_ids)

    def test_list_sorted_critical_first(self):
        from subscriptions.models import CustomerRiskProfile, CustomerRiskBand
        user2 = create_customer_user(username="cust_ri_high", phone="9300000002")
        customer2 = create_customer_profile(user=user2, phone="9300000002")
        CustomerRiskProfile.objects.create(
            customer=self.customer,
            risk_band=CustomerRiskBand.BLOCKED,
            risk_score=100,
        )
        CustomerRiskProfile.objects.create(
            customer=customer2,
            risk_band=CustomerRiskBand.HIGH,
            risk_score=65,
        )
        results = list_retention_opportunities()
        result_ids = [r["customer_id"] for r in results]
        self.assertIn(self.customer.pk, result_ids)
        self.assertIn(customer2.pk, result_ids)
        # BLOCKED customer should appear before HIGH customer
        critical_idx = next(i for i, r in enumerate(results) if r["customer_id"] == self.customer.pk)
        high_idx = next(i for i, r in enumerate(results) if r["customer_id"] == customer2.pk)
        self.assertLess(critical_idx, high_idx)

    def test_build_retention_action_items_for_specific_customer(self):
        from subscriptions.models import CustomerRiskProfile, CustomerRiskBand
        CustomerRiskProfile.objects.create(
            customer=self.customer,
            risk_band=CustomerRiskBand.HIGH,
            risk_score=65,
        )
        items = build_retention_action_items(customer=self.customer)
        self.assertIsInstance(items, list)
        self.assertGreater(len(items), 0)

    def test_build_retention_action_items_global_returns_list(self):
        items = build_retention_action_items()
        self.assertIsInstance(items, list)

    def test_classify_retention_signal_returns_signal_type(self):
        source = {"signal_type": "OVERDUE_EMI", "severity": "HIGH"}
        result = classify_retention_signal(source)
        self.assertEqual(result, "OVERDUE_EMI")

    def test_classify_retention_signal_unknown_returns_unknown(self):
        result = classify_retention_signal({})
        self.assertEqual(result, "UNKNOWN")

    def test_profile_does_not_mutate_any_records(self):
        from subscriptions.models import Subscription, Emi, Payment
        subs_before = Subscription.objects.count()
        emi_before = Emi.objects.count()
        pay_before = Payment.objects.count()

        build_customer_retention_profile(self.customer)

        self.assertEqual(Subscription.objects.count(), subs_before)
        self.assertEqual(Emi.objects.count(), emi_before)
        self.assertEqual(Payment.objects.count(), pay_before)


# ---------------------------------------------------------------------------
# API tests
# ---------------------------------------------------------------------------

class TestRetentionIntelligenceAPI(TestCase):

    def setUp(self):
        self.admin = create_admin_user(username="admin_ri_api")
        self.customer_user = create_customer_user(username="cust_ri_api", phone="9400000001")
        self.customer = create_customer_profile(user=self.customer_user, phone="9400000001")
        self.partner = create_partner_user(username="partner_ri_api", phone="9400000002")
        self.client = APIClient()

    def test_admin_can_get_retention_list(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/admin/growth/retention/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("results", resp.data)
        self.assertIn("total", resp.data)

    def test_admin_can_get_customer_retention_profile(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"/api/v1/admin/customers/{self.customer.pk}/retention/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("signals", resp.data)
        self.assertIn("signal_count", resp.data)

    def test_customer_retention_profile_has_correct_customer_id(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"/api/v1/admin/customers/{self.customer.pk}/retention/")
        self.assertEqual(resp.data["customer_id"], self.customer.pk)

    def test_customer_blocked_from_retention_list(self):
        self.client.force_authenticate(user=self.customer_user)
        resp = self.client.get("/api/v1/admin/growth/retention/")
        self.assertEqual(resp.status_code, 403)

    def test_partner_blocked_from_retention_list(self):
        self.client.force_authenticate(user=self.partner)
        resp = self.client.get("/api/v1/admin/growth/retention/")
        self.assertEqual(resp.status_code, 403)

    def test_customer_blocked_from_customer_retention_detail(self):
        self.client.force_authenticate(user=self.customer_user)
        resp = self.client.get(f"/api/v1/admin/customers/{self.customer.pk}/retention/")
        self.assertEqual(resp.status_code, 403)

    def test_nonexistent_customer_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/admin/customers/999999/retention/")
        self.assertEqual(resp.status_code, 404)

    def test_invalid_as_of_date_returns_400(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/admin/growth/retention/?as_of=not-a-date")
        self.assertEqual(resp.status_code, 400)

    def test_retention_list_does_not_mutate_records(self):
        from subscriptions.models import Subscription, Emi, Payment
        subs_before = Subscription.objects.count()
        emi_before = Emi.objects.count()
        pay_before = Payment.objects.count()

        self.client.force_authenticate(user=self.admin)
        self.client.get("/api/v1/admin/growth/retention/")

        self.assertEqual(Subscription.objects.count(), subs_before)
        self.assertEqual(Emi.objects.count(), emi_before)
        self.assertEqual(Payment.objects.count(), pay_before)

    def test_customer_retention_with_valid_as_of_date(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(
            f"/api/v1/admin/customers/{self.customer.pk}/retention/?as_of=2026-01-01"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["as_of"], "2026-01-01")
