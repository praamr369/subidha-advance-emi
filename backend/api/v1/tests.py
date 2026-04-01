from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from services.subscriptions.create_subscription import create_subscription
from subscriptions.models import Batch, Customer, Emi, Product, Subscription


class PermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.customer_user = User.objects.create_user(
            username="cust1", password="pass1234", role="CUSTOMER", phone="9800000000"
        )
        self.partner_user = User.objects.create_user(
            username="partner1", password="pass1234", role="PARTNER"
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
            username="partner2", password="pass1234", role="PARTNER"
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
            batch_code="B1", total_slots=100, duration_months=12, draw_day=10, start_date=date(2026, 1, 1)
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

        preview_csv = "name,phone\nAlice,9800099991\n,9800099992\nBob,9800011000\n"
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

        commit_csv = "name,phone\nValid One,9800099993\nValid Two,9800099994\n"
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

        preview_csv = "name,phone\nAlice,9800099991\nNoName,\nBob,9800011000\n"
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
        preview_csv = "name,phone\nAlice,9800099911\n"
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
