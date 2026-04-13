from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APITestCase

from tests.helpers import create_admin_user, create_user
from subscriptions.models_business_setup import (
    Branch,
    BranchType,
    BusinessProfile,
    CashDesk,
    CashDeskType,
    ChartAccount,
    ChartAccountCategory,
    ChartAccountGroup,
    FinanceAccount,
    FinanceAccountType,
    StaffOperationalRoleScope,
    StaffOperationalAssignment,
)


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

    def test_branch_code_must_be_unique(self):
        self.client.force_authenticate(self.admin)
        payload = {
            "code": "HO",
            "name": "Head Office",
            "branch_type": BranchType.HEAD_OFFICE,
            "is_head_office": True,
            "is_active": True,
        }
        first = self.client.post("/api/v1/admin/branches/", payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = self.client.post("/api/v1/admin/branches/", payload, format="json")
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_only_one_active_head_office_is_allowed(self):
        Branch.objects.create(code="HO1", name="Head Office 1", branch_type=BranchType.HEAD_OFFICE, is_head_office=True, is_active=True)
        second = Branch(code="HO2", name="Head Office 2", branch_type=BranchType.HEAD_OFFICE, is_head_office=True, is_active=True)
        with self.assertRaises(ValidationError):
            second.full_clean()

    def test_cash_desk_requires_active_finance_account(self):
        self.client.force_authenticate(self.admin)
        branch = Branch.objects.create(code="BR1", name="Branch 1", branch_type=BranchType.BRANCH)
        finance = FinanceAccount.objects.create(code="BANK1", name="Inactive Bank", account_type=FinanceAccountType.BANK, is_active=False)
        payload = {
            "code": "DESK1",
            "name": "Desk 1",
            "branch": branch.id,
            "desk_type": CashDeskType.BANK,
            "default_finance_account": finance.id,
            "allow_cash_collection": False,
            "allow_bank_collection": True,
            "allow_upi_collection": False,
            "is_default_for_branch": True,
            "is_active": True,
        }
        response = self.client.post("/api/v1/admin/cash-desks/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_staff_assignment_requires_desk_from_same_branch(self):
        self.client.force_authenticate(self.admin)
        branch_a = Branch.objects.create(code="BRA", name="Branch A", branch_type=BranchType.BRANCH)
        branch_b = Branch.objects.create(code="BRB", name="Branch B", branch_type=BranchType.BRANCH)
        finance = FinanceAccount.objects.create(code="CASH1", name="Cash", account_type=FinanceAccountType.CASH)
        desk = CashDesk.objects.create(
            code="DSK1",
            name="Desk A",
            branch=branch_a,
            desk_type=CashDeskType.CASH,
            default_finance_account=finance,
            allow_cash_collection=True,
        )
        payload = {
            "user": self.admin.id,
            "role_scope": StaffOperationalRoleScope.ADMIN,
            "branch": branch_b.id,
            "default_cash_desk": desk.id,
            "can_collect_payments": True,
            "is_primary": True,
            "is_active": True,
            "effective_from": "2026-04-14",
        }
        response = self.client.post("/api/v1/admin/staff-operational-assignments/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_chart_account_create_list_and_update(self):
        self.client.force_authenticate(self.admin)
        create_payload = {
            "code": "1000",
            "name": "Cash in Hand",
            "account_category": ChartAccountCategory.ASSET,
            "account_group": ChartAccountGroup.CASH,
            "is_system": False,
            "is_active": True,
            "allow_manual_posting": True,
            "display_order": 10,
        }
        create_response = self.client.post("/api/v1/admin/chart-accounts/", create_payload, format="json")
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        chart_id = create_response.data["id"]

        list_response = self.client.get("/api/v1/admin/chart-accounts/")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        payload = list_response.data.get("results", list_response.data) if isinstance(list_response.data, dict) else list_response.data
        self.assertGreaterEqual(len(payload), 1)

        update_response = self.client.patch(
            f"/api/v1/admin/chart-accounts/{chart_id}/",
            {"name": "Cash on Counter"},
            format="json",
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.assertEqual(update_response.data["name"], "Cash on Counter")

    def test_checklist_reports_ready_when_setup_is_complete(self):
        self.client.force_authenticate(self.admin)
        BusinessProfile.objects.create(legal_name="Subidha Furniture", is_active=True)
        branch = Branch.objects.create(code="HO", name="Head Office", branch_type=BranchType.HEAD_OFFICE, is_head_office=True, is_active=True)
        cash_account = FinanceAccount.objects.create(code="CASH", name="Cash in Hand", account_type=FinanceAccountType.CASH, is_active=True)
        FinanceAccount.objects.create(code="UPI", name="Main UPI", account_type=FinanceAccountType.UPI, upi_handle="test@upi", is_active=True)
        CashDesk.objects.create(
            code="CD1",
            name="Counter 1",
            branch=branch,
            desk_type=CashDeskType.MIXED,
            default_finance_account=cash_account,
            allow_cash_collection=True,
            allow_bank_collection=False,
            allow_upi_collection=True,
            is_default_for_branch=True,
            is_active=True,
        )
        StaffOperationalAssignment.objects.create(
            user=self.admin,
            role_scope=StaffOperationalRoleScope.ADMIN,
            branch=branch,
            can_collect_payments=True,
            can_verify_payments=True,
            is_primary=True,
            is_active=True,
        )
        ChartAccount.objects.create(code="1000", name="Cash", account_category=ChartAccountCategory.ASSET, account_group=ChartAccountGroup.CASH, display_order=1)
        ChartAccount.objects.create(code="1100", name="Bank", account_category=ChartAccountCategory.ASSET, account_group=ChartAccountGroup.BANK, display_order=2)
        ChartAccount.objects.create(code="4000", name="Revenue", account_category=ChartAccountCategory.INCOME, account_group=ChartAccountGroup.REVENUE, display_order=3)

        response = self.client.get("/api/v1/admin/business-setup/checklist/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_ready_for_go_live"])
        self.assertEqual(response.data["percent_complete"], 100)

    def test_reset_preview_is_read_only(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/business-setup/reset-preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["mode"], "read_only_preview")
