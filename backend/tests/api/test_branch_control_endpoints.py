from datetime import date
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
)
from branch_control.models import Branch
from subscriptions.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class BranchControlApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="branch_control_admin",
            phone="9389100001",
        )
        self.client.force_authenticate(user=self.admin)
        self.primary_branch = Branch.objects.filter(is_primary=True).get()
        self.primary_branch.code = "BR-MAIN"
        self.primary_branch.name = "Main Branch"
        self.primary_branch.status = "ACTIVE"
        self.primary_branch.save(update_fields=["code", "name", "status", "updated_at"])
        cash_chart = ChartOfAccount.objects.create(
            code="BR-CASH-001",
            name="Branch Cash Account",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="Main Branch Cash",
            branch=self.primary_branch,
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )

    def test_admin_can_create_counter_and_reporting_overview_reflects_branch_collections(self):
        counter_response = self.client.post(
            "/api/v1/branch-control/counters/",
            {
                "code": "CTR-MAIN-01",
                "name": "Main Desk",
                "branch": self.primary_branch.id,
                "finance_account": self.cash_account.id,
                "assigned_user": self.admin.id,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(
            counter_response.status_code,
            status.HTTP_201_CREATED,
            counter_response.data,
        )
        self.assertEqual(counter_response.data["branch_code"], "BR-MAIN")
        self.assertEqual(counter_response.data["finance_account_name"], "Main Branch Cash")

        customer = create_customer_profile(
            name="Branch Reporting Customer",
            phone="7389100001",
        )
        product = create_product(
            name="Branch Reporting Product",
            product_code="BR-PRD-001",
            base_price=Decimal("1200.00"),
        )
        batch = create_batch(
            batch_code="BRAPR2026",
            total_slots=100,
            duration_months=12,
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=1)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("1200.00"),
            monthly_amount=Decimal("100.00"),
            tenure_months=12,
        )
        subscription.branch = self.primary_branch
        subscription.save(update_fields=["branch"])
        emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("100.00"),
            due_date=date(2026, 4, 10),
        )
        create_emi(
            subscription=subscription,
            month_no=2,
            amount=Decimal("100.00"),
            due_date=date(2026, 5, 10),
        )

        record_emi_payment(
            emi_id=emi.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="BRANCH-REPORT-001",
            payment_date=date(2026, 4, 10),
            branch_id=self.primary_branch.id,
            cash_counter_id=counter_response.data["id"],
        )

        response = self.client.get(
            "/api/v1/branch-control/reporting/overview/",
            {"branch_id": self.primary_branch.id},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["branch"]["code"], "BR-MAIN")
        self.assertEqual(response.data["collections"]["count"], 1)
        self.assertEqual(response.data["collections"]["cash_total"], "100.00")
        self.assertEqual(response.data["subscriptions"]["active_contracts"], 1)

    def test_admin_can_preview_and_post_branch_and_counter_imports(self):
        cashier = create_cashier_user(
            username="branch_import_cashier",
            phone="9389100099",
        )
        branch_csv = (
            "code,name,status,is_primary,phone,email,address,notes\n"
            "BR-MAIN,Main Branch Updated,ACTIVE,true,01700000000,main@example.com,Updated address,Updated note\n"
            "BR-NEW,New Branch,ACTIVE,false,01700000001,new@example.com,New address,New note\n"
        ).encode("utf-8")
        counter_csv = (
            "code,name,branch_code,finance_chart_account_code,assigned_username,is_active,notes\n"
            "CTR-NEW-01,New Main Desk,BR-MAIN,BR-CASH-001,branch_import_cashier,true,Go-live desk\n"
        ).encode("utf-8")

        preview_response = self.client.post(
            "/api/v1/branch-control/imports/branches/preview/",
            {"file": SimpleUploadedFile("branches.csv", branch_csv, content_type="text/csv")},
            format="multipart",
        )
        self.assertEqual(preview_response.status_code, status.HTTP_200_OK, preview_response.data)
        self.assertEqual(preview_response.data["valid_count"], 2)

        post_response = self.client.post(
            "/api/v1/branch-control/imports/branches/post/",
            {"file": SimpleUploadedFile("branches.csv", branch_csv, content_type="text/csv")},
            format="multipart",
        )
        self.assertEqual(post_response.status_code, status.HTTP_200_OK, post_response.data)
        self.assertEqual(post_response.data["created"], 1)
        self.assertEqual(post_response.data["updated"], 1)
        self.assertTrue(Branch.objects.filter(code="BR-NEW", name="New Branch").exists())

        preview_counter = self.client.post(
            "/api/v1/branch-control/imports/counters/preview/",
            {"file": SimpleUploadedFile("counters.csv", counter_csv, content_type="text/csv")},
            format="multipart",
        )
        self.assertEqual(preview_counter.status_code, status.HTTP_200_OK, preview_counter.data)
        self.assertEqual(preview_counter.data["valid_count"], 1)

        post_counter = self.client.post(
            "/api/v1/branch-control/imports/counters/post/",
            {"file": SimpleUploadedFile("counters.csv", counter_csv, content_type="text/csv")},
            format="multipart",
        )
        self.assertEqual(post_counter.status_code, status.HTTP_200_OK, post_counter.data)
        self.assertEqual(post_counter.data["created"], 1)
        self.assertTrue(self.primary_branch.cash_counters.filter(code="CTR-NEW-01").exists())
        self.assertEqual(
            self.primary_branch.cash_counters.get(code="CTR-NEW-01").assigned_user_id,
            cashier.id,
        )
