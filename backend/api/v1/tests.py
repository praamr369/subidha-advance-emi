from datetime import date
from decimal import Decimal

from accounting.models import FinanceAccountKind
from accounting.services.gst_document_posting_service import ensure_document_sequence, financial_year_for
from billing.models import BillingDocumentStatus, BillingInvoice, DirectSale, ReceiptDocument
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from services.subscriptions.create_subscription import create_subscription
from subscriptions.models import (
    Batch,
    BatchStatus,
    ContractReference,
    ContractReferenceType,
    Customer,
    Emi,
    PlanType,
    Product,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionType,
    RentLeaseReturnInspection,
    Subscription,
    SubscriptionDelivery,
    SubscriptionDocument,
    SubscriptionStatus,
)
from subscriptions.services.contract_reference_service import ensure_contract_reference_for_subscription
from tests.helpers import ensure_default_payment_collection_accounts


class PermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.customer_user = User.objects.create_user(
            username="cust1", password="pass1234", role="CUSTOMER", phone="9800000000"
        )
        self.partner_user = User.objects.create_user(
            username="partner1", password="pass1234", role="PARTNER", phone="9800000009"
        )

    def test_unauthenticated_access_blocked(self):
        response = self.client.get("/api/public/stats/")
        self.assertIn(response.status_code, [200, 401, 403, 404])

    def test_authenticated_user_can_access(self):
        self.client.force_authenticate(self.customer_user)
        response = self.client.get("/api/public/stats/")
        self.assertIn(response.status_code, [200, 401, 403, 404])


class Phase9FOperationalReadinessTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.accounts = ensure_default_payment_collection_accounts()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="phase9f_admin",
            password="pass1234",
            role="ADMIN",
            phone="9800090001",
            is_staff=True,
        )
        self.other_admin = User.objects.create_user(
            username="phase9f_other_admin",
            password="pass1234",
            role="ADMIN",
            phone="9800090002",
            is_staff=True,
        )
        self.cashier = User.objects.create_user(
            username="phase9f_cashier",
            password="pass1234",
            role="CASHIER",
            phone="9800090003",
            is_staff=True,
        )
        self.customer_user = User.objects.create_user(
            username="phase9f_customer",
            password="pass1234",
            role="CUSTOMER",
            phone="9800090004",
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            name="Phase 9F Customer",
            phone="9800090004",
            customer_code="KYC-PHASE9F-001",
        )
        self.product = Product.objects.create(
            product_code="P9F-PROD",
            name="Phase 9F Sofa",
            base_price=Decimal("1200.00"),
            is_active=True,
            is_emi_enabled=True,
            is_rent_enabled=True,
            is_lease_enabled=True,
        )
        self.batch = Batch.objects.create(
            batch_code="P9F-BATCH",
            total_slots=100,
            duration_months=12,
            draw_day=5,
            start_date=date(2026, 1, 1),
            status=BatchStatus.OPEN,
        )
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_number=1,
            tenure_months=12,
            start_date=date(2026, 1, 1),
            performed_by=self.admin,
        )
        self.reference = ContractReference.objects.get(subscription=self.subscription)

    def test_business_reset_requires_json_boolean_and_preserves_one_admin(self):
        self.client.force_authenticate(self.admin)

        preview = self.client.get(
            "/api/v1/admin/business-setup/reset-preview/?preserve_username=phase9f_admin"
        )
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data["mode"], "read_only_preview")
        self.assertGreater(preview.data["reset_plan"]["targets"]["total_rows"], 0)
        self.assertEqual(len(preview.data["reset_plan"]["preserved_users"]), 1)

        string_confirm = self.client.post(
            "/api/v1/admin/business-setup/reset/",
            {
                "confirm": "true",
                "preserve_username": "phase9f_admin",
                "delete_non_preserved_users": True,
                "clear_auth_artifacts": True,
                "dry_run": False,
            },
            format="json",
        )
        self.assertEqual(string_confirm.status_code, 400)
        self.assertIn("confirm", string_confirm.data)

        false_confirm = self.client.post(
            "/api/v1/admin/business-setup/reset/",
            {
                "confirm": False,
                "preserve_username": "phase9f_admin",
                "delete_non_preserved_users": True,
                "clear_auth_artifacts": True,
                "dry_run": False,
            },
            format="json",
        )
        self.assertEqual(false_confirm.status_code, 400)

        executed = self.client.post(
            "/api/v1/admin/business-setup/reset/",
            {
                "confirm": True,
                "preserve_username": "phase9f_admin",
                "delete_non_preserved_users": True,
                "clear_auth_artifacts": True,
                "dry_run": False,
            },
            format="json",
        )
        self.assertEqual(executed.status_code, 200, executed.data)
        self.assertEqual(executed.data["mode"], "executed")

        User = get_user_model()
        self.assertEqual(User.objects.filter(role="ADMIN").count(), 1)
        self.assertTrue(User.objects.filter(username="phase9f_admin").exists())
        self.assertFalse(User.objects.filter(username="phase9f_other_admin").exists())
        self.assertEqual(Product.objects.count(), 0)
        self.assertEqual(Customer.objects.count(), 0)
        self.assertEqual(Subscription.objects.count(), 0)
        self.assertFalse(executed.data["post_reset_checklist"]["is_ready_for_go_live"])

    def test_bi_summary_is_admin_only_and_empty_safe(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/bi/summary/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("finance", response.data)
        self.assertIn("subscriptions", response.data)
        self.assertIn("operations", response.data)

        self.client.force_authenticate(self.cashier)
        forbidden = self.client.get("/api/v1/admin/bi/summary/")
        self.assertEqual(forbidden.status_code, 403)

    def test_unified_receivable_search_supports_staff_queries_and_blocks_rent_lease_collection(self):
        self.client.force_authenticate(self.admin)

        for query in [
            self.customer.phone,
            self.reference.reference_no,
            self.batch.batch_code,
            "01",
        ]:
            response = self.client.get(f"/api/v1/admin/receivables/search/?q={query}")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertGreaterEqual(response.data["count"], 1)

        self.client.force_authenticate(self.cashier)
        cashier_phone = self.client.get(
            f"/api/v1/cashier/receivables/search/?q={self.customer.phone}"
        )
        self.assertEqual(cashier_phone.status_code, 200, cashier_phone.data)
        self.assertGreaterEqual(cashier_phone.data["count"], 1)

        rent_subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            plan_type=PlanType.RENT,
            tenure_months=12,
            start_date=date(2026, 1, 1),
            total_amount=Decimal("1200.00"),
            monthly_amount=Decimal("100.00"),
            status=SubscriptionStatus.ACTIVE,
        )
        rent_reference = ensure_contract_reference_for_subscription(rent_subscription)

        self.client.force_authenticate(self.admin)
        rent_search = self.client.get(
            f"/api/v1/admin/receivables/search/?q={rent_reference.reference_no}"
        )
        self.assertEqual(rent_search.status_code, 200, rent_search.data)
        rent_row = rent_search.data["results"][0]
        self.assertEqual(rent_row["source_type"], ContractReferenceType.RENT)
        self.assertEqual(rent_row["allowed_actions"], [])
        self.assertEqual(rent_row["primary_action"], "VIEW_ONLY")
        self.assertIn("production-safe", rent_row["disabled_reason"])

        blocked_collect = self.client.post(
            "/api/v1/admin/receivables/collect/",
            {
                "source_type": ContractReferenceType.RENT,
                "source_id": rent_subscription.id,
                "amount": "100.00",
                "payment_method": "CASH",
                "finance_account_id": self.accounts[FinanceAccountKind.CASH].id,
                "contract_reference_id": rent_reference.id,
            },
            format="json",
        )
        self.assertEqual(blocked_collect.status_code, 400)
        self.assertIn("source_type", str(blocked_collect.data))


class PaymentFlowIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.partner = User.objects.create_user(
            username="partner2", password="pass1234", role="PARTNER", phone="9800000002"
        )
        self.client.force_authenticate(self.partner)

        self.customer_user = User.objects.create_user(
            username="cust2", password="pass1234", role="CUSTOMER", phone="9800000001"
        )
        self.customer = Customer.objects.create(
            user=self.customer_user, name="A", phone="9800000001"
        )
        self.product = Product.objects.create(
            product_code="P-002", name="P", base_price=Decimal("1200.00")
        )
        self.batch = Batch.objects.create(
            batch_code="B1", total_slots=100, duration_months=12, draw_day=10, start_date=date(2026, 1, 1), status="OPEN"
        )
        self.lucky = self.batch.lucky_ids.get(lucky_number=1)
        self.subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky,
            plan_type="EMI",
            tenure_months=12,
            start_date=date(2026, 1, 1),
            total_amount=Decimal("1200.00"),
            monthly_amount=Decimal("100.00"),
        )
        self.emi = Emi.objects.create(
            subscription=self.subscription, month_no=1, due_date=date(2026, 2, 1), amount=Decimal("100.00")
        )

    def test_customer_and_subscription_created(self):
        self.assertIsNotNone(self.customer.id)
        self.assertIsNotNone(self.subscription.id)
        self.assertEqual(self.subscription.customer, self.customer)

    def test_emi_belongs_to_subscription(self):
        self.assertEqual(self.emi.subscription, self.subscription)
        self.assertEqual(self.emi.amount, Decimal("100.00"))


class Phase7BContractTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()

        self.admin = User.objects.create_user(
            username="admin_phase7b",
            password="pass1234",
            role="ADMIN",
            phone="9800010000",
        )
        self.partner = User.objects.create_user(
            username="partner_phase7b",
            password="pass1234",
            role="PARTNER",
            phone="9800010001",
        )
        self.partner_other = User.objects.create_user(
            username="partner_phase7b_other",
            password="pass1234",
            role="PARTNER",
            phone="9800010002",
        )
        self.customer_actor = User.objects.create_user(
            username="customer_actor_phase7b",
            password="pass1234",
            role="CUSTOMER",
            phone="9800010003",
        )

        self.customer_user = User.objects.create_user(
            username="cust_phase7b",
            password="pass1234",
            role="CUSTOMER",
            phone="9800011000",
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            name="Cust Phase7B",
            phone="9800011000",
        )

        self.product = Product.objects.create(
            product_code="P7B-01",
            name="Sofa P7B",
            base_price=Decimal("1000.00"),
        )
        self.batch = Batch.objects.create(
            batch_code="P7B-B01",
            total_slots=100,
            duration_months=10,
            draw_day=5,
            start_date=date(2026, 1, 1),
            status="OPEN",
        )

        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_number=1,
            tenure_months=10,
            partner=self.partner,
            start_date=date(2026, 1, 1),
            performed_by=self.admin,
        )
        self.emi = self.subscription.emis.get(month_no=1)

        self.other_customer_user = User.objects.create_user(
            username="cust_phase7b_2",
            password="pass1234",
            role="CUSTOMER",
            phone="9800012000",
        )
        self.other_customer = Customer.objects.create(
            user=self.other_customer_user,
            name="Other Cust",
            phone="9800012000",
        )
        self.other_subscription = create_subscription(
            customer=self.other_customer,
            product=self.product,
            batch=self.batch,
            lucky_number=2,
            tenure_months=10,
            partner=self.partner_other,
            start_date=date(2026, 1, 1),
            performed_by=self.admin,
        )
        self.other_emi = self.other_subscription.emis.get(month_no=1)

    def test_customer_import_preview_and_commit(self):
        self.client.force_authenticate(self.admin)

        preview_csv = (
            "name,phone,email\n"
            "Alice,9800099991,alice@example.com\n"
            ",9800099992,missing-name@example.com\n"
            "Bob,9800011000,bob@example.com\n"
        )
        preview_file = SimpleUploadedFile("customers.csv", preview_csv.encode("utf-8"), content_type="text/csv")

        preview_response = self.client.post(
            "/api/v1/admin/customers/import-preview/",
            {"file": preview_file},
            format="multipart",
        )
        self.assertEqual(preview_response.status_code, 200)
        self.assertEqual(preview_response.data["row_count"], 3)
        self.assertEqual(preview_response.data["valid_row_count"], 1)
        self.assertEqual(preview_response.data["invalid_row_count"], 2)

        commit_csv = (
            "name,phone,email\n"
            "Valid One,9800099993,valid-one@example.com\n"
            "Valid Two,9800099994,valid-two@example.com\n"
        )
        commit_file = SimpleUploadedFile("customers-commit.csv", commit_csv.encode("utf-8"), content_type="text/csv")

        commit_response = self.client.post(
            "/api/v1/admin/customers/import-csv/",
            {"file": commit_file},
            format="multipart",
        )
        self.assertEqual(commit_response.status_code, 201)
        self.assertEqual(commit_response.data["created"], 2)
        self.assertEqual(commit_response.data["skipped"], 0)

    def test_customer_import_preview_contract(self):
        self.client.force_authenticate(self.admin)

        preview_csv = (
            "name,phone,email\n"
            "Alice,9800099991,alice-preview@example.com\n"
            "NoName,,noname@example.com\n"
            "Bob,9800011000,bob-preview@example.com\n"
        )
        preview_file = SimpleUploadedFile("customers-preview.csv", preview_csv.encode("utf-8"), content_type="text/csv")

        response = self.client.post(
            "/api/v1/admin/customers/import/preview/",
            {"file": preview_file},
            format="multipart",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("columns", response.data)
        self.assertIn("preview_rows", response.data)
        self.assertIn("errors", response.data)
        self.assertEqual(response.data["valid_count"], 1)
        self.assertEqual(response.data["invalid_count"], 2)

    def test_customer_import_preview_requires_admin(self):
        self.client.force_authenticate(self.customer_actor)
        preview_csv = "name,phone,email\nAlice,9800099911,alice-protected@example.com\n"
        preview_file = SimpleUploadedFile("customers-preview.csv", preview_csv.encode("utf-8"), content_type="text/csv")
        response = self.client.post(
            "/api/v1/admin/customers/import/preview/",
            {"file": preview_file},
            format="multipart",
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_customer_list_supports_status_filter(self):
        self.client.force_authenticate(self.admin)

        inactive_user = get_user_model().objects.create_user(
            username="inactive_customer_phase7b",
            password="pass1234",
            role="CUSTOMER",
            phone="9800014555",
            is_active=False,
        )
        inactive_customer = Customer.objects.create(
            user=inactive_user,
            name="Inactive Customer",
            phone="9800014555",
        )

        response = self.client.get("/api/v1/admin/customers/?status=INACTIVE")
        self.assertEqual(response.status_code, 200)

        rows = response.data.get("results", response.data)
        row_ids = {row["id"] for row in rows}

        self.assertIn(inactive_customer.id, row_ids)
        self.assertNotIn(self.customer.id, row_ids)

    def test_admin_product_list_supports_category_and_subcategory_filters(self):
        self.client.force_authenticate(self.admin)

        Product.objects.create(
            product_code="P7B-02",
            name="Dining Chair",
            base_price=Decimal("800.00"),
            category="Chair",
            subcategory="Dining",
        )
        sofa = Product.objects.create(
            product_code="P7B-03",
            name="Family Sofa",
            base_price=Decimal("2400.00"),
            category="Sofa",
            subcategory="L Shape",
        )

        response = self.client.get("/api/v1/admin/products/?category=Sofa&subcategory=L Shape")
        self.assertEqual(response.status_code, 200)

        rows = response.data.get("results", response.data)
        row_ids = {row["id"] for row in rows}

        self.assertIn(sofa.id, row_ids)
        self.assertNotIn(self.product.id, row_ids)

    def test_admin_aggregate_report_endpoints(self):
        self.client.force_authenticate(self.admin)

        revenue = self.client.get("/api/v1/admin/reports/revenue-aggregate/")
        self.assertEqual(revenue.status_code, 200)
        self.assertIn("total_revenue", revenue.data)
        self.assertIn("by_method", revenue.data)

        emi = self.client.get("/api/v1/admin/reports/emi-aggregate/")
        self.assertEqual(emi.status_code, 200)
        self.assertIn("pending_count", emi.data)

        batch = self.client.get("/api/v1/admin/reports/batch-performance-aggregate/")
        self.assertEqual(batch.status_code, 200)
        self.assertIn("results", batch.data)

        reconcile = self.client.get("/api/v1/admin/reports/reconciliation-attention/")
        self.assertEqual(reconcile.status_code, 200)
        self.assertIn("checked_count", reconcile.data)

    def test_admin_summary_report_endpoints(self):
        self.client.force_authenticate(self.admin)

        revenue = self.client.get("/api/v1/admin/reports/revenue-summary/")
        self.assertEqual(revenue.status_code, 200)
        self.assertIn("total_payments", revenue.data)
        self.assertIn("total_amount", revenue.data)
        self.assertIn("by_method", revenue.data)

        emi = self.client.get("/api/v1/admin/reports/emi-summary/")
        self.assertEqual(emi.status_code, 200)
        self.assertIn("total_emis", emi.data)
        self.assertIn("pending_count", emi.data)

        batch = self.client.get("/api/v1/admin/reports/batch-performance/")
        self.assertEqual(batch.status_code, 200)
        self.assertIn("results", batch.data)

    def test_summary_reports_require_admin(self):
        self.client.force_authenticate(self.partner)
        response = self.client.get("/api/v1/admin/reports/revenue-summary/")
        self.assertEqual(response.status_code, 403)

    def test_partner_collection_permissions_and_posting(self):
        self.client.force_authenticate(self.partner)

        forbidden_response = self.client.post(
            "/api/v1/partner/collections/",
            {
                "emi_id": self.other_emi.id,
                "amount": "100.00",
                "method": "CASH",
                "payment_date": "2026-02-01",
                "reference_no": "P7B-FORBIDDEN",
            },
            format="json",
        )
        self.assertEqual(forbidden_response.status_code, 403)

        success_response = self.client.post(
            "/api/v1/partner/collections/",
            {
                "emi_id": self.emi.id,
                "amount": "100.00",
                "method": "CASH",
                "payment_date": "2026-02-01",
                "reference_no": "P7B-OK-001",
            },
            format="json",
        )
        self.assertEqual(success_response.status_code, 201)
        self.assertEqual(str(success_response.data["amount"]), "100.00")

    def test_partner_payment_collect_endpoint(self):
        self.client.force_authenticate(self.partner)

        forbidden = self.client.post(
            "/api/v1/partner/payments/collect/",
            {
                "subscription_id": self.other_subscription.id,
                "emi_id": self.other_emi.id,
                "amount": "100.00",
                "method": "CASH",
                "payment_date": "2026-02-01",
            },
            format="json",
        )
        self.assertEqual(forbidden.status_code, 403)

        invalid_amount = self.client.post(
            "/api/v1/partner/payments/collect/",
            {
                "subscription_id": self.subscription.id,
                "emi_id": self.emi.id,
                "amount": "0.00",
                "method": "CASH",
                "payment_date": "2026-02-01",
            },
            format="json",
        )
        self.assertEqual(invalid_amount.status_code, 400)

        success = self.client.post(
            "/api/v1/partner/payments/collect/",
            {
                "subscription_id": self.subscription.id,
                "emi_id": self.emi.id,
                "amount": "100.00",
                "method": "CASH",
                "payment_date": "2026-02-01",
                "reference_no": "P7B-COLLECT-OK",
            },
            format="json",
        )
        self.assertEqual(success.status_code, 201)
        self.assertEqual(str(success.data["amount"]), "100.00")

    def test_partner_payment_collect_requires_auth(self):
        response = self.client.post(
            "/api/v1/partner/payments/collect/",
            {
                "subscription_id": self.subscription.id,
                "emi_id": self.emi.id,
                "amount": "100.00",
                "method": "CASH",
                "payment_date": "2026-02-01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_timeline_endpoints_backward_compatible(self):
        self.client.force_authenticate(self.admin)

        sub_timeline = self.client.get(f"/api/v1/admin/subscriptions/{self.subscription.id}/timeline/")
        self.assertEqual(sub_timeline.status_code, 200)
        self.assertIn("results", sub_timeline.data)

        draw = self.client.post(f"/api/v1/admin/batches/{self.batch.id}/create-commit/")
        self.assertEqual(draw.status_code, 201)
        draw_id = draw.data["id"]
        draw_timeline = self.client.get(f"/api/v1/admin/lucky-draws/{draw_id}/timeline/")
        self.assertEqual(draw_timeline.status_code, 200)
        self.assertIn("results", draw_timeline.data)


class RentLeaseContractWorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()

        self.admin = User.objects.create_user(
            username="admin_rent_lease",
            password="pass1234",
            role="ADMIN",
            phone="9800020000",
        )
        self.client.force_authenticate(self.admin)

        self.customer_user = User.objects.create_user(
            username="cust_rent_lease",
            password="pass1234",
            role="CUSTOMER",
            phone="9800020001",
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            name="Rent Lease Customer",
            phone="9800020001",
        )

        self.product_rent = Product.objects.create(
            product_code="RENT-001",
            name="Rent Chair",
            base_price=Decimal("1000.00"),
            is_rent_enabled=True,
        )
        self.product_lease = Product.objects.create(
            product_code="LEASE-001",
            name="Lease Sofa",
            base_price=Decimal("1200.00"),
            is_lease_enabled=True,
        )

    def test_rent_contract_create_generates_pdf_and_no_emi_schedule(self):
        response = self.client.post(
            "/api/v1/admin/contracts/rent/",
            {
                "customer": self.customer.id,
                "product": self.product_rent.id,
                "tenure_months": 10,
                "start_date": "2026-01-01",
                "security_deposit_percent": "20.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["plan_type"], "RENT")
        self.assertIsNotNone(response.data.get("rent_profile"))

        subscription_id = response.data["id"]
        subscription = Subscription.objects.get(pk=subscription_id)
        self.assertEqual(subscription.plan_type, "RENT")
        self.assertEqual(subscription.emis.count(), 0)

        pdf_docs = SubscriptionDocument.objects.filter(
            subscription=subscription, document_type="RENT_CONTRACT_PDF"
        )
        self.assertEqual(pdf_docs.count(), 1)

    def test_lease_contract_create_generates_pdf_and_no_emi_schedule(self):
        response = self.client.post(
            "/api/v1/admin/contracts/lease/",
            {
                "customer": self.customer.id,
                "product": self.product_lease.id,
                "tenure_months": 12,
                "start_date": "2026-01-01",
                "security_deposit_percent": "25.00",
                "ownership_transfer_allowed": True,
                "buyout_amount": "200.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["plan_type"], "LEASE")
        self.assertIsNotNone(response.data.get("lease_profile"))

        subscription_id = response.data["id"]
        subscription = Subscription.objects.get(pk=subscription_id)
        self.assertEqual(subscription.plan_type, "LEASE")
        self.assertEqual(subscription.emis.count(), 0)

        pdf_docs = SubscriptionDocument.objects.filter(
            subscription=subscription, document_type="LEASE_CONTRACT_PDF"
        )
        self.assertEqual(pdf_docs.count(), 1)

    def test_deposit_percent_validation_rejects_outside_range(self):
        response = self.client.post(
            "/api/v1/admin/contracts/rent/",
            {
                "customer": self.customer.id,
                "product": self.product_rent.id,
                "tenure_months": 10,
                "start_date": "2026-01-01",
                "security_deposit_percent": "10.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

        response_high = self.client.post(
            "/api/v1/admin/contracts/rent/",
            {
                "customer": self.customer.id,
                "product": self.product_rent.id,
                "tenure_months": 10,
                "start_date": "2026-01-01",
                "security_deposit_percent": "31.00",
            },
            format="json",
        )
        self.assertEqual(response_high.status_code, 400)

    def test_contract_document_upload(self):
        rent = self.client.post(
            "/api/v1/admin/contracts/rent/",
            {
                "customer": self.customer.id,
                "product": self.product_rent.id,
                "tenure_months": 6,
                "start_date": "2026-01-01",
                "security_deposit_percent": "20.00",
            },
            format="json",
        )
        self.assertEqual(rent.status_code, 201)
        subscription_id = rent.data["id"]

        upload_file = SimpleUploadedFile(
            "kyc-id.txt", b"kyc", content_type="text/plain"
        )
        upload_response = self.client.post(
            f"/api/v1/admin/subscriptions/{subscription_id}/documents/",
            {"document_type": "CUSTOMER_KYC_ID", "file": upload_file},
            format="multipart",
        )
        self.assertEqual(upload_response.status_code, 201)
        self.assertEqual(upload_response.data["document_type"], "CUSTOMER_KYC_ID")

    def test_return_assessment_updates_refund_amount(self):
        rent = self.client.post(
            "/api/v1/admin/contracts/rent/",
            {
                "customer": self.customer.id,
                "product": self.product_rent.id,
                "tenure_months": 6,
                "start_date": "2026-01-01",
                "security_deposit_percent": "20.00",
            },
            format="json",
        )
        self.assertEqual(rent.status_code, 201)
        subscription_id = rent.data["id"]

        assessment = self.client.post(
            f"/api/v1/admin/subscriptions/{subscription_id}/return-assessment/",
            {
                "return_condition_status": "DAMAGED",
                "deduction_amount": "50.00",
                "notes": "Minor scratches",
            },
            format="json",
        )
        self.assertEqual(assessment.status_code, 200)
        self.assertIn("rent_profile", assessment.data)
        self.assertEqual(assessment.data["rent_profile"]["return_condition_status"], "DAMAGED")


class Phase9AContractReferenceApiTests(TestCase):
    def setUp(self):
        ensure_default_payment_collection_accounts()
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin_phase9a",
            password="pass1234",
            role="ADMIN",
            phone="9800091000",
            is_staff=True,
        )
        self.cashier = User.objects.create_user(
            username="cashier_phase9a",
            password="pass1234",
            role="CASHIER",
            phone="9800091001",
            is_staff=True,
        )
        self.partner = User.objects.create_user(
            username="partner_phase9a",
            password="pass1234",
            role="PARTNER",
            phone="9800091002",
        )
        self.customer_user = User.objects.create_user(
            username="customer_phase9a",
            password="pass1234",
            role="CUSTOMER",
            phone="9800091003",
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            name="Phase Nine Customer",
            phone="9800091003",
            customer_code="KYC-P9A-001",
        )
        self.product = Product.objects.create(
            product_code="P9A-PRD",
            name="Phase Nine Sofa",
            base_price=Decimal("1200.00"),
        )
        self.batch = Batch.objects.create(
            batch_code="P9A-BATCH",
            total_slots=100,
            duration_months=12,
            draw_day=10,
            start_date=date(2099, 1, 1),
            status="OPEN",
        )
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_number=9,
            tenure_months=12,
            partner=self.partner,
            start_date=date(2099, 1, 1),
            performed_by=self.admin,
        )
        self.reference = ContractReference.objects.get(subscription=self.subscription)

    def _create_direct_sale_reference(self, *, received_total: str = "0.00", grand_total: str = "100.00"):
        fy = financial_year_for(date(2099, 1, 1))
        sequence = ensure_document_sequence(
            series_code="DIRSALE",
            financial_year=fy,
            prefix=f"SALE-{fy}",
            padding=5,
        )
        sale = DirectSale.objects.create(
            sale_no=f"SALE-P9C-{DirectSale.objects.count()+1:04d}",
            sale_date=date(2099, 1, 1),
            financial_year=fy,
            doc_series=sequence,
            customer=self.customer,
            status="INVOICED",
            grand_total=Decimal(grand_total),
            received_total=Decimal(received_total),
            balance_total=Decimal(grand_total) - Decimal(received_total),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        BillingInvoice.objects.create(
            document_no=f"INV-P9C-{BillingInvoice.objects.count()+1:04d}",
            invoice_date=date(2099, 1, 1),
            financial_year=fy,
            doc_series=sequence,
            customer=self.customer,
            direct_sale=sale,
            billing_channel="RETAIL",
            source_type="DIRECT_SALE",
            status=BillingDocumentStatus.DRAFT,
            grand_total=Decimal(grand_total),
            received_total=Decimal(received_total),
            balance_total=Decimal(grand_total) - Decimal(received_total),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        reference = ContractReference.objects.create(
            reference_no=f"SAL/RET/{self.batch.batch_code}/L00/2099/{ContractReference.objects.count()+1:05d}",
            display_reference=f"Direct Sale {sale.id}",
            contract_type="DIRECT_SALE",
            customer=self.customer,
            direct_sale=sale,
            phone_snapshot=self.customer.phone,
            customer_name_snapshot=self.customer.name,
            product_summary_snapshot="Retail Direct Sale",
        )
        return sale, reference

    def _assert_reference_in_admin_search(self, query):
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            "/api/v1/admin/contract-references/",
            {"q": query},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(
            self.reference.reference_no,
            {row["reference_no"] for row in response.data["results"]},
        )

    def test_admin_contract_reference_search_supports_operational_identifiers(self):
        for query in [
            self.customer.phone,
            self.reference.reference_no,
            self.customer.name,
            str(self.customer.id),
            self.customer.customer_code,
            self.batch.batch_code,
            "09",
            str(self.partner.id),
        ]:
            with self.subTest(query=query):
                self._assert_reference_in_admin_search(query)

    def test_admin_receivables_search_returns_normalized_financial_response(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(
            "/api/v1/admin/receivables/search/",
            {"q": self.reference.reference_no},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["source_type"], "ADVANCE_EMI")
        self.assertEqual(row["source_id"], self.subscription.id)
        self.assertEqual(row["reference_no"], self.reference.reference_no)
        self.assertEqual(row["customer_id"], self.customer.id)
        self.assertEqual(row["phone_masked"], "******1003")
        self.assertEqual(row["due_amount"], "100.00")
        self.assertEqual(row["overdue_amount"], "0.00")
        self.assertEqual(row["allowed_actions"], ["COLLECT_EMI"])
        self.assertEqual(row["primary_action"], "COLLECT_EMI")
        self.assertEqual(row["contract_reference_id"], self.reference.id)
        self.assertIn("/admin/finance/collect", row["collection_route"])

    def test_cashier_receivables_search_is_role_scoped_and_masks_admin_fields(self):
        self.client.force_authenticate(self.cashier)

        forbidden = self.client.get(
            "/api/v1/admin/contract-references/",
            {"q": self.reference.reference_no},
        )
        self.assertEqual(forbidden.status_code, 403)

        response = self.client.get(
            "/api/v1/cashier/receivables/search/",
            {"q": self.reference.reference_no},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["reference_no"], self.reference.reference_no)
        self.assertEqual(row["phone_masked"], "******1003")
        self.assertNotIn("phone_snapshot", row)
        self.assertNotIn("partner_snapshot", row)
        self.assertNotIn("kyc_reference_snapshot", row)

    def test_cashier_receivables_search_by_phone_returns_contract_reference(self):
        self.client.force_authenticate(self.cashier)

        response = self.client.get(
            "/api/v1/cashier/receivables/search/",
            {"q": self.customer.phone},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn(
            self.reference.reference_no,
            {row["reference_no"] for row in response.data["results"]},
        )

    def test_admin_receivables_search_supports_batch_and_lucky_queries(self):
        self.client.force_authenticate(self.admin)
        for query in [self.batch.batch_code, "09", self.reference.reference_no]:
            with self.subTest(query=query):
                response = self.client.get("/api/v1/admin/receivables/search/", {"q": query})
                self.assertEqual(response.status_code, 200)
                self.assertIn(
                    self.reference.reference_no,
                    {row["reference_no"] for row in response.data["results"]},
                )

    def test_admin_receivables_collect_advances_emi_via_payment_service(self):
        accounts = ensure_default_payment_collection_accounts()
        cash_id = accounts[FinanceAccountKind.CASH].id
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            "/api/v1/admin/receivables/collect/",
            {
                "source_type": "ADVANCE_EMI",
                "source_id": self.subscription.id,
                "amount": "25.00",
                "payment_method": "CASH",
                "finance_account": cash_id,
                "reference": "P9A-UNIFIED-1",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data.get("source_type"), "ADVANCE_EMI")
        self.assertIn("payment_id", response.data)

    def test_admin_receivables_collect_rejects_rent_source(self):
        accounts = ensure_default_payment_collection_accounts()
        cash_id = accounts[FinanceAccountKind.CASH].id
        rent_sub = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            plan_type=PlanType.RENT,
            tenure_months=6,
            start_date=date(2099, 2, 1),
            total_amount=Decimal("600.00"),
            monthly_amount=Decimal("100.00"),
            status=SubscriptionStatus.ACTIVE,
        )

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/admin/receivables/collect/",
            {
                "source_type": "RENT",
                "source_id": rent_sub.id,
                "amount": "100.00",
                "payment_method": "CASH",
                "finance_account": cash_id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)


    def test_admin_contract_reference_resolve_returns_route_and_primary_action(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            f"/api/v1/admin/contract-references/{self.reference.id}/resolve/",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["contract_reference_id"], self.reference.id)
        self.assertEqual(response.data["source_type"], "ADVANCE_EMI")
        self.assertEqual(response.data["source_id"], self.subscription.id)
        self.assertEqual(response.data["primary_action"], "COLLECT_EMI")
        self.assertEqual(response.data["allowed_actions"], ["COLLECT_EMI"])
        self.assertIn("/admin/finance/collect", response.data["route"])

    def test_cashier_cannot_access_admin_contract_reference_resolve(self):
        self.client.force_authenticate(self.cashier)
        response = self.client.get(
            f"/api/v1/admin/contract-references/{self.reference.id}/resolve/",
        )
        self.assertEqual(response.status_code, 403)

    def test_direct_sale_result_uses_direct_sale_source_id(self):
        sale, ds_reference = self._create_direct_sale_reference(received_total="25.00")
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            "/api/v1/admin/receivables/search/",
            {"q": ds_reference.reference_no},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["source_type"], "DIRECT_SALE")
        self.assertEqual(row["source_id"], sale.id)
        self.assertEqual(row["paid_amount"], "25.00")
        self.assertEqual(row["payment_state"], "PARTIALLY_PAID")

    def test_full_paid_direct_sale_disables_collect_action(self):
        _, ds_reference = self._create_direct_sale_reference(received_total="100.00")
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            "/api/v1/admin/receivables/search/",
            {"q": ds_reference.reference_no},
        )
        self.assertEqual(response.status_code, 200)
        row = response.data["results"][0]
        self.assertEqual(row["primary_action"], "VIEW_ONLY")
        self.assertEqual(row["allowed_actions"], [])
        self.assertEqual(row["due_amount"], "0.00")
        self.assertEqual(row["payment_state"], "FULLY_PAID")
        self.assertIn("no outstanding balance", (row.get("disabled_reason") or "").lower())

    def test_unified_collect_idempotency_replays_identical_request(self):
        accounts = ensure_default_payment_collection_accounts()
        cash_id = accounts[FinanceAccountKind.CASH].id
        self.client.force_authenticate(self.admin)
        body = {
            "source_type": "ADVANCE_EMI",
            "source_id": self.subscription.id,
            "amount": "15.00",
            "payment_method": "CASH",
            "finance_account": cash_id,
            "reference": "P9B-IDEM-1",
            "idempotency_key": "idem-phase-9b-001",
            "contract_reference_id": self.reference.id,
        }
        first = self.client.post(
            "/api/v1/admin/receivables/collect/",
            body,
            format="json",
        )
        second = self.client.post(
            "/api/v1/admin/receivables/collect/",
            body,
            format="json",
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data.get("payment_id"), second.data.get("payment_id"))

    def test_unified_collect_idempotency_rejects_conflicting_payload(self):
        accounts = ensure_default_payment_collection_accounts()
        cash_id = accounts[FinanceAccountKind.CASH].id
        self.client.force_authenticate(self.admin)
        base = {
            "source_type": "ADVANCE_EMI",
            "source_id": self.subscription.id,
            "payment_method": "CASH",
            "finance_account": cash_id,
            "idempotency_key": "idem-phase-9b-conflict",
        }
        first = self.client.post(
            "/api/v1/admin/receivables/collect/",
            {**base, "amount": "10.00", "reference": "P9B-A"},
            format="json",
        )
        self.assertEqual(first.status_code, 201)
        second = self.client.post(
            "/api/v1/admin/receivables/collect/",
            {**base, "amount": "11.00", "reference": "P9B-B"},
            format="json",
        )
        self.assertEqual(second.status_code, 400)

    def test_unified_collect_rejects_mismatched_source_type_for_subscription(self):
        accounts = ensure_default_payment_collection_accounts()
        cash_id = accounts[FinanceAccountKind.CASH].id
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/admin/receivables/collect/",
            {
                "source_type": "LEASE",
                "source_id": self.subscription.id,
                "amount": "10.00",
                "payment_method": "CASH",
                "finance_account": cash_id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_cashier_unified_collect_rejects_unsupported_source_type(self):
        accounts = ensure_default_payment_collection_accounts()
        cash_id = accounts[FinanceAccountKind.CASH].id
        self.client.force_authenticate(self.cashier)
        response = self.client.post(
            "/api/v1/cashier/receivables/collect/",
            {
                "source_type": "LEASE",
                "source_id": self.subscription.id,
                "amount": "10.00",
                "payment_method": "CASH",
                "finance_account": cash_id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class Phase9DPdfDocumentSafetyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin_phase9d", password="pass1234", role="ADMIN", phone="9800092000", is_staff=True
        )
        self.cashier = User.objects.create_user(
            username="cashier_phase9d", password="pass1234", role="CASHIER", phone="9800092001", is_staff=True
        )
        self.customer_user = User.objects.create_user(
            username="customer_phase9d", password="pass1234", role="CUSTOMER", phone="9800092002"
        )
        self.other_customer_user = User.objects.create_user(
            username="customer_phase9d_other", password="pass1234", role="CUSTOMER", phone="9800092003"
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            name="Phase9D Customer",
            phone="9800092002",
            customer_code="KYC-P9D-001",
        )
        self.other_customer = Customer.objects.create(
            user=self.other_customer_user,
            name="Phase9D Other Customer",
            phone="9800092003",
            customer_code="KYC-P9D-002",
        )
        self.product = Product.objects.create(
            product_code="P9D-PRD",
            name="Phase9D Sofa",
            base_price=Decimal("800.00"),
        )
        self.batch = Batch.objects.create(
            batch_code="P9D-BATCH",
            total_slots=100,
            duration_months=10,
            draw_day=5,
            start_date=date(2099, 1, 1),
            status="OPEN",
        )
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_number=1,
            tenure_months=10,
            partner=self.admin,
            start_date=date(2099, 1, 1),
            performed_by=self.admin,
        )
        self.other_subscription = create_subscription(
            customer=self.other_customer,
            product=self.product,
            batch=self.batch,
            lucky_number=2,
            tenure_months=10,
            partner=self.admin,
            start_date=date(2099, 1, 1),
            performed_by=self.admin,
        )
        fy = financial_year_for(date(2099, 1, 1))
        seq = ensure_document_sequence(
            series_code="DIRSALE",
            financial_year=fy,
            prefix=f"SALE-{fy}",
            padding=5,
        )
        self.sale = DirectSale.objects.create(
            sale_no="SALE-P9D-0001",
            sale_date=date(2099, 1, 1),
            financial_year=fy,
            doc_series=seq,
            customer=self.customer,
            status="INVOICED",
            grand_total=Decimal("200.00"),
            received_total=Decimal("50.00"),
            balance_total=Decimal("150.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        self.invoice = BillingInvoice.objects.create(
            document_no="INV-P9D-0001",
            invoice_date=date(2099, 1, 1),
            financial_year=fy,
            doc_series=seq,
            customer=self.customer,
            direct_sale=self.sale,
            billing_channel="RETAIL",
            source_type="DIRECT_SALE",
            status=BillingDocumentStatus.DRAFT,
            source_reference="CR-P9D-REF-0001",
            grand_total=Decimal("200.00"),
            received_total=Decimal("50.00"),
            balance_total=Decimal("150.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        self.other_invoice = BillingInvoice.objects.create(
            document_no="INV-P9D-0002",
            invoice_date=date(2099, 1, 1),
            financial_year=fy,
            doc_series=seq,
            customer=self.other_customer,
            billing_channel="RETAIL",
            source_type="MANUAL",
            status=BillingDocumentStatus.DRAFT,
            grand_total=Decimal("120.00"),
            received_total=Decimal("0.00"),
            balance_total=Decimal("120.00"),
            customer_name_snapshot=self.other_customer.name,
            customer_phone_snapshot=self.other_customer.phone,
        )
        self.receipt = ReceiptDocument.objects.create(
            receipt_no="RCT-P9D-0001",
            receipt_type="RETAIL_RECEIPT",
            status=BillingDocumentStatus.DRAFT,
            receipt_date=date(2099, 1, 2),
            customer=self.customer,
            billing_invoice=self.invoice,
            direct_sale=self.sale,
            source_type="DIRECT_SALE",
            source_reference="CR-P9D-REF-0001",
            amount=Decimal("50.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        self.other_receipt = ReceiptDocument.objects.create(
            receipt_no="RCT-P9D-0002",
            receipt_type="RETAIL_RECEIPT",
            status=BillingDocumentStatus.DRAFT,
            receipt_date=date(2099, 1, 2),
            customer=self.other_customer,
            source_type="MANUAL",
            source_reference="CR-P9D-REF-0002",
            amount=Decimal("20.00"),
            customer_name_snapshot=self.other_customer.name,
            customer_phone_snapshot=self.other_customer.phone,
        )
        self.delivery = SubscriptionDelivery.objects.create(
            subscription=self.subscription,
            delivery_reference="DLV-P9D-0001",
            status="PENDING",
            receiver_name=self.customer.name,
            receiver_phone=self.customer.phone,
            delivery_address_snapshot="Dhaka, Test Address",
            created_by=self.admin,
            updated_by=self.admin,
        )
        self.other_delivery = SubscriptionDelivery.objects.create(
            subscription=self.other_subscription,
            delivery_reference="DLV-P9D-0002",
            status="PENDING",
            receiver_name=self.other_customer.name,
            receiver_phone=self.other_customer.phone,
            delivery_address_snapshot="Other Address",
            created_by=self.admin,
            updated_by=self.admin,
        )

    def test_admin_invoice_pdf_contains_document_number(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/admin/invoices/{self.invoice.id}/pdf/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/pdf", response["Content-Type"])
        self.assertIn(self.invoice.document_no.encode(), response.content)

    def test_admin_receipt_pdf_contains_receipt_number(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/admin/receipts/{self.receipt.id}/pdf/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/pdf", response["Content-Type"])
        self.assertIn(self.receipt.receipt_no.encode(), response.content)

    def test_admin_delivery_pdf_contains_delivery_reference(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/admin/deliveries/{self.delivery.id}/pdf/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/pdf", response["Content-Type"])
        self.assertIn(self.delivery.delivery_reference.encode(), response.content)

    def test_customer_can_download_own_invoice_but_not_others(self):
        self.client.force_authenticate(self.customer_user)
        own = self.client.get(f"/api/v1/customer/invoices/{self.invoice.id}/pdf/")
        other = self.client.get(f"/api/v1/customer/invoices/{self.other_invoice.id}/pdf/")
        self.assertEqual(own.status_code, 200)
        self.assertEqual(other.status_code, 404)

    def test_customer_can_download_own_receipt_but_not_others(self):
        self.client.force_authenticate(self.customer_user)
        own = self.client.get(f"/api/v1/customer/receipts/{self.receipt.id}/pdf/")
        other = self.client.get(f"/api/v1/customer/receipts/{self.other_receipt.id}/pdf/")
        self.assertEqual(own.status_code, 200)
        self.assertEqual(other.status_code, 404)

    def test_customer_can_download_own_delivery_but_not_others(self):
        self.client.force_authenticate(self.customer_user)
        own = self.client.get(f"/api/v1/customer/deliveries/{self.delivery.id}/pdf/")
        other = self.client.get(f"/api/v1/customer/deliveries/{self.other_delivery.id}/pdf/")
        self.assertEqual(own.status_code, 200)
        self.assertEqual(other.status_code, 404)

    def test_cashier_cannot_access_admin_pdf_routes(self):
        self.client.force_authenticate(self.cashier)
        response = self.client.get(f"/api/v1/admin/invoices/{self.invoice.id}/pdf/")
        self.assertEqual(response.status_code, 403)


class Phase9EPdfParityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin_phase9e", password="pass1234", role="ADMIN", phone="9800093000", is_staff=True
        )
        self.cashier = User.objects.create_user(
            username="cashier_phase9e", password="pass1234", role="CASHIER", phone="9800093001", is_staff=True
        )
        self.customer_user = User.objects.create_user(
            username="customer_phase9e", password="pass1234", role="CUSTOMER", phone="9800093002"
        )
        self.other_customer_user = User.objects.create_user(
            username="customer_phase9e_other", password="pass1234", role="CUSTOMER", phone="9800093003"
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            name="Phase9E Customer",
            phone="9800093002",
            customer_code="KYC-P9E-001",
            address="Rent Street 1",
        )
        self.other_customer = Customer.objects.create(
            user=self.other_customer_user,
            name="Phase9E Other Customer",
            phone="9800093003",
            customer_code="KYC-P9E-002",
        )
        self.product = Product.objects.create(
            product_code="P9E-PRD",
            name="Phase9E Wardrobe",
            base_price=Decimal("1500.00"),
        )
        self.rent_subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            plan_type=PlanType.RENT,
            tenure_months=12,
            start_date=date(2099, 1, 1),
            total_amount=Decimal("1200.00"),
            monthly_amount=Decimal("100.00"),
            status=SubscriptionStatus.ACTIVE,
            contract_reference="RC-P9E-001",
            subscription_number="SUB-P9E-R-001",
        )
        self.lease_subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            plan_type=PlanType.LEASE,
            tenure_months=10,
            start_date=date(2099, 1, 1),
            total_amount=Decimal("2000.00"),
            monthly_amount=Decimal("200.00"),
            status=SubscriptionStatus.ACTIVE,
            contract_reference="LC-P9E-001",
            subscription_number="SUB-P9E-L-001",
        )
        self.other_rent_subscription = Subscription.objects.create(
            customer=self.other_customer,
            product=self.product,
            plan_type=PlanType.RENT,
            tenure_months=6,
            start_date=date(2099, 1, 1),
            total_amount=Decimal("600.00"),
            monthly_amount=Decimal("100.00"),
            status=SubscriptionStatus.ACTIVE,
            contract_reference="RC-P9E-002",
            subscription_number="SUB-P9E-R-002",
        )
        from subscriptions.models import RentSubscriptionProfile, LeaseSubscriptionProfile

        self.rent_profile = RentSubscriptionProfile.objects.create(
            subscription=self.rent_subscription,
            security_deposit_percent=Decimal("20.00"),
            security_deposit_amount=Decimal("240.00"),
            refundable_security_deposit=Decimal("200.00"),
            deduction_amount=Decimal("40.00"),
            refund_amount=Decimal("160.00"),
            return_inspection_notes="Inspect for scratches",
            handover_notes="Handle with care",
            contract_terms_snapshot="Return policy applies",
        )
        self.lease_profile = LeaseSubscriptionProfile.objects.create(
            subscription=self.lease_subscription,
            security_deposit_percent=Decimal("25.00"),
            security_deposit_amount=Decimal("500.00"),
            refundable_security_deposit=Decimal("450.00"),
            deduction_amount=Decimal("50.00"),
            refund_amount=Decimal("400.00"),
            contract_terms_snapshot="Renewal available",
        )
        self.deposit_demand = RentLeaseBillingDemand.objects.create(
            subscription=self.rent_subscription,
            demand_type=RentLeaseDemandType.SECURITY_DEPOSIT,
            status="PAID",
            due_date=date(2099, 1, 1),
            amount=Decimal("240.00"),
            collected_amount=Decimal("240.00"),
            held_amount=Decimal("240.00"),
            refundable_amount=Decimal("180.00"),
            deducted_amount=Decimal("60.00"),
            reference_key="RL-P9E-DEP-001",
            metadata={"payment_method": "CASH"},
        )
        self.other_deposit_demand = RentLeaseBillingDemand.objects.create(
            subscription=self.other_rent_subscription,
            demand_type=RentLeaseDemandType.SECURITY_DEPOSIT,
            status="PAID",
            due_date=date(2099, 1, 1),
            amount=Decimal("200.00"),
            collected_amount=Decimal("200.00"),
            held_amount=Decimal("200.00"),
            refundable_amount=Decimal("200.00"),
            deducted_amount=Decimal("0.00"),
            reference_key="RL-P9E-DEP-002",
            metadata={},
        )
        self.refund_tx = RentLeaseDepositTransaction.objects.create(
            subscription=self.rent_subscription,
            demand=self.deposit_demand,
            transaction_type=RentLeaseDepositTransactionType.REFUND_APPROVED,
            amount=Decimal("180.00"),
            approved_by=self.admin,
            performed_by=self.admin,
            metadata={},
        )
        RentLeaseDepositTransaction.objects.create(
            subscription=self.rent_subscription,
            demand=self.deposit_demand,
            transaction_type=RentLeaseDepositTransactionType.DEDUCTION,
            amount=Decimal("60.00"),
            reason="Damage on panel",
            approved_by=self.admin,
            performed_by=self.admin,
            metadata={},
        )
        self.inspection = RentLeaseReturnInspection.objects.create(
            subscription=self.rent_subscription,
            status="APPROVED",
            outcome="DAMAGED",
            inspection_date=date(2099, 2, 1),
            condition_recorded="DAMAGED",
            damage_notes="Panel scratch",
            damage_deduction_amount=Decimal("60.00"),
            deposit_refund_amount=Decimal("180.00"),
            deposit_refund_approved=True,
            inspected_by=self.admin,
            approved_by=self.admin,
            stock_routing_notes="Missing hinge",
        )
        self.other_inspection = RentLeaseReturnInspection.objects.create(
            subscription=self.other_rent_subscription,
            status="COMPLETED",
            outcome="GOOD",
            inspection_date=date(2099, 2, 1),
            condition_recorded="GOOD",
        )

    def test_admin_rent_contract_pdf_returns_pdf(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/admin/rent-contracts/{self.rent_subscription.id}/pdf/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/pdf", response["Content-Type"])
        self.assertIn(b"RC-P9E-001", response.content)

    def test_admin_lease_contract_pdf_returns_pdf(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/admin/lease-contracts/{self.lease_subscription.id}/pdf/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/pdf", response["Content-Type"])
        self.assertIn(b"LC-P9E-001", response.content)

    def test_admin_deposit_pdf_and_refund_deduction_pdfs_return_pdf(self):
        self.client.force_authenticate(self.admin)
        dep = self.client.get(f"/api/v1/admin/finance/deposits/{self.deposit_demand.id}/pdf/")
        refund = self.client.get(f"/api/v1/admin/finance/deposits/{self.deposit_demand.id}/refund-pdf/")
        deduction = self.client.get(f"/api/v1/admin/finance/deposits/{self.deposit_demand.id}/deduction-pdf/")
        self.assertEqual(dep.status_code, 200)
        self.assertEqual(refund.status_code, 200)
        self.assertEqual(deduction.status_code, 200)
        self.assertIn(b"RL-P9E-DEP-001", dep.content)
        self.assertIn(b"RL-P9E-DEP-001", refund.content)
        self.assertIn(b"RL-P9E-DEP-001", deduction.content)

    def test_admin_return_inspection_pdf_returns_pdf(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/admin/returns/{self.inspection.id}/inspection-pdf/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/pdf", response["Content-Type"])
        self.assertIn(b"INSPECT-", response.content)

    def test_customer_document_access_enforces_ownership(self):
        self.client.force_authenticate(self.customer_user)
        rent_own = self.client.get(f"/api/v1/customer/rent-contracts/{self.rent_subscription.id}/pdf/")
        lease_own = self.client.get(f"/api/v1/customer/lease-contracts/{self.lease_subscription.id}/pdf/")
        dep_own = self.client.get(f"/api/v1/customer/deposits/{self.deposit_demand.id}/pdf/")
        insp_own = self.client.get(f"/api/v1/customer/returns/{self.inspection.id}/inspection-pdf/")
        dep_other = self.client.get(f"/api/v1/customer/deposits/{self.other_deposit_demand.id}/pdf/")
        insp_other = self.client.get(f"/api/v1/customer/returns/{self.other_inspection.id}/inspection-pdf/")
        self.assertEqual(rent_own.status_code, 200)
        self.assertEqual(lease_own.status_code, 200)
        self.assertEqual(dep_own.status_code, 200)
        self.assertEqual(insp_own.status_code, 200)
        self.assertEqual(dep_other.status_code, 404)
        self.assertEqual(insp_other.status_code, 404)

    def test_cashier_blocked_from_admin_phase9e_pdf_routes(self):
        self.client.force_authenticate(self.cashier)
        response = self.client.get(f"/api/v1/admin/rent-contracts/{self.rent_subscription.id}/pdf/")
        self.assertEqual(response.status_code, 403)

    def test_deposit_pdf_uses_authoritative_values(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/admin/finance/deposits/{self.deposit_demand.id}/pdf/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"240.00", response.content)
        self.assertIn(b"180.00", response.content)
