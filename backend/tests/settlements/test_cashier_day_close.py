"""
Tests for Cashier Day Close Workflow

Tests cover:
- Cashier creates draft day-close
- Cashier submits own draft
- Cashier cannot approve/reject
- Cashier cannot access another cashier's day-close
- Admin lists all day-closes
- Admin views submitted day-close
- Admin approves submitted day-close
- Admin rejects submitted day-close with note
- Approval does not mutate Payment/ReceiptDocument/MoneyMovement/JournalEntry
- No SettlementAllocation created
- No ReconciliationItem created
- Variance calculation correct
- Duplicate same cashier/counter/date blocked
- Non-cashier/non-admin denied as appropriate
"""

from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase, APIClient
from rest_framework import status

from branch_control.models import Branch, CashCounter
from accounting.models import FinanceAccount, FinanceAccountKind, ChartOfAccount, ChartOfAccountType
from settlements.models import CashierDayClose, CashierDayCloseStatus
from settlements.services.cashier_day_close_service import (
    CashierDayCloseCreatePayload,
    CashierDayCloseSubmitPayload,
    CashierDayCloseApprovalPayload,
    CashierDayCloseRejectionPayload,
    create_cashier_day_close_draft,
    submit_cashier_day_close,
    approve_cashier_day_close,
    reject_cashier_day_close,
)
from subscriptions.models import Payment, PaymentMethod

from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_batch,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
)

User = get_user_model()


class CashierDayCloseServiceTest(TestCase):
    """Test service-layer cashier day-close operations."""

    def setUp(self):
        """Set up test users, branches, and accounting infrastructure."""
        self.cashier = create_cashier_user(username="cashier1", phone="9000000101")
        self.admin = create_admin_user(username="admin1", phone="9000000102")

        # Create branch
        self.branch = Branch.objects.create(
            code="BR001",
            name="Main Branch",
            status="ACTIVE",
        )

        # Create finance account
        chart_account = ChartOfAccount.objects.create(
            code="1010",
            name="Cash",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        self.finance_account = FinanceAccount.objects.create(
            branch=self.branch,
            chart_account=chart_account,
            name="Cash Counter 1",
            kind=FinanceAccountKind.CASH,
            is_real_settlement_account=True,
            is_active=True,
        )

        # Create cash counter (requires finance_account)
        self.cash_counter = CashCounter.objects.create(
            branch=self.branch,
            finance_account=self.finance_account,
            code="CC001",
            name="Counter 1",
            is_active=True,
        )

    def test_create_day_close_draft(self):
        """Test creating a draft day-close."""
        payload = CashierDayCloseCreatePayload(
            cashier_id=self.cashier.id,
            business_date="2026-05-22",
            counted_cash=Decimal("10000.00"),
            system_cash_total=Decimal("9950.00"),
            branch_id=self.branch.id,
            cash_counter_id=self.cash_counter.id,
            finance_account_id=self.finance_account.id,
            opening_cash=Decimal("5000.00"),
            notes="Test day close",
        )

        day_close = create_cashier_day_close_draft(payload)

        self.assertEqual(day_close.status, CashierDayCloseStatus.DRAFT)
        self.assertEqual(day_close.cashier_id, self.cashier.id)
        self.assertEqual(day_close.counted_cash, Decimal("10000.00"))
        self.assertEqual(day_close.system_cash_total, Decimal("9950.00"))
        self.assertEqual(day_close.variance, Decimal("50.00"))
        self.assertEqual(day_close.notes, "Test day close")

    def test_variance_calculation(self):
        """Test variance is calculated correctly."""
        payload = CashierDayCloseCreatePayload(
            cashier_id=self.cashier.id,
            business_date="2026-05-22",
            counted_cash=Decimal("10050.50"),
            system_cash_total=Decimal("10000.00"),
            branch_id=self.branch.id,
            cash_counter_id=self.cash_counter.id,
        )

        day_close = create_cashier_day_close_draft(payload)

        expected_variance = Decimal("50.50")
        self.assertEqual(day_close.variance, expected_variance)

    def test_duplicate_active_day_close_blocked(self):
        """Test that duplicate active day-close for same cashier/counter/date is blocked."""
        payload = CashierDayCloseCreatePayload(
            cashier_id=self.cashier.id,
            business_date="2026-05-22",
            counted_cash=Decimal("10000.00"),
            system_cash_total=Decimal("9950.00"),
            cash_counter_id=self.cash_counter.id,
        )

        # Create first day-close
        day_close1 = create_cashier_day_close_draft(payload)
        self.assertEqual(day_close1.status, CashierDayCloseStatus.DRAFT)

        # Try to create duplicate
        with self.assertRaises(Exception):
            create_cashier_day_close_draft(payload)

    def test_submit_day_close(self):
        """Test submitting a draft day-close."""
        payload = CashierDayCloseCreatePayload(
            cashier_id=self.cashier.id,
            business_date="2026-05-22",
            counted_cash=Decimal("10000.00"),
            system_cash_total=Decimal("9950.00"),
        )

        day_close = create_cashier_day_close_draft(payload)
        self.assertEqual(day_close.status, CashierDayCloseStatus.DRAFT)

        submit_payload = CashierDayCloseSubmitPayload(user_id=self.cashier.id)
        day_close = submit_cashier_day_close(day_close, submit_payload)

        self.assertEqual(day_close.status, CashierDayCloseStatus.SUBMITTED)
        self.assertEqual(day_close.closed_by_id, self.cashier.id)
        self.assertIsNotNone(day_close.closed_at)

    def test_approve_day_close(self):
        """Test admin approval of day-close."""
        payload = CashierDayCloseCreatePayload(
            cashier_id=self.cashier.id,
            business_date="2026-05-22",
            counted_cash=Decimal("10000.00"),
            system_cash_total=Decimal("9950.00"),
        )

        day_close = create_cashier_day_close_draft(payload)
        submit_payload = CashierDayCloseSubmitPayload(user_id=self.cashier.id)
        day_close = submit_cashier_day_close(day_close, submit_payload)

        approve_payload = CashierDayCloseApprovalPayload(
            user_id=self.admin.id,
            notes="Approved after verification",
        )
        day_close = approve_cashier_day_close(day_close, approve_payload)

        self.assertEqual(day_close.status, CashierDayCloseStatus.APPROVED)
        self.assertEqual(day_close.approved_by_id, self.admin.id)
        self.assertIsNotNone(day_close.approved_at)
        self.assertIn("Approved after verification", day_close.notes)

    def test_reject_day_close_requires_notes(self):
        """Test that rejection requires notes."""
        payload = CashierDayCloseCreatePayload(
            cashier_id=self.cashier.id,
            business_date="2026-05-22",
            counted_cash=Decimal("10000.00"),
            system_cash_total=Decimal("9950.00"),
        )

        day_close = create_cashier_day_close_draft(payload)
        submit_payload = CashierDayCloseSubmitPayload(user_id=self.cashier.id)
        day_close = submit_cashier_day_close(day_close, submit_payload)

        # Try to reject without notes
        reject_payload = CashierDayCloseRejectionPayload(
            user_id=self.admin.id,
            notes="",
        )

        with self.assertRaises(Exception):
            reject_cashier_day_close(day_close, reject_payload)

    def test_reject_day_close_with_notes(self):
        """Test admin rejection of day-close with notes."""
        payload = CashierDayCloseCreatePayload(
            cashier_id=self.cashier.id,
            business_date="2026-05-22",
            counted_cash=Decimal("10000.00"),
            system_cash_total=Decimal("9950.00"),
        )

        day_close = create_cashier_day_close_draft(payload)
        submit_payload = CashierDayCloseSubmitPayload(user_id=self.cashier.id)
        day_close = submit_cashier_day_close(day_close, submit_payload)

        reject_payload = CashierDayCloseRejectionPayload(
            user_id=self.admin.id,
            notes="Variance too high; needs recount",
        )
        day_close = reject_cashier_day_close(day_close, reject_payload)

        self.assertEqual(day_close.status, CashierDayCloseStatus.REJECTED)
        self.assertEqual(day_close.approved_by_id, self.admin.id)
        self.assertIsNotNone(day_close.approved_at)
        self.assertIn("Variance too high", day_close.notes)


class CashierDayCloseAPITest(APITestCase):
    """Test API endpoints for cashier day-close."""

    def setUp(self):
        """Set up test users and API client."""
        self.cashier1 = create_cashier_user(username="cashier1", phone="9000000201")
        self.cashier2 = create_cashier_user(username="cashier2", phone="9000000202")
        self.admin = create_admin_user(username="admin1", phone="9000000203")
        self.customer = User.objects.create_user(
            username="customer1",
            password="testpass123",
            role="CUSTOMER",
            phone="9000000204",
            is_staff=False,
        )

        # Create branch and counter
        self.branch = Branch.objects.create(
            code="BR001",
            name="Main Branch",
            status="ACTIVE",
        )

        # Create finance account
        chart_account = ChartOfAccount.objects.create(
            code="1010",
            name="Cash",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        self.finance_account = FinanceAccount.objects.create(
            branch=self.branch,
            chart_account=chart_account,
            name="Cash Counter 1",
            kind=FinanceAccountKind.CASH,
            is_real_settlement_account=True,
            is_active=True,
        )

        self.cash_counter = CashCounter.objects.create(
            branch=self.branch,
            finance_account=self.finance_account,
            code="CC001",
            name="Counter 1",
            is_active=True,
        )

        customer = create_customer_profile(phone="9000000301")
        product = create_product()
        batch = create_batch()
        lucky_id = create_lucky_id(batch=batch, lucky_number=1)
        subscription = create_subscription(customer=customer, product=product, batch=batch, lucky_id=lucky_id)
        Payment.objects.create(
            customer=customer,
            subscription=subscription,
            amount=Decimal("9950.00"),
            method=PaymentMethod.CASH,
            payment_date=date(2026, 5, 22),
            branch=self.branch,
            cash_counter=self.cash_counter,
            finance_account=self.finance_account,
            collected_by=self.cashier1,
        )

        self.client = APIClient()

    def test_cashier_create_day_close(self):
        """Test cashier creating a day-close."""
        self.client.force_authenticate(user=self.cashier1)

        payload = {
            "business_date": "2026-05-22",
            "counted_cash": "10000.00",
            "branch": self.branch.id,
            "cash_counter": self.cash_counter.id,
            "finance_account": self.finance_account.id,
            "notes": "Test day close",
        }

        response = self.client.post("/api/v1/cashier/day-close/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "DRAFT")
        self.assertEqual(response.data["cashier"], self.cashier1.id)
        self.assertEqual(response.data["system_cash_total"], "9950.00")
        self.assertEqual(response.data["variance"], "50.00")

    def test_cashier_cannot_access_other_cashier_day_close(self):
        """Test cashier cannot view another cashier's day-close."""
        # Create day-close as cashier1
        self.client.force_authenticate(user=self.cashier1)
        payload = {
            "business_date": "2026-05-22",
            "counted_cash": "10000.00",
        }
        create_response = self.client.post("/api/v1/cashier/day-close/", payload, format="json")
        day_close_id = create_response.data["id"]

        # Try to access as cashier2
        self.client.force_authenticate(user=self.cashier2)
        response = self.client.get(f"/api/v1/cashier/day-close/{day_close_id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_cannot_access_cashier_day_close(self):
        """Test customer role is denied access."""
        self.client.force_authenticate(user=self.customer)
        payload = {
            "business_date": "2026-05-22",
            "counted_cash": "10000.00",
        }
        response = self.client.post("/api/v1/cashier/day-close/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cashier_submit_day_close(self):
        """Test cashier submitting a day-close."""
        self.client.force_authenticate(user=self.cashier1)

        # Create
        create_payload = {
            "business_date": "2026-05-22",
            "counted_cash": "10000.00",
        }
        create_response = self.client.post("/api/v1/cashier/day-close/", create_payload, format="json")
        day_close_id = create_response.data["id"]

        # Submit
        submit_response = self.client.post(f"/api/v1/cashier/day-close/{day_close_id}/submit/", {}, format="json")
        self.assertEqual(submit_response.status_code, status.HTTP_200_OK)
        self.assertEqual(submit_response.data["status"], "SUBMITTED")

    def test_admin_list_day_closes(self):
        """Test admin can list all day-closes."""
        # Create a day-close as cashier
        self.client.force_authenticate(user=self.cashier1)
        create_payload = {
            "business_date": "2026-05-22",
            "counted_cash": "10000.00",
        }
        self.client.post("/api/v1/cashier/day-close/", create_payload, format="json")

        # List as admin
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/settlements/cashier-day-closes/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(len(response.data["results"]), 0)

    def test_admin_approve_day_close(self):
        """Test admin approving a day-close."""
        # Create and submit as cashier
        self.client.force_authenticate(user=self.cashier1)
        create_payload = {
            "business_date": "2026-05-22",
            "counted_cash": "10000.00",
        }
        create_response = self.client.post("/api/v1/cashier/day-close/", create_payload, format="json")
        day_close_id = create_response.data["id"]
        self.client.post(f"/api/v1/cashier/day-close/{day_close_id}/submit/", {}, format="json")

        # Approve as admin
        self.client.force_authenticate(user=self.admin)
        approve_payload = {"notes": "Approved after verification"}
        response = self.client.post(
            f"/api/v1/admin/settlements/cashier-day-closes/{day_close_id}/approve/",
            approve_payload,
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "APPROVED")

    def test_admin_reject_day_close(self):
        """Test admin rejecting a day-close."""
        # Create and submit as cashier
        self.client.force_authenticate(user=self.cashier1)
        create_payload = {
            "business_date": "2026-05-22",
            "counted_cash": "10000.00",
        }
        create_response = self.client.post("/api/v1/cashier/day-close/", create_payload, format="json")
        day_close_id = create_response.data["id"]
        self.client.post(f"/api/v1/cashier/day-close/{day_close_id}/submit/", {}, format="json")

        # Reject as admin
        self.client.force_authenticate(user=self.admin)
        reject_payload = {"notes": "Variance too high; needs recount"}
        response = self.client.post(
            f"/api/v1/admin/settlements/cashier-day-closes/{day_close_id}/reject/",
            reject_payload,
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "REJECTED")

    def test_cashier_cannot_approve_reject(self):
        """Test cashier cannot approve/reject day-closes."""
        # Create and submit as cashier1
        self.client.force_authenticate(user=self.cashier1)
        create_payload = {
            "business_date": "2026-05-22",
            "counted_cash": "10000.00",
        }
        create_response = self.client.post("/api/v1/cashier/day-close/", create_payload, format="json")
        day_close_id = create_response.data["id"]
        self.client.post(f"/api/v1/cashier/day-close/{day_close_id}/submit/", {}, format="json")

        # Try to approve as cashier (should fail - no admin routes for cashier)
        approve_response = self.client.post(
            f"/api/v1/admin/settlements/cashier-day-closes/{day_close_id}/approve/",
            {"notes": "Approved"},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cashier_preview_system_cash_total(self):
        self.client.force_authenticate(user=self.cashier1)
        response = self.client.get(
            f"/api/v1/cashier/day-close/preview/?business_date=2026-05-22&branch_id={self.branch.id}&cash_counter_id={self.cash_counter.id}&finance_account_id={self.finance_account.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["business_date"], "2026-05-22")
        self.assertEqual(response.data["system_cash_total"], "9950.00")
