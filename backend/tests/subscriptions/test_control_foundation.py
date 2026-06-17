"""
P2A tests: Enterprise Control Foundation — ApprovalRequest, BusinessPolicy, ControlException.

Covers:
* create_approval_request creates PENDING record
* approve_request transitions to APPROVED
* reject_request transitions to REJECTED
* self-approval blocked for HIGH/CRITICAL risk
* self-approval allowed for LOW/MEDIUM risk
* decided approval cannot be changed
* policy typed parsing (BOOL, INT, DECIMAL, STRING, JSON)
* missing policy returns safe default
* set_policy_value deactivates prior active row
* exception service raise_exception is idempotent
* exception acknowledge/resolve/suppress transitions
* list_open_exceptions returns OPEN+ACKNOWLEDGED only
* non-admin cannot access control endpoints (403)
* admin can access control endpoints (200/201)
"""
from __future__ import annotations

from decimal import Decimal

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import UserRole
from subscriptions.models_control_foundation import (
    ApprovalRequest,
    ApprovalRiskLevel,
    ApprovalStatus,
    BusinessPolicy,
    ControlException,
    ExceptionStatus,
    PolicyValueType,
)
from subscriptions.services.control_approval_service import (
    approve_request,
    create_approval_request,
    reject_request,
)
from subscriptions.services.control_exception_service import (
    ExceptionKey,
    acknowledge_exception,
    list_open_exceptions,
    raise_exception,
    resolve_exception,
    suppress_exception,
)
from subscriptions.services.control_policy_service import (
    PolicyKey,
    _parse_value,
    get_policy_value,
    set_policy_value,
)
from tests.helpers import create_admin_user, create_user


def _make_cashier(username="cashier_ctrl", phone="8800000099"):
    return create_user(username=username, phone=phone, role=UserRole.CASHIER)


def _make_admin(username="admin_ctrl", phone="8800000001"):
    return create_admin_user(username=username, phone=phone)


# ─────────────────────────────────────────────
# ApprovalRequest service tests
# ─────────────────────────────────────────────

class ApprovalRequestServiceTests(TestCase):
    def setUp(self):
        self.admin = _make_admin()
        self.cashier = _make_cashier()

    def _req(self, requester=None, risk=ApprovalRiskLevel.MEDIUM):
        return create_approval_request(
            source_model="Payment",
            source_id="42",
            action_key="payment.reverse",
            requested_by=requester or self.cashier,
            risk_level=risk,
            request_reason="Test request",
        )

    def test_create_returns_pending(self):
        req = self._req()
        self.assertEqual(req.status, ApprovalStatus.PENDING)
        self.assertIsNotNone(req.pk)

    def test_approve_transitions(self):
        req = self._req()
        updated = approve_request(request=req, decided_by=self.admin, decision_reason="OK")
        self.assertEqual(updated.status, ApprovalStatus.APPROVED)
        self.assertEqual(updated.approved_by, self.admin)
        self.assertIsNotNone(updated.decided_at)

    def test_reject_transitions(self):
        req = self._req()
        updated = reject_request(request=req, decided_by=self.admin, decision_reason="No")
        self.assertEqual(updated.status, ApprovalStatus.REJECTED)
        self.assertEqual(updated.approved_by, self.admin)

    def test_self_approval_blocked_high_risk(self):
        req = self._req(requester=self.admin, risk=ApprovalRiskLevel.HIGH)
        with self.assertRaises(ValueError):
            approve_request(request=req, decided_by=self.admin)

    def test_self_approval_blocked_critical_risk(self):
        req = self._req(requester=self.admin, risk=ApprovalRiskLevel.CRITICAL)
        with self.assertRaises(ValueError):
            approve_request(request=req, decided_by=self.admin)

    def test_self_approval_allowed_low_risk(self):
        req = self._req(requester=self.admin, risk=ApprovalRiskLevel.LOW)
        updated = approve_request(request=req, decided_by=self.admin)
        self.assertEqual(updated.status, ApprovalStatus.APPROVED)

    def test_self_approval_allowed_medium_risk(self):
        req = self._req(requester=self.admin, risk=ApprovalRiskLevel.MEDIUM)
        updated = approve_request(request=req, decided_by=self.admin)
        self.assertEqual(updated.status, ApprovalStatus.APPROVED)

    def test_decided_request_immutable_via_approve(self):
        req = self._req()
        approve_request(request=req, decided_by=self.admin)
        req.refresh_from_db()
        with self.assertRaises((ValueError, Exception)):
            approve_request(request=req, decided_by=self.admin)

    def test_decided_request_immutable_via_reject(self):
        req = self._req()
        reject_request(request=req, decided_by=self.admin)
        req.refresh_from_db()
        with self.assertRaises((ValueError, Exception)):
            reject_request(request=req, decided_by=self.admin)

    def test_pending_unique_constraint(self):
        from django.core.exceptions import ValidationError
        self._req()
        with self.assertRaises((ValidationError, Exception)):
            create_approval_request(
                source_model="Payment",
                source_id="42",
                action_key="payment.reverse",
                requested_by=self.cashier,
            )


# ─────────────────────────────────────────────
# BusinessPolicy service tests
# ─────────────────────────────────────────────

class PolicyServiceTests(TestCase):
    def setUp(self):
        self.admin = _make_admin(username="admin_pol", phone="8800000002")

    def test_parse_bool_true(self):
        self.assertTrue(_parse_value("true", PolicyValueType.BOOL))
        self.assertTrue(_parse_value("1", PolicyValueType.BOOL))
        self.assertTrue(_parse_value("yes", PolicyValueType.BOOL))

    def test_parse_bool_false(self):
        self.assertFalse(_parse_value("false", PolicyValueType.BOOL))
        self.assertFalse(_parse_value("0", PolicyValueType.BOOL))

    def test_parse_int(self):
        self.assertEqual(_parse_value("42", PolicyValueType.INT), 42)

    def test_parse_decimal(self):
        self.assertEqual(_parse_value("50000.00", PolicyValueType.DECIMAL), Decimal("50000.00"))

    def test_parse_string(self):
        self.assertEqual(_parse_value("hello", PolicyValueType.STRING), "hello")

    def test_parse_json(self):
        self.assertEqual(_parse_value('{"a": 1}', PolicyValueType.JSON), {"a": 1})

    def test_parse_invalid_int_returns_none(self):
        self.assertIsNone(_parse_value("notanint", PolicyValueType.INT))

    def test_missing_policy_returns_safe_default(self):
        val = get_policy_value(PolicyKey.PAYMENT_REVERSAL_REQUIRES_APPROVAL)
        self.assertTrue(val)

    def test_missing_optional_key_returns_caller_default(self):
        val = get_policy_value("NON_EXISTENT_KEY", default="FALLBACK")
        self.assertEqual(val, "FALLBACK")

    def test_missing_policy_no_default_returns_none(self):
        val = get_policy_value("TOTALLY_UNKNOWN_KEY")
        self.assertIsNone(val)

    def test_set_policy_value_creates_active_row(self):
        policy = set_policy_value(
            key=PolicyKey.STOCK_NEGATIVE_ALLOWED,
            value=True,
            value_type=PolicyValueType.BOOL,
            updated_by=self.admin,
        )
        self.assertTrue(policy.is_active)
        val = get_policy_value(PolicyKey.STOCK_NEGATIVE_ALLOWED)
        self.assertTrue(val)

    def test_set_policy_value_deactivates_prior_row(self):
        set_policy_value(key="MY_POLICY", value=True, value_type=PolicyValueType.BOOL, updated_by=self.admin)
        set_policy_value(key="MY_POLICY", value=False, value_type=PolicyValueType.BOOL, updated_by=self.admin)
        active = BusinessPolicy.objects.filter(key="MY_POLICY", is_active=True)
        self.assertEqual(active.count(), 1)
        self.assertFalse(get_policy_value("MY_POLICY"))

    def test_decimal_policy_round_trip(self):
        set_policy_value(
            key=PolicyKey.DIRECT_SALE_MAX_CASH_WITHOUT_APPROVAL,
            value=Decimal("75000.00"),
            value_type=PolicyValueType.DECIMAL,
            updated_by=self.admin,
        )
        val = get_policy_value(PolicyKey.DIRECT_SALE_MAX_CASH_WITHOUT_APPROVAL)
        self.assertEqual(val, Decimal("75000.00"))


# ─────────────────────────────────────────────
# ControlException service tests
# ─────────────────────────────────────────────

class ControlExceptionServiceTests(TestCase):
    def setUp(self):
        self.admin = _make_admin(username="admin_exc", phone="8800000003")

    def _raise(self, key=ExceptionKey.PAYMENT_BRIDGE_MISSING, source_id="1"):
        return raise_exception(
            exception_key=key,
            source_model="Payment",
            source_id=source_id,
        )

    def test_raise_creates_open_record(self):
        exc = self._raise()
        self.assertEqual(exc.status, ExceptionStatus.OPEN)
        self.assertIsNotNone(exc.pk)

    def test_raise_is_idempotent(self):
        exc1 = self._raise()
        exc2 = self._raise()
        self.assertEqual(exc1.pk, exc2.pk)

    def test_raise_different_source_id_creates_new(self):
        exc1 = self._raise(source_id="10")
        exc2 = self._raise(source_id="20")
        self.assertNotEqual(exc1.pk, exc2.pk)

    def test_acknowledge_transitions(self):
        exc = self._raise()
        updated = acknowledge_exception(exception=exc, acknowledged_by=self.admin)
        self.assertEqual(updated.status, ExceptionStatus.ACKNOWLEDGED)
        self.assertEqual(updated.acknowledged_by, self.admin)
        self.assertIsNotNone(updated.acknowledged_at)

    def test_resolve_transitions(self):
        exc = self._raise()
        updated = resolve_exception(exception=exc)
        self.assertEqual(updated.status, ExceptionStatus.RESOLVED)

    def test_suppress_transitions(self):
        exc = self._raise()
        updated = suppress_exception(exception=exc)
        self.assertEqual(updated.status, ExceptionStatus.SUPPRESSED)

    def test_list_open_returns_open_and_acknowledged(self):
        exc1 = self._raise(source_id="100")
        exc2 = self._raise(source_id="101")
        acknowledge_exception(exception=exc2, acknowledged_by=self.admin)
        exc3 = self._raise(source_id="102")
        resolve_exception(exception=exc3)

        results = list_open_exceptions()
        ids = {r["id"] for r in results}
        self.assertIn(exc1.pk, ids)
        self.assertIn(exc2.pk, ids)
        self.assertNotIn(exc3.pk, ids)

    def test_stable_payload_shape(self):
        self._raise()
        results = list_open_exceptions()
        self.assertTrue(len(results) >= 1)
        record = results[0]
        for field in ("id", "exception_key", "severity", "source_model", "source_id", "title", "status", "detected_at"):
            self.assertIn(field, record)


# ─────────────────────────────────────────────
# Permission / API endpoint tests
# ─────────────────────────────────────────────

class AdminControlEndpointPermissionTests(APITestCase):
    def setUp(self):
        self.admin = _make_admin(username="admin_api", phone="8800000010")
        self.cashier = _make_cashier(username="cashier_api", phone="8800000011")

    # ── Approvals ──

    def test_non_admin_cannot_list_approvals(self):
        self.client.force_authenticate(user=self.cashier)
        resp = self.client.get("/api/v1/admin/control/approvals/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_list_approvals(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/admin/control/approvals/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", resp.data)

    def test_unauthenticated_cannot_list_approvals(self):
        resp = self.client.get("/api/v1/admin/control/approvals/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_approve_returns_200(self):
        cashier2 = create_user(username="cashier2_api", phone="8800000020", role=UserRole.CASHIER)
        req = create_approval_request(
            source_model="Payment",
            source_id="99",
            action_key="test.action",
            requested_by=cashier2,
            risk_level=ApprovalRiskLevel.LOW,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f"/api/v1/admin/control/approvals/{req.pk}/approve/",
            {"decision_reason": "looks good"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], ApprovalStatus.APPROVED)

    def test_admin_reject_returns_200(self):
        cashier3 = create_user(username="cashier3_api", phone="8800000030", role=UserRole.CASHIER)
        req = create_approval_request(
            source_model="Payment",
            source_id="100",
            action_key="test.action2",
            requested_by=cashier3,
            risk_level=ApprovalRiskLevel.LOW,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f"/api/v1/admin/control/approvals/{req.pk}/reject/",
            {"decision_reason": "not authorized"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], ApprovalStatus.REJECTED)

    def test_self_approve_high_risk_returns_400(self):
        req = create_approval_request(
            source_model="Payment",
            source_id="101",
            action_key="test.high",
            requested_by=self.admin,
            risk_level=ApprovalRiskLevel.HIGH,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f"/api/v1/admin/control/approvals/{req.pk}/approve/",
            {},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Policies ──

    def test_non_admin_cannot_list_policies(self):
        self.client.force_authenticate(user=self.cashier)
        resp = self.client.get("/api/v1/admin/control/policies/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_list_policies(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/admin/control/policies/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_admin_can_set_policy(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/admin/control/policies/set/",
            {
                "key": "STOCK_NEGATIVE_ALLOWED",
                "value": "false",
                "value_type": "BOOL",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["key"], "STOCK_NEGATIVE_ALLOWED")

    def test_non_admin_cannot_set_policy(self):
        self.client.force_authenticate(user=self.cashier)
        resp = self.client.post(
            "/api/v1/admin/control/policies/set/",
            {"key": "X", "value": "1"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_set_policy_missing_key_returns_400(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/admin/control/policies/set/",
            {"value": "true"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Exceptions ──

    def test_non_admin_cannot_list_exceptions(self):
        self.client.force_authenticate(user=self.cashier)
        resp = self.client.get("/api/v1/admin/control/exceptions/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_list_exceptions(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/admin/control/exceptions/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", resp.data)

    def test_admin_can_acknowledge_exception(self):
        exc = raise_exception(
            exception_key=ExceptionKey.CASH_COUNTER_VARIANCE,
            source_model="CashCounter",
            source_id="5",
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"/api/v1/admin/control/exceptions/{exc.pk}/acknowledge/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], ExceptionStatus.ACKNOWLEDGED)

    def test_admin_can_resolve_exception(self):
        exc = raise_exception(
            exception_key=ExceptionKey.CASH_COUNTER_VARIANCE,
            source_model="CashCounter",
            source_id="6",
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"/api/v1/admin/control/exceptions/{exc.pk}/resolve/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], ExceptionStatus.RESOLVED)
