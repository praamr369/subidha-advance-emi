from decimal import Decimal

from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from branch_control.models import Branch, BranchStatus, CashCounter
from subscriptions.models_business_setup import BusinessProfile
from tests.helpers import create_admin_user, create_product, create_user


class AdminBusinessSetupApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="setup_admin", phone="9101000001")
        self.customer = create_user(
            username="setup_customer",
            password="CustomerPass123!",
            role="CUSTOMER",
            phone="9101000002",
            first_name="Setup",
        )

    def test_admin_only_access_is_enforced(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get("/api/v1/admin/business-setup/checklist/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_business_profile_enforces_single_active_profile(self):
        BusinessProfile.objects.create(legal_name="Subidha Furniture", is_active=True)
        second = BusinessProfile(legal_name="Other Profile", is_active=True)
        with self.assertRaises(ValidationError):
            second.full_clean()

    def test_checklist_reports_ready_when_required_items_complete(self):
        self.client.force_authenticate(self.admin)

        BusinessProfile.objects.create(legal_name="Subidha Furniture", is_active=True)

        branch = Branch.objects.filter(is_primary=True).first()
        self.assertIsNotNone(branch)
        branch.status = BranchStatus.ACTIVE
        branch.save(update_fields=["status"])

        cash_chart = ChartOfAccount.objects.create(
            name="Cash in Hand",
            account_type=ChartOfAccountType.ASSET,
        )
        bank_chart = ChartOfAccount.objects.create(
            name="Bank",
            account_type=ChartOfAccountType.ASSET,
        )

        FinanceAccount.objects.create(
            name="Cash",
            branch=branch,
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
            is_active=True,
        )
        cash_finance = FinanceAccount.objects.filter(kind=FinanceAccountKind.CASH).first()
        self.assertIsNotNone(cash_finance)

        FinanceAccount.objects.create(
            name="UPI",
            branch=branch,
            kind=FinanceAccountKind.UPI,
            chart_account=bank_chart,
            opening_balance=Decimal("0.00"),
            is_active=True,
            upi_handle="subidha@upi",
        )

        CashCounter.objects.create(
            code="COUNTER1",
            name="Counter 1",
            branch=branch,
            finance_account=cash_finance,
            is_active=True,
        )

        create_product()

        response = self.client.get("/api/v1/admin/business-setup/checklist/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_ready_for_go_live"])

    def test_reset_preview_is_read_only(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/business-setup/reset-preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["mode"], "read_only_preview")

    def test_reset_execute_requires_preserved_admin_username(self):
        self.client.force_authenticate(self.admin)
        payload = {
            "confirm": "RESET_SUBIDHA_CORE",
            "preserve_username": "some_other_admin",
            "delete_non_preserved_users": True,
            "clear_auth_artifacts": True,
            "dry_run": True,
        }
        response = self.client.post("/api/v1/admin/business-setup/reset/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
