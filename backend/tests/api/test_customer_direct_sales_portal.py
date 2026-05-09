from __future__ import annotations

from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import DocumentSequence
from accounting.services.gst_document_posting_service import financial_year_for
from billing.models import BillingInvoice, DirectSale, DirectSaleLine, ReceiptDocument, ReceiptType
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_customer_user,
    create_product,
)


class CustomerDirectSalesPortalApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="cust_ds_admin", phone="9333000001")
        self.customer_user = create_customer_user(
            username="cust_ds_user",
            phone="9333000002",
            email="cust-ds@example.com",
        )
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Customer Direct Sale",
            phone="9333000002",
        )
        self.other_user = create_customer_user(
            username="cust_ds_other_user",
            phone="9333000003",
            email="cust-ds-other@example.com",
        )
        self.other_customer = create_customer_profile(
            user=self.other_user,
            name="Other Customer",
            phone="9333000003",
        )
        self.product = create_product(
            name="Customer Sale Product",
            product_code="CUST-DS-001",
            base_price=Decimal("5000.00"),
        )
        fy = financial_year_for(date(2026, 5, 1))
        self.ds_series = DocumentSequence.objects.create(
            series_code="DIRECT_SALE_INVOICE",
            financial_year=fy,
            prefix=f"DSI-{fy}",
            next_number=100,
            padding=5,
            is_active=True,
        )
        self.inv_series = DocumentSequence.objects.create(
            series_code="BILL_INV",
            financial_year=fy,
            prefix=f"INV-{fy}",
            next_number=100,
            padding=5,
            is_active=True,
        )

        self.own_sale = self._create_direct_sale(
            customer=self.customer,
            sale_no=f"DSI-{fy}-00001",
            grand_total=Decimal("4500.00"),
            received_total=Decimal("1500.00"),
            status="INVOICED",
        )
        self.other_sale = self._create_direct_sale(
            customer=self.other_customer,
            sale_no=f"DSI-{fy}-00002",
            grand_total=Decimal("3000.00"),
            received_total=Decimal("3000.00"),
            status="INVOICED",
        )
        self.walkin_phone_match_sale = self._create_direct_sale(
            customer=None,
            sale_no=f"DSI-{fy}-00003",
            grand_total=Decimal("2500.00"),
            received_total=Decimal("0.00"),
            status="INVOICED",
            customer_name_snapshot="Walkin Snapshot",
            customer_phone_snapshot=self.customer.phone,
        )
        self.cancelled_sale = self._create_direct_sale(
            customer=self.customer,
            sale_no=f"DSI-{fy}-00004",
            grand_total=Decimal("1200.00"),
            received_total=Decimal("0.00"),
            status="CANCELLED",
        )
        self.draft_sale = self._create_direct_sale(
            customer=self.customer,
            sale_no=f"DSI-{fy}-00005",
            grand_total=Decimal("800.00"),
            received_total=Decimal("0.00"),
            status="DRAFT",
        )
        self.own_invoice = self._create_invoice(self.own_sale, document_no=f"INV-{fy}-00001")
        self.other_invoice = self._create_invoice(self.other_sale, document_no=f"INV-{fy}-00002")
        self.own_receipt = self._create_receipt(
            self.own_sale,
            self.own_invoice,
            receipt_no=f"RCT-{fy}-00001",
            amount=Decimal("1500.00"),
        )
        self.other_receipt = self._create_receipt(
            self.other_sale,
            self.other_invoice,
            receipt_no=f"RCT-{fy}-00002",
            amount=Decimal("3000.00"),
        )

    def _create_direct_sale(
        self,
        *,
        customer,
        sale_no: str,
        grand_total: Decimal,
        received_total: Decimal,
        status: str,
        customer_name_snapshot: str | None = None,
        customer_phone_snapshot: str | None = None,
    ) -> DirectSale:
        sale = DirectSale.objects.create(
            sale_no=sale_no,
            sale_date=date(2026, 5, 1),
            financial_year=self.ds_series.financial_year,
            doc_series=self.ds_series,
            customer=customer,
            status=status,
            tax_mode="NON_GST",
            tax_calculation_mode="NON_GST",
            customer_gst_type="UNREGISTERED_CONSUMER",
            subtotal=grand_total,
            discount_total=Decimal("500.00"),
            taxable_total=grand_total,
            tax_total=Decimal("0.00"),
            grand_total=grand_total,
            received_total=received_total,
            balance_total=grand_total - received_total,
            customer_name_snapshot=customer_name_snapshot or (customer.name if customer else "Walkin"),
            customer_phone_snapshot=customer_phone_snapshot or (customer.phone if customer else ""),
        )
        DirectSaleLine.objects.create(
            direct_sale=sale,
            product=self.product,
            description="Customer sale line",
            quantity=Decimal("1.000"),
            unit_price=grand_total,
            discount_amount=Decimal("500.00"),
            taxable_value=grand_total,
            gst_rate=Decimal("0.00"),
            cgst_amount=Decimal("0.00"),
            sgst_amount=Decimal("0.00"),
            igst_amount=Decimal("0.00"),
            line_total=grand_total,
        )
        return sale

    def _create_invoice(self, sale: DirectSale, *, document_no: str) -> BillingInvoice:
        return BillingInvoice.objects.create(
            document_no=document_no,
            invoice_date=sale.sale_date,
            financial_year=sale.financial_year,
            doc_series=self.inv_series,
            customer=sale.customer,
            direct_sale=sale,
            billing_channel="RETAIL",
            source_type="DIRECT_SALE",
            source_reference=sale.sale_no or "",
            tax_mode=sale.tax_mode,
            status="APPROVED",
            subtotal=sale.subtotal,
            discount_total=sale.discount_total,
            taxable_total=sale.taxable_total,
            tax_total=sale.tax_total,
            grand_total=sale.grand_total,
            received_total=sale.received_total,
            balance_total=sale.balance_total,
            customer_name_snapshot=sale.customer_name_snapshot,
            customer_phone_snapshot=sale.customer_phone_snapshot,
        )

    def _create_receipt(
        self,
        sale: DirectSale,
        invoice: BillingInvoice,
        *,
        receipt_no: str,
        amount: Decimal,
    ) -> ReceiptDocument:
        return ReceiptDocument.objects.create(
            receipt_no=receipt_no,
            receipt_type=ReceiptType.RETAIL_RECEIPT,
            status="APPROVED",
            receipt_date=sale.sale_date,
            billing_invoice=invoice,
            direct_sale=sale,
            customer=sale.customer,
            source_type="DIRECT_SALE",
            source_reference=sale.sale_no or "",
            amount=amount,
            customer_name_snapshot=sale.customer_name_snapshot,
            customer_phone_snapshot=sale.customer_phone_snapshot,
        )

    def test_customer_can_list_own_direct_sales(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get("/api/v1/customer/direct-sales/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = {row["id"] for row in response.data["results"]}
        self.assertIn(self.own_sale.id, ids)
        self.assertNotIn(self.other_sale.id, ids)
        self.assertNotIn(self.walkin_phone_match_sale.id, ids)

    def test_customer_can_view_own_direct_sale_detail(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get(f"/api/v1/customer/direct-sales/{self.own_sale.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["id"], self.own_sale.id)
        self.assertEqual(response.data["invoice_number"], self.own_invoice.document_no)
        self.assertEqual(Decimal(response.data["outstanding_amount"]), Decimal("3000.00"))
        self.assertEqual(len(response.data["receipts"]), 1)

    def test_customer_cannot_view_another_customer_direct_sale(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get(f"/api/v1/customer/direct-sales/{self.other_sale.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_walkin_snapshot_only_sale_not_visible_by_phone_match(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get("/api/v1/customer/direct-sales/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = {row["id"] for row in response.data["results"]}
        self.assertNotIn(self.walkin_phone_match_sale.id, ids)

    def test_direct_sale_summary_is_customer_scoped_and_payable_due_excludes_cancelled_and_draft(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get("/api/v1/customer/direct-sales/summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["total_direct_sale_invoices"], 3)
        self.assertEqual(Decimal(response.data["total_paid_direct_sale_amount"]), Decimal("1500.00"))
        self.assertEqual(Decimal(response.data["total_outstanding_direct_sale_dues"]), Decimal("3000.00"))

    def test_customer_safe_serializer_hides_internal_fields(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get(f"/api/v1/customer/direct-sales/{self.own_sale.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        hidden_fields = {"notes", "finance_account", "finance_account_id", "posted_journal_entry", "margin", "cost"}
        for key in hidden_fields:
            self.assertNotIn(key, response.data)

    def test_customer_can_access_own_invoice_pdf_but_not_others(self):
        self.client.force_authenticate(user=self.customer_user)
        own_response = self.client.get(f"/api/v1/customer/invoices/{self.own_invoice.id}/pdf/")
        self.assertEqual(own_response.status_code, status.HTTP_200_OK)
        self.assertIn("application/pdf", own_response["Content-Type"])

        other_response = self.client.get(f"/api/v1/customer/invoices/{self.other_invoice.id}/pdf/")
        self.assertEqual(other_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_can_access_own_receipt_pdf_but_not_others(self):
        self.client.force_authenticate(user=self.customer_user)
        own_response = self.client.get(f"/api/v1/customer/receipts/{self.own_receipt.id}/pdf/")
        self.assertEqual(own_response.status_code, status.HTTP_200_OK)
        self.assertIn("application/pdf", own_response["Content-Type"])

        other_response = self.client.get(f"/api/v1/customer/receipts/{self.other_receipt.id}/pdf/")
        self.assertEqual(other_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_outstanding_amount_respects_discount_and_received_amount(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get(f"/api/v1/customer/direct-sales/{self.own_sale.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(Decimal(response.data["subtotal"]), Decimal("4500.00"))
        self.assertEqual(Decimal(response.data["discount_total"]), Decimal("500.00"))
        self.assertEqual(Decimal(response.data["grand_total"]), Decimal("4500.00"))
        self.assertEqual(Decimal(response.data["paid_amount"]), Decimal("1500.00"))
        self.assertEqual(Decimal(response.data["outstanding_amount"]), Decimal("3000.00"))
