from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import DocumentSequence
from billing.models import BillingInvoice, BillingInvoiceType, DirectSale, DirectSaleStatus
from subscriptions.models import Emi, FinancialLedger, Payment, PlanType, Subscription, SubscriptionStatus
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class AdminOutstandingsApiTests(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.admin = create_admin_user(username="outstanding_admin", phone="9399000101")
        self.customer = create_customer_profile(name="Outstanding Customer", phone="7399000101")
        self.product = create_product(name="Outstanding Product", product_code="OUT-001", base_price=Decimal("12000.00"))
        self.batch = create_batch(batch_code="OUTBATCH26", start_date=self.today - timedelta(days=50), duration_months=12)
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=9)
        self.emi_subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("12000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=12,
            start_date=self.today - timedelta(days=40),
        )
        self.emi_due = create_emi(
            subscription=self.emi_subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=8),
        )
        self.cancelled_subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=create_lucky_id(batch=self.batch, lucky_number=29),
            total_amount=Decimal("1200.00"),
            monthly_amount=Decimal("100.00"),
            tenure_months=12,
            start_date=self.today - timedelta(days=40),
        )
        self.cancelled_subscription.status = SubscriptionStatus.CANCELLED
        self.cancelled_subscription.save(update_fields=["status"])
        self.cancelled_emi_due = create_emi(
            subscription=self.cancelled_subscription,
            month_no=1,
            amount=Decimal("100.00"),
            due_date=self.today - timedelta(days=9),
        )

        self.rent_sub = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            batch=None,
            lucky_id=None,
            plan_type=PlanType.RENT,
            tenure_months=6,
            start_date=self.today - timedelta(days=15),
            total_amount=Decimal("6000.00"),
            monthly_amount=Decimal("1000.00"),
            status=SubscriptionStatus.ACTIVE,
        )
        create_emi(
            subscription=self.rent_sub,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today,
        )

        self.lease_sub = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            batch=None,
            lucky_id=None,
            plan_type=PlanType.LEASE,
            tenure_months=6,
            start_date=self.today - timedelta(days=5),
            total_amount=Decimal("9000.00"),
            monthly_amount=Decimal("1500.00"),
            status=SubscriptionStatus.ACTIVE,
        )
        create_emi(
            subscription=self.lease_sub,
            month_no=1,
            amount=Decimal("1500.00"),
            due_date=self.today + timedelta(days=4),
        )

        self.doc_series = DocumentSequence.objects.create(
            series_code="OUT26",
            financial_year="2026-2027",
            prefix="OUT",
            next_number=1,
            padding=5,
            is_active=True,
        )
        self.direct_sale = DirectSale.objects.create(
            sale_no="SALE-OUT-001",
            sale_date=self.today - timedelta(days=10),
            financial_year="2026-2027",
            doc_series=self.doc_series,
            customer=self.customer,
            status=DirectSaleStatus.CONFIRMED,
            subtotal=Decimal("2500.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("2500.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("2500.00"),
            received_total=Decimal("1200.00"),
            balance_total=Decimal("1300.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        self.cancelled_sale = DirectSale.objects.create(
            sale_no="SALE-OUT-002",
            sale_date=self.today - timedelta(days=20),
            financial_year="2026-2027",
            doc_series=self.doc_series,
            customer=self.customer,
            status=DirectSaleStatus.CANCELLED,
            subtotal=Decimal("1500.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("1500.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("1500.00"),
            received_total=Decimal("200.00"),
            balance_total=Decimal("1300.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )

        self.linked_invoice = BillingInvoice.objects.create(
            document_no="INV-OUT-LINK-001",
            invoice_date=self.today - timedelta(days=9),
            financial_year="2026-2027",
            document_type=BillingInvoiceType.INVOICE,
            doc_series=self.doc_series,
            customer=self.customer,
            direct_sale=self.direct_sale,
            source_type="DIRECT_SALE",
            source_reference=self.direct_sale.sale_no,
            status="DRAFT",
            subtotal=Decimal("2500.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("2500.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("2500.00"),
            received_total=Decimal("1200.00"),
            balance_total=Decimal("1300.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        self.standalone_invoice = BillingInvoice.objects.create(
            document_no="INV-OUT-STD-001",
            invoice_date=self.today + timedelta(days=2),
            financial_year="2026-2027",
            document_type=BillingInvoiceType.INVOICE,
            doc_series=self.doc_series,
            customer=self.customer,
            source_type="MANUAL",
            source_reference="manual-balance",
            status="DRAFT",
            subtotal=Decimal("2000.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("2000.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("2000.00"),
            received_total=Decimal("500.00"),
            balance_total=Decimal("1500.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )

    def test_admin_can_list_unified_outstandings(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/outstandings/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertGreater(response.data["count"], 0)
        operation_types = {row["operation_type"] for row in response.data["results"]}
        self.assertTrue({"advance_emi", "rent", "lease", "direct_sale", "billing_invoice"}.issubset(operation_types))
        self.assertIn("summary", response.data)
        self.assertIn("total_outstanding_amount", response.data["summary"])

    def test_non_admin_cannot_access_outstandings(self):
        non_admin = create_customer_user(username="outstanding_non_admin", phone="7399000999")
        self.client.force_authenticate(user=non_admin)
        response = self.client.get("/api/v1/admin/outstandings/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_direct_sale_outstanding_appears_when_balance_positive(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/outstandings/?operation=direct_sale")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = {row["source_id"] for row in response.data["results"]}
        self.assertIn(self.direct_sale.id, ids)

    def test_cancelled_direct_sale_does_not_appear(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/outstandings/?operation=direct_sale")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = {row["source_id"] for row in response.data["results"]}
        self.assertNotIn(self.cancelled_sale.id, ids)

    def test_subscription_emi_rent_lease_dues_appear_with_correct_operation_type(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/outstandings/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        by_source = {(row["source_type"], row["source_id"]): row for row in response.data["results"]}
        self.assertEqual(by_source[("EMI", self.emi_due.id)]["operation_type"], "advance_emi")
        rent_emi = Emi.objects.filter(subscription=self.rent_sub).first()
        lease_emi = Emi.objects.filter(subscription=self.lease_sub).first()
        self.assertEqual(by_source[("EMI", rent_emi.id)]["operation_type"], "rent")
        self.assertEqual(by_source[("EMI", lease_emi.id)]["operation_type"], "lease")

    def test_cancelled_subscription_emi_does_not_appear(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/outstandings/?operation=advance_emi")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = {row["source_id"] for row in response.data["results"]}
        self.assertNotIn(self.cancelled_emi_due.id, ids)

    def test_billing_invoice_linked_to_direct_sale_is_not_double_counted(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/outstandings/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        linked_invoice_rows = [row for row in response.data["results"] if row["source_type"] == "BILLING_INVOICE" and row["source_id"] == self.linked_invoice.id]
        self.assertEqual(len(linked_invoice_rows), 0)
        standalone_rows = [row for row in response.data["results"] if row["source_type"] == "BILLING_INVOICE" and row["source_id"] == self.standalone_invoice.id]
        self.assertEqual(len(standalone_rows), 1)

    def test_filters_operation_state_q_and_age_bucket_work(self):
        self.client.force_authenticate(user=self.admin)
        overdue = self.client.get("/api/v1/admin/outstandings/?state=overdue")
        self.assertEqual(overdue.status_code, status.HTTP_200_OK, overdue.data)
        self.assertTrue(all((row["overdue_days"] or 0) > 0 for row in overdue.data["results"]))

        operation = self.client.get("/api/v1/admin/outstandings/?operation=billing_invoice")
        self.assertEqual(operation.status_code, status.HTTP_200_OK, operation.data)
        self.assertTrue(all(row["operation_type"] == "billing_invoice" for row in operation.data["results"]))

        query = self.client.get("/api/v1/admin/outstandings/?q=SALE-OUT-001")
        self.assertEqual(query.status_code, status.HTTP_200_OK, query.data)
        self.assertTrue(any(row["source_type"] == "DIRECT_SALE" for row in query.data["results"]))

        age = self.client.get("/api/v1/admin/outstandings/?age_bucket=8_15")
        self.assertEqual(age.status_code, status.HTTP_200_OK, age.data)
        self.assertTrue(all(row["age_bucket"] == "8_15" for row in age.data["results"]))

    def test_csv_export_works(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/outstandings/export.csv")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("text/csv", response["Content-Type"])
        self.assertIn("operation_type", response.content.decode("utf-8"))

    def test_endpoint_does_not_mutate_financial_state(self):
        self.client.force_authenticate(user=self.admin)
        before = {
            "payments": Payment.objects.count(),
            "ledger": FinancialLedger.objects.count(),
            "emi_statuses": list(Emi.objects.values_list("id", "status")),
            "waived_count": Emi.objects.filter(status="WAIVED").count(),
        }
        response = self.client.get("/api/v1/admin/outstandings/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        after = {
            "payments": Payment.objects.count(),
            "ledger": FinancialLedger.objects.count(),
            "emi_statuses": list(Emi.objects.values_list("id", "status")),
            "waived_count": Emi.objects.filter(status="WAIVED").count(),
        }
        self.assertEqual(before, after)
