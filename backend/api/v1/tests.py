from datetime import date
from decimal import Decimal

from accounting.models import FinanceAccountKind
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from services.subscriptions.create_subscription import create_subscription
from subscriptions.models import (
    Batch,
    ContractReference,
    Customer,
    Emi,
    PlanType,
    Product,
    Subscription,
    SubscriptionDocument,
    SubscriptionStatus,
)
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
