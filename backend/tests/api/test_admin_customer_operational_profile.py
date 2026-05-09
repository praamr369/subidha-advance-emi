from datetime import date
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from billing.models import BillingInvoice
from billing.models import DirectSale
from billing.services.billing_service import approve_billing_invoice, create_direct_sale, post_billing_invoice
from billing.services.direct_sale_collection_service import collect_direct_sale_payment
from inventory.models import InventoryItem
from subscriptions.models import PublicLeadIntent
from subscriptions.models import SubscriptionDocument, SubscriptionDocumentType
from subscriptions.services.public_lead_service import create_admin_lead
from subscriptions.services.payment_service import record_emi_payment
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


class AdminCustomerOperationalProfileApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="customer_ops_admin",
            phone="9389300001",
        )
        self.client.force_authenticate(user=self.admin)

        self.customer = create_customer_profile(
            name="Operational Profile Customer",
            phone="7389300001",
        )
        self.product = create_product(
            name="Operational Profile Product",
            product_code="CUST-OPS-001",
            base_price=Decimal("1500.00"),
        )
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="CUST-OPS-SKU-001",
            opening_stock_qty=Decimal("8.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("900.00"),
        )
        self.cash_account = FinanceAccount.objects.create(
            name="Operational Cash",
            kind=FinanceAccountKind.CASH,
            chart_account=ChartOfAccount.objects.create(
                code="CUST-OPS-CASH-001",
                name="Operational Customer Cash",
                account_type=ChartOfAccountType.ASSET,
            ),
            opening_balance=Decimal("0.00"),
        )

        batch = create_batch(
            batch_code="CUSTOPS0426",
            duration_months=12,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 4, 1),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=9)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("1500.00"),
            monthly_amount=Decimal("125.00"),
            tenure_months=12,
        )
        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("125.00"),
            due_date=date(2026, 4, 10),
        )
        record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("125.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="CUST-OPS-EMI-001",
            payment_date=date(2026, 4, 10),
        )

        SubscriptionDocument.objects.create(
            subscription=self.subscription,
            document_type=SubscriptionDocumentType.CUSTOMER_KYC_ID,
            file=SimpleUploadedFile("customer-kyc.txt", b"kyc"),
            uploaded_by=self.admin,
        )

        self.direct_sale = create_direct_sale(
            payload={
                "sale_date": date(2026, 4, 12),
                "customer": self.customer,
                "tax_mode": "NON_GST",
                "finance_account": self.cash_account,
                "delivery_required": False,
                "received_total": Decimal("500.00"),
                "customer_name_snapshot": self.customer.name,
                "customer_phone_snapshot": self.customer.phone,
                "notes": "Customer operational direct sale",
                "lines": [
                    {
                        "product": self.product,
                        "inventory_item": self.inventory_item,
                        "description": "Customer operational direct sale line",
                        "quantity": Decimal("1.000"),
                        "unit_price": Decimal("900.00"),
                        "discount_amount": Decimal("0.00"),
                        "taxable_value": Decimal("900.00"),
                        "gst_rate": None,
                        "cgst_amount": Decimal("0.00"),
                        "sgst_amount": Decimal("0.00"),
                        "igst_amount": Decimal("0.00"),
                        "line_total": Decimal("900.00"),
                        "hsn_sac_code": "",
                    }
                ],
            },
            created_by=self.admin,
        )
        create_admin_lead(
            name=self.customer.name,
            phone=self.customer.phone,
            city=self.customer.city or "",
            product=self.product,
            interested_product=self.product.name,
            intent=PublicLeadIntent.QUOTATION,
            source="OFFLINE_WALK_IN",
            notes="Customer asked for quotation before direct-sale confirmation.",
            follow_up_required=True,
            follow_up_on=date(2026, 4, 18),
            follow_up_note="Share final estimate and close sale.",
            performed_by=self.admin,
        )
        invoice = BillingInvoice.objects.get(direct_sale=self.direct_sale)
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        collect_direct_sale_payment(
            direct_sale_id=self.direct_sale.id,
            amount=Decimal("200.00"),
            collected_by=self.admin,
            finance_account_id=self.cash_account.id,
            reference_no="CUST-OPS-DIR-001",
        )

    def test_admin_operational_profile_returns_subscription_direct_sale_and_receipt_sections(self):
        response = self.client.get(
            f"/api/v1/admin/customers/{self.customer.id}/operational-profile/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["customer"]["id"], self.customer.id)
        self.assertEqual(response.data["overview"]["subscription_count"], 1)
        self.assertEqual(response.data["direct_sales"]["summary"]["total_count"], 1)
        self.assertEqual(
            response.data["direct_sales"]["summary"]["outstanding_total"],
            "200.00",
        )
        self.assertEqual(response.data["payments"]["summary"]["active_count"], 1)
        self.assertEqual(response.data["receipts_documents"]["summary"]["receipt_count"], 2)
        self.assertEqual(response.data["receipts_documents"]["summary"]["document_count"], 1)
        self.assertEqual(response.data["receipts_documents"]["summary"]["invoice_count"], 1)
        self.assertEqual(len(response.data["direct_sales"]["rows"]), 1)
        self.assertEqual(len(response.data["subscriptions"]["rows"]), 1)
        self.assertGreaterEqual(response.data["leads"]["summary"]["total_count"], 1)
        self.assertEqual(response.data["quotation_estimates"]["summary"]["quotation_count"], 1)

    def test_cancelled_subscription_moves_to_history_only_metrics(self):
        type(self.subscription).objects.filter(pk=self.subscription.pk).update(status="CANCELLED")

        response = self.client.get(
            f"/api/v1/admin/customers/{self.customer.id}/operational-profile/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["overview"]["active_subscriptions"], 0)
        self.assertEqual(response.data["overview"]["active_contract_value"], "0.00")
        self.assertEqual(response.data["overview"]["historical_subscriptions"], 1)
        self.assertEqual(response.data["overview"]["historical_contract_value"], "1500.00")

    def test_returned_direct_sale_excluded_from_active_outstanding(self):
        DirectSale.objects.filter(pk=self.direct_sale.pk).update(
            status="RETURNED",
            balance_total=Decimal("200.00"),
        )

        response = self.client.get(
            f"/api/v1/admin/customers/{self.customer.id}/operational-profile/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["overview"]["direct_sale_outstanding_total"], "0.00")
        self.assertEqual(response.data["direct_sales"]["summary"]["outstanding_total"], "0.00")
        self.assertEqual(response.data["direct_sales"]["summary"]["history_count"], 1)

    def test_reversed_payment_excluded_from_active_count_and_collected_amount(self):
        payment = self.subscription.payments.order_by("-id").first()
        metadata = dict(payment.allocation_metadata or {})
        metadata["reversal"] = {"is_reversed": True}
        type(payment).objects.filter(pk=payment.pk).update(allocation_metadata=metadata)

        response = self.client.get(
            f"/api/v1/admin/customers/{self.customer.id}/operational-profile/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["payments"]["summary"]["active_count"], 0)
        self.assertEqual(response.data["payments"]["summary"]["reversed_count"], 1)
        self.assertEqual(response.data["payments"]["summary"]["active_collected_amount"], "0.00")

    def test_cancelled_contract_history_value_is_counted_once_not_per_emi_row(self):
        customer = create_customer_profile(
            user=create_customer_user(
                username="cancel_hist_once_customer",
                phone="7389300999",
            ),
            name="Cancelled Contract History Once",
            phone="7389300999",
        )
        product = create_product(
            name="Cancelled History Product",
            product_code="CUST-OPS-CANCEL-001",
            base_price=Decimal("67500.00"),
        )
        batch = create_batch(
            batch_code="CUSTOPSCANCEL0426",
            duration_months=15,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 4, 1),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=27)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("67500.00"),
            monthly_amount=Decimal("4500.00"),
            tenure_months=15,
            status="CANCELLED",
        )
        for month_no in range(1, 16):
            create_emi(
                subscription=subscription,
                month_no=month_no,
                amount=Decimal("4500.00"),
                due_date=date(2026, 4, 1),
            )

        response = self.client.get(
            f"/api/v1/admin/customers/{customer.id}/operational-profile/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["overview"]["active_subscriptions"], 0)
        self.assertEqual(response.data["overview"]["active_contract_value"], "0.00")
        self.assertEqual(response.data["overview"]["historical_subscriptions"], 1)
        self.assertEqual(response.data["overview"]["historical_contract_value"], "67500.00")
        self.assertNotEqual(
            response.data["overview"]["historical_contract_value"], "1012500.00"
        )

        list_response = self.client.get("/api/v1/admin/customers/")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK, list_response.data)
        rows = list_response.data.get("results") if isinstance(list_response.data, dict) else list_response.data
        customer_row = next((row for row in rows if row.get("id") == customer.id), None)
        self.assertIsNotNone(customer_row)
        self.assertEqual(customer_row["active_subscription_count"], 0)
        self.assertEqual(customer_row["active_contract_value"], "0.00")
        self.assertEqual(customer_row["active_subscription_due"], "0.00")
        self.assertEqual(customer_row["historical_contract_value"], "67500.00")
