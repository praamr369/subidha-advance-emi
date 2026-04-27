from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import (
    Batch,
    Emi,
    EmiStatus,
    LuckyId,
    LuckyIdStatus,
    Payment,
    PaymentMethod,
    Product,
    PaymentReconciliation,
    ReconciliationStatus,
    Subscription,
    SubscriptionStatus,
)
from tests.helpers import create_admin_user, create_customer_profile, create_partner_user


class Phase5ControlCenterApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="p5_admin", phone="9000020001")
        self.partner = create_partner_user(username="p5_partner", phone="9000020002")
        self.customer = create_customer_profile(name="P5 Customer", phone="9000020003")
        self.product = Product.objects.create(
            name="P5 Product",
            product_code="P5-PROD-01",
            base_price=Decimal("15000.00"),
            category="Furniture",
            subcategory="Chair",
            description="phase5 test",
            is_active=True,
            is_emi_enabled=True,
            is_rent_enabled=True,
            is_lease_enabled=True,
        )
        self.batch = Batch.objects.create(
            batch_code="P5BATCH",
            total_slots=100,
            duration_months=15,
            draw_day=7,
            start_date=timezone.localdate(),
            status="OPEN",
        )
        self.lucky_id = LuckyId.objects.filter(batch=self.batch, lucky_number=51).first()
        if self.lucky_id is None:
            self.lucky_id = LuckyId.objects.create(batch=self.batch, lucky_number=51, status=LuckyIdStatus.AVAILABLE)
        elif self.lucky_id.status != LuckyIdStatus.AVAILABLE:
            self.lucky_id.status = LuckyIdStatus.AVAILABLE
            self.lucky_id.save(update_fields=["status"])
        self.subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            partner=self.partner,
            plan_type="EMI",
            tenure_months=15,
            start_date=timezone.localdate(),
            total_amount=Decimal("15000.00"),
            monthly_amount=Decimal("1000.00"),
            status=SubscriptionStatus.ACTIVE,
            waived_amount=Decimal("0.00"),
        )
        today = timezone.localdate()
        self.emi_pending = Emi.objects.create(
            subscription=self.subscription,
            month_no=1,
            due_date=today - timedelta(days=10),
            amount=Decimal("1500.00"),
            status=EmiStatus.PENDING,
        )
        self.emi_waived = Emi.objects.create(
            subscription=self.subscription,
            month_no=2,
            due_date=today - timedelta(days=5),
            amount=Decimal("900.00"),
            status=EmiStatus.WAIVED,
        )
        self.payment = Payment.objects.create(
            customer=self.customer,
            subscription=self.subscription,
            amount=Decimal("500.00"),
            method=PaymentMethod.CASH,
            payment_date=today,
        )
        self.reconciliation = PaymentReconciliation.objects.create(
            payment=self.payment,
            status=ReconciliationStatus.PENDING,
            expected_amount=Decimal("600.00"),
            paid_amount=Decimal("500.00"),
            variance_amount=Decimal("-100.00"),
            is_flagged=True,
        )

    def test_admin_can_access_accounting_control_center(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/accounting/control-center/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("kpis", response.data)

    def test_non_admin_forbidden_for_accounting_control_center(self):
        self.client.force_authenticate(user=self.partner)
        response = self.client.get("/api/v1/admin/accounting/control-center/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_access_operations_command_center(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/operations/command-center/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("contracts_awaiting_approval", response.data)

    def test_admin_can_access_phase5_report_endpoints(self):
        self.client.force_authenticate(user=self.admin)
        endpoints = [
            "/api/v1/admin/reports/executive-summary/",
            "/api/v1/admin/reports/finance-performance/",
            "/api/v1/admin/reports/contract-performance/",
            "/api/v1/admin/reports/advance-emi-performance/",
            "/api/v1/admin/reports/rent-lease-performance/",
            "/api/v1/admin/reports/direct-sale-performance/",
            "/api/v1/admin/reports/inventory-performance/",
            "/api/v1/admin/reports/delivery-performance/",
            "/api/v1/admin/reports/customer-crm-performance/",
            "/api/v1/admin/reports/partner-performance/",
            "/api/v1/admin/reports/waiver-loss-analysis/",
            "/api/v1/admin/reports/reconciliation-analysis/",
            "/api/v1/admin/reports/overdue-aging/",
            "/api/v1/admin/reports/revenue-trend/",
            "/api/v1/admin/reports/collection-trend/",
            "/api/v1/admin/reports/product-demand-analysis/",
        ]
        for endpoint in endpoints:
            response = self.client.get(endpoint)
            self.assertEqual(response.status_code, status.HTTP_200_OK, endpoint)
            if endpoint.endswith("/executive-summary/"):
                self.assertIn("overview", response.data, endpoint)
            else:
                self.assertIn("meta", response.data, endpoint)

    def test_filter_validation_and_ignored_filters(self):
        self.client.force_authenticate(user=self.admin)
        invalid = self.client.get("/api/v1/admin/reports/finance-performance/?foo=bar")
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        valid = self.client.get("/api/v1/admin/reports/finance-performance/?partner_id=1&category_id=1")
        self.assertEqual(valid.status_code, status.HTTP_200_OK)
        self.assertIn("ignored_filters", valid.data["meta"])

    def test_waived_emi_not_counted_as_collectible_receivable(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/accounting/receivables/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["pending_count"], 1)

    def test_waived_emi_appears_in_waiver_loss(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/accounting/waiver-loss/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["waived_count"], 1)
        self.assertEqual(response.data["waived_amount"], "900.00")

    def test_payment_method_split_matches_records(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/accounting/payment-method-split/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        cash_row = next((row for row in response.data["rows"] if row["method"] == "CASH"), None)
        self.assertIsNotNone(cash_row)
        self.assertEqual(cash_row["net_amount"], "500.00")

    def test_unreconciled_count_matches_records(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/accounting/reconciliation-control/?unreconciled_only=true")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["unreconciled_count"], 1)

    def test_reconciliation_actions_are_operational(self):
        self.client.force_authenticate(user=self.admin)
        reconciled = self.client.post(
            f"/api/v1/admin/accounting/reconciliation/{self.reconciliation.id}/mark-reconciled/",
            data={"reason": "matched to bank statement"},
            format="json",
        )
        self.assertEqual(reconciled.status_code, status.HTTP_200_OK)
        attach = self.client.post(
            f"/api/v1/admin/accounting/reconciliation/{self.reconciliation.id}/attach-reference/",
            data={"reference": "BANK-UTR-123", "reason": "statement link"},
            format="json",
        )
        self.assertEqual(attach.status_code, status.HTTP_200_OK)
        unreconciled = self.client.post(
            f"/api/v1/admin/accounting/reconciliation/{self.reconciliation.id}/mark-unreconciled/",
            data={"reason": "investigation reopened"},
            format="json",
        )
        self.assertEqual(unreconciled.status_code, status.HTTP_200_OK)

    def test_source_map_and_export_endpoints(self):
        self.client.force_authenticate(user=self.admin)
        source_map = self.client.get("/api/v1/admin/reports/source-map/")
        self.assertEqual(source_map.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(source_map.data["count"], 1)
        export = self.client.get("/api/v1/admin/reports/export/?type=finance")
        self.assertEqual(export.status_code, status.HTTP_200_OK)
        self.assertEqual(export["Content-Type"], "text/csv")

