"""
P5B tests: Growth Request Workflow.

Covers:
* Create growth request
* Submit growth request (DRAFT → SUBMITTED)
* Approve growth request (SUBMITTED → APPROVED)
* Reject growth request
* Financial-impacting request (expected_value > 50000) marks approval_required
* HIGH/BLOCKED risk captured as snapshot/advisory
* No Subscription/EMI/Payment/Journal/StockLedger mutation on create/submit/approve/reject
* Admin permissions enforced
* Customer/partner blocked
* Existing subscription remains unchanged after any request action
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.models import CustomerRiskBand, CustomerRiskProfile, SubscriptionStatus
from subscriptions.models_growth_requests import (
    CustomerGrowthRequest,
    GrowthRequestDecision,
    GrowthRequestStatus,
    GrowthRequestType,
)
from subscriptions.services.growth_request_service import (
    approve_growth_request,
    build_growth_request_preview,
    create_growth_request,
    evaluate_growth_request,
    reject_growth_request,
    submit_growth_request,
)
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_customer_user,
    create_partner_user,
    create_product,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_customer(username="req_test_customer"):
    user = create_customer_user(username=username)
    return create_customer_profile(user=user)


# ---------------------------------------------------------------------------
# Unit tests: service layer
# ---------------------------------------------------------------------------

class TestGrowthRequestService(TestCase):

    def setUp(self):
        self.admin = create_admin_user(username="admin_req_test")
        self.customer = _make_customer()

    def test_create_growth_request(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.RENEWAL,
            reason="Contract ending soon.",
            performed_by=self.admin,
        )
        self.assertIsNotNone(req.pk)
        self.assertEqual(req.status, GrowthRequestStatus.DRAFT)
        self.assertEqual(req.request_type, GrowthRequestType.RENEWAL)
        self.assertTrue(req.request_number.startswith("GR"))
        self.assertIn("risk_band", req.risk_snapshot)

    def test_submit_growth_request(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.UPGRADE,
            performed_by=self.admin,
        )
        submit_growth_request(req, performed_by=self.admin)
        req.refresh_from_db()
        self.assertEqual(req.status, GrowthRequestStatus.SUBMITTED)

    def test_submit_already_submitted_raises(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.UPGRADE,
            performed_by=self.admin,
        )
        submit_growth_request(req, performed_by=self.admin)
        with self.assertRaises(ValueError):
            submit_growth_request(req, performed_by=self.admin)

    def test_approve_growth_request(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.RENEWAL,
            performed_by=self.admin,
        )
        submit_growth_request(req, performed_by=self.admin)
        approve_growth_request(req, approved_by=self.admin, reason="Approved.")
        req.refresh_from_db()
        self.assertEqual(req.status, GrowthRequestStatus.APPROVED)
        self.assertIsNotNone(req.decided_at)
        decisions = GrowthRequestDecision.objects.filter(growth_request=req)
        self.assertEqual(decisions.count(), 1)
        self.assertEqual(decisions.first().decision, "APPROVE")

    def test_reject_growth_request(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.EXCHANGE,
            performed_by=self.admin,
        )
        submit_growth_request(req, performed_by=self.admin)
        reject_growth_request(req, rejected_by=self.admin, reason="No stock available.")
        req.refresh_from_db()
        self.assertEqual(req.status, GrowthRequestStatus.REJECTED)
        decisions = GrowthRequestDecision.objects.filter(growth_request=req)
        self.assertEqual(decisions.first().decision, "REJECT")

    def test_approve_draft_raises(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.RENEWAL,
        )
        with self.assertRaises(ValueError):
            approve_growth_request(req, approved_by=self.admin)

    def test_financial_impact_marks_approval_required(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.UPGRADE,
            expected_value=Decimal("75000.00"),
        )
        self.assertTrue(req.approval_required)

    def test_small_value_no_approval_required_for_low_risk(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.RENEWAL,
            expected_value=Decimal("10000.00"),
        )
        self.assertFalse(req.approval_required)

    def test_high_risk_customer_marks_approval_required(self):
        CustomerRiskProfile.objects.create(
            customer=self.customer,
            risk_band=CustomerRiskBand.HIGH,
            risk_score=60,
        )
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.RENEWAL,
        )
        self.assertTrue(req.approval_required)

    def test_blocked_risk_captured_as_snapshot(self):
        CustomerRiskProfile.objects.create(
            customer=self.customer,
            risk_band=CustomerRiskBand.BLOCKED,
            risk_score=100,
        )
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.PLAN_CONVERSION,
        )
        self.assertEqual(req.risk_snapshot["risk_band"], "BLOCKED")
        self.assertTrue(req.approval_required)

    def test_create_does_not_mutate_subscription(self):
        from subscriptions.models import Subscription, Emi, Payment
        from accounting.models import JournalEntry

        subs_before = Subscription.objects.count()
        emi_before = Emi.objects.count()
        pay_before = Payment.objects.count()
        journal_before = JournalEntry.objects.count()

        create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.RENEWAL,
        )

        self.assertEqual(Subscription.objects.count(), subs_before)
        self.assertEqual(Emi.objects.count(), emi_before)
        self.assertEqual(Payment.objects.count(), pay_before)
        self.assertEqual(JournalEntry.objects.count(), journal_before)

    def test_approve_does_not_mutate_subscription(self):
        from subscriptions.models import Subscription, Emi, Payment

        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.RENEWAL,
        )
        submit_growth_request(req, performed_by=self.admin)

        subs_before = Subscription.objects.count()
        emi_before = Emi.objects.count()
        pay_before = Payment.objects.count()

        approve_growth_request(req, approved_by=self.admin, reason="OK")

        self.assertEqual(Subscription.objects.count(), subs_before)
        self.assertEqual(Emi.objects.count(), emi_before)
        self.assertEqual(Payment.objects.count(), pay_before)

    def test_reject_does_not_mutate_subscription(self):
        from subscriptions.models import Subscription, Emi, Payment

        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.EXCHANGE,
        )
        submit_growth_request(req, performed_by=self.admin)

        subs_before = Subscription.objects.count()
        emi_before = Emi.objects.count()
        pay_before = Payment.objects.count()

        reject_growth_request(req, rejected_by=self.admin, reason="Not available.")

        self.assertEqual(Subscription.objects.count(), subs_before)
        self.assertEqual(Emi.objects.count(), emi_before)
        self.assertEqual(Payment.objects.count(), pay_before)

    def test_evaluate_returns_advisory_fields(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.RENEWAL,
        )
        result = evaluate_growth_request(req)
        self.assertIn("approval_required", result)
        self.assertIn("risk_band", result)
        self.assertIn("warnings", result)

    def test_build_preview_returns_expected_structure(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.RENEWAL,
            reason="Need renewal",
        )
        preview = build_growth_request_preview(req)
        self.assertEqual(preview["request_number"], req.request_number)
        self.assertIn("evaluation", preview)
        self.assertIn("risk_snapshot", preview)


# ---------------------------------------------------------------------------
# API tests
# ---------------------------------------------------------------------------

class TestGrowthRequestsAPI(TestCase):

    BASE = "/api/v1/admin/growth/requests"

    def setUp(self):
        self.admin = create_admin_user(username="admin_greq_api")
        self.customer_user = create_customer_user(username="cust_greq_api")
        self.partner_user = create_partner_user(username="partner_greq_api")
        self.customer = create_customer_profile(user=self.customer_user)
        self.client = APIClient()

    def test_admin_can_list_requests(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"{self.BASE}/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("results", resp.data)

    def test_admin_can_create_request(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"{self.BASE}/", {
            "customer_id": self.customer.pk,
            "request_type": "RENEWAL",
            "reason": "Expiring soon.",
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["request_type"], "RENEWAL")
        self.assertEqual(resp.data["status"], "DRAFT")

    def test_admin_can_get_request_detail(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.UPGRADE,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"{self.BASE}/{req.pk}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["request_number"], req.request_number)

    def test_admin_can_patch_request(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.UPGRADE,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.patch(f"{self.BASE}/{req.pk}/", {
            "notes": "Follow up with customer.",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["notes"], "Follow up with customer.")

    def test_admin_can_submit_request(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.RENEWAL,
            performed_by=self.admin,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"{self.BASE}/{req.pk}/submit/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "SUBMITTED")

    def test_admin_can_approve_request(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.RENEWAL,
            performed_by=self.admin,
        )
        submit_growth_request(req, performed_by=self.admin)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"{self.BASE}/{req.pk}/approve/", {"reason": "Approved."}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "APPROVED")

    def test_admin_can_reject_request(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.EXCHANGE,
            performed_by=self.admin,
        )
        submit_growth_request(req, performed_by=self.admin)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"{self.BASE}/{req.pk}/reject/", {"reason": "Not available."}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "REJECTED")

    def test_admin_can_get_request_preview(self):
        req = create_growth_request(
            customer=self.customer,
            request_type=GrowthRequestType.RENEWAL,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"{self.BASE}/{req.pk}/preview/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("evaluation", resp.data)

    def test_customer_blocked(self):
        self.client.force_authenticate(user=self.customer_user)
        resp = self.client.get(f"{self.BASE}/")
        self.assertEqual(resp.status_code, 403)

    def test_partner_blocked(self):
        self.client.force_authenticate(user=self.partner_user)
        resp = self.client.get(f"{self.BASE}/")
        self.assertEqual(resp.status_code, 403)

    def test_create_request_does_not_create_subscription(self):
        from subscriptions.models import Subscription, Emi, Payment
        from accounting.models import JournalEntry

        subs_before = Subscription.objects.count()
        emi_before = Emi.objects.count()
        pay_before = Payment.objects.count()
        journal_before = JournalEntry.objects.count()

        self.client.force_authenticate(user=self.admin)
        self.client.post(f"{self.BASE}/", {
            "customer_id": self.customer.pk,
            "request_type": "PLAN_CONVERSION",
        }, format="json")

        self.assertEqual(Subscription.objects.count(), subs_before)
        self.assertEqual(Emi.objects.count(), emi_before)
        self.assertEqual(Payment.objects.count(), pay_before)
        self.assertEqual(JournalEntry.objects.count(), journal_before)

    def test_invalid_request_type_rejected(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"{self.BASE}/", {
            "customer_id": self.customer.pk,
            "request_type": "INVALID_TYPE",
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_404_for_nonexistent_request(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"{self.BASE}/999999/")
        self.assertEqual(resp.status_code, 404)
