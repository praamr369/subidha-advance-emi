from datetime import date
from decimal import Decimal

from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from billing.services.billing_service import approve_billing_invoice, create_direct_sale, post_billing_invoice
from subscriptions.models import Emi, LuckyDraw, OperationalCancellation, Payment
from inventory.models import InventoryItem
from tests.helpers import create_admin_user, create_customer_profile, create_product


class ReversalControlBlockerTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="rev_case_admin", phone="9386333001")
        self.client.force_authenticate(user=self.admin)
        self.customer = create_customer_profile(name="Reversal Blocker Customer", phone="7386333001")
        self.product = create_product(name="Reversal Blocker Product", product_code="REV-BLOCK-001", base_price=Decimal("1000.00"))
        self.inventory_item = InventoryItem.objects.create(product=self.product, sku="REV-BLOCK-SKU-001", opening_stock_qty=Decimal("5.000"), reorder_level_qty=Decimal("1.000"), standard_unit_cost=Decimal("700.00"))
        cash_chart = ChartOfAccount.objects.create(code="REV-BLOCK-CASH-001", name="Reversal Block Cash", account_type=ChartOfAccountType.ASSET)
        self.cash_account = FinanceAccount.objects.create(name="Reversal Block Cash Counter", kind=FinanceAccountKind.CASH, chart_account=cash_chart, opening_balance=Decimal("0.00"))

    def _create_sale(self, *, received_total: Decimal = Decimal("0.00")):
        return create_direct_sale(
            payload={
                "sale_date": date(2026, 4, 15),
                "customer": self.customer,
                "tax_mode": "NON_GST",
                "finance_account": self.cash_account,
                "delivery_required": False,
                "received_total": received_total,
                "customer_name_snapshot": self.customer.name,
                "customer_phone_snapshot": self.customer.phone,
                "lines": [{"product": self.product, "inventory_item": self.inventory_item, "description": "Blocker line", "quantity": Decimal("1.000"), "unit_price": Decimal("1000.00"), "discount_amount": Decimal("0.00"), "taxable_value": Decimal("1000.00"), "gst_rate": None, "cgst_amount": Decimal("0.00"), "sgst_amount": Decimal("0.00"), "igst_amount": Decimal("0.00"), "line_total": Decimal("1000.00"), "hsn_sac_code": ""}],
            },
            created_by=self.admin,
        )

    def test_manage_py_check_passes(self):
        call_command("check")

    def test_manual_settlement_large_source_id_and_reference_are_valid(self):
        before = {
            "emi": Emi.objects.count(),
            "payment": Payment.objects.count(),
            "draw": LuckyDraw.objects.count(),
        }
        response = self.client.post(
            "/api/v1/admin/finance/reversal-cases/",
            {
                "source_type": "OTHER",
                "source_id": 9_223_372_036,
                "source_reference": "DOC-REV-9000",
                "reversal_type": "MANUAL_SETTLEMENT",
                "amount_snapshot": "10.00",
                "reason": "Manual settlement case",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        case = OperationalCancellation.objects.get(pk=response.data["id"])
        self.assertEqual(case.cancellation_type, OperationalCancellation.CancellationType.MANUAL_SETTLEMENT)
        self.assertEqual(case.source_id, 9_223_372_036)
        self.assertEqual(case.source_reference, "DOC-REV-9000")
        self.assertEqual(case.amount_snapshot, Decimal("10.00"))
        self.assertEqual(Emi.objects.count(), before["emi"])
        self.assertEqual(Payment.objects.count(), before["payment"])
        self.assertEqual(LuckyDraw.objects.count(), before["draw"])

    def test_manual_case_can_use_document_reference_without_source_id(self):
        response = self.client.post(
            "/api/v1/admin/finance/reversal-cases/",
            {
                "source_type": "OTHER",
                "source_id": "MANUAL-DOC-123",
                "reversal_type": "MANUAL_SETTLEMENT",
                "reason": "Manual document-only case",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIsNone(response.data["source_id"])
        self.assertEqual(response.data["source_reference"], "MANUAL-DOC-123")

    def test_invalid_cancellation_type_returns_400_not_500(self):
        response = self.client.post(
            "/api/v1/admin/finance/reversal-cases/",
            {
                "source_type": "OTHER",
                "source_id": 1001,
                "reversal_type": "NOT_ALLOWED",
                "reason": "Invalid reversal type",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invoice_reversal_is_blocked_by_active_posted_receipts(self):
        sale = self._create_sale(received_total=Decimal("1000.00"))
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)

        response = self.client.post(
            f"/api/v1/billing/invoices/{invoice.id}/cancel/",
            {"reason": "Customer cancelled", "confirm": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"][0], "Reverse linked receipts before cancelling this invoice.")
        self.assertEqual(response.data["blocking_reasons"][0], "Reverse linked receipts before cancelling this invoice.")

    def test_invoice_reversal_is_not_blocked_by_void_receipts(self):
        sale = self._create_sale(received_total=Decimal("1000.00"))
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        receipt = invoice.receipts.first()

        void_response = self.client.post(
            f"/api/v1/admin/billing/receipts/{receipt.id}/void/",
            {"reason": "Counter correction"},
            format="json",
        )
        self.assertEqual(void_response.status_code, status.HTTP_200_OK, void_response.data)

        response = self.client.post(
            f"/api/v1/billing/invoices/{invoice.id}/cancel/",
            {"reason": "Customer cancelled", "confirm": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
