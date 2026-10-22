from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, DocumentSequence, FinanceAccount, FinanceAccountKind
from accounting.services.document_sequence_service import DocumentType
from billing.models import ReceiptDocument
from inventory.models import InventoryItem, PurchaseNeed, PurchaseNeedStatus
from deliveries.services.product_possession_service import record_handover
from contracts.services.rent_lease_contract_service import create_rent_contract
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_product,
    ensure_document_numbering_profile_for_date,
    ensure_test_accounting_posting_prerequisites,
    ensure_test_collection_purpose_mapping,
)


class DirectSaleApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="direct_sale_api_admin",
            phone="9388000011",
        )
        self.client.force_authenticate(user=self.admin)
        ensure_test_accounting_posting_prerequisites(performed_by=self.admin)
        ensure_test_accounting_posting_prerequisites(date(2026, 4, 1), performed_by=self.admin)
        ensure_document_numbering_profile_for_date(DocumentType.DIRECT_SALE, date.today(), performed_by=self.admin)
        ensure_document_numbering_profile_for_date(DocumentType.TAX_INVOICE, date.today(), performed_by=self.admin)
        self.customer = create_customer_profile(
            name="Direct Sale API Customer",
            phone="7388000011",
        )
        self.product = create_product(
            name="API Direct Sale Product",
            product_code="DIR-SALE-API-001",
            base_price=Decimal("9500.00"),
        )
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="DIR-SALE-API-SKU-001",
            opening_stock_qty=Decimal("7.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("6500.00"),
        )
        cash_chart = ChartOfAccount.objects.create(
            code="DIRSALE-API-CASH-001",
            name="Direct Sale API Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="API Retail Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )
        ensure_test_collection_purpose_mapping(finance_account=self.cash_account)

    def test_admin_can_create_confirm_and_filter_direct_sale_documents(self):
        response = self.client.post(
            "/api/v1/billing/direct-sales/",
            {
                "sale_date": date(2026, 4, 16),
                "customer": self.customer.id,
                "tax_mode": "NON_GST",
                "finance_account": self.cash_account.id,
                "delivery_required": False,
                "customer_name_snapshot": self.customer.name,
                "customer_phone_snapshot": self.customer.phone,
                "subtotal": "9500.00",
                "discount_total": "0.00",
                "taxable_total": "9500.00",
                "tax_total": "0.00",
                "grand_total": "9500.00",
                "received_total": "5000.00",
                "balance_total": "4500.00",
                "notes": "API direct retail sale",
                "lines": [
                    {
                        "product": self.product.id,
                        "inventory_item": self.inventory_item.id,
                        "description": "API retail line",
                        "quantity": "1.000",
                        "unit_price": "9500.00",
                        "discount_amount": "0.00",
                        "taxable_value": "9500.00",
                        "gst_rate": None,
                        "cgst_amount": "0.00",
                        "sgst_amount": "0.00",
                        "igst_amount": "0.00",
                        "line_total": "9500.00",
                        "hsn_sac_code": "",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        direct_sale_id = response.data["id"]
        billing_invoice_id = response.data["billing_invoice_id"]
        self.assertTrue(billing_invoice_id)

        confirm = self.client.post(
            f"/api/v1/billing/direct-sales/{direct_sale_id}/confirm/",
            {},
            format="json",
        )
        self.assertEqual(confirm.status_code, status.HTTP_200_OK, confirm.data)
        self.assertEqual(confirm.data["direct_sale"]["status"], "CONFIRMED")

        invoice_list = self.client.get(
            f"/api/v1/billing/invoices/?direct_sale={direct_sale_id}"
        )
        self.assertEqual(invoice_list.status_code, status.HTTP_200_OK, invoice_list.data)
        self.assertEqual(invoice_list.data["count"], 1)
        self.assertEqual(invoice_list.data["results"][0]["source_type"], "DIRECT_SALE")
        self.assertEqual(invoice_list.data["results"][0]["direct_sale"], direct_sale_id)

    def test_admin_can_collect_outstanding_direct_sale_balance(self):
        create_response = self.client.post(
            "/api/v1/billing/direct-sales/",
            {
                "sale_date": date(2026, 4, 17),
                "customer": self.customer.id,
                "tax_mode": "NON_GST",
                "finance_account": self.cash_account.id,
                "delivery_required": False,
                "customer_name_snapshot": self.customer.name,
                "customer_phone_snapshot": self.customer.phone,
                "subtotal": "9500.00",
                "discount_total": "0.00",
                "taxable_total": "9500.00",
                "tax_total": "0.00",
                "grand_total": "9500.00",
                "received_total": "5000.00",
                "balance_total": "4500.00",
                "notes": "Outstanding direct-sale collection test",
                "lines": [
                    {
                        "product": self.product.id,
                        "inventory_item": self.inventory_item.id,
                        "description": "Outstanding direct-sale line",
                        "quantity": "1.000",
                        "unit_price": "9500.00",
                        "discount_amount": "0.00",
                        "taxable_value": "9500.00",
                        "gst_rate": None,
                        "cgst_amount": "0.00",
                        "sgst_amount": "0.00",
                        "igst_amount": "0.00",
                        "line_total": "9500.00",
                        "hsn_sac_code": "",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)

        direct_sale_id = create_response.data["id"]
        invoice_id = create_response.data["billing_invoice_id"]
        self.assertTrue(invoice_id)

        approve_response = self.client.post(
            f"/api/v1/billing/invoices/{invoice_id}/approve/",
            {},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK, approve_response.data)

        post_response = self.client.post(
            f"/api/v1/billing/invoices/{invoice_id}/post/",
            {},
            format="json",
        )
        self.assertEqual(post_response.status_code, status.HTTP_200_OK, post_response.data)

        collect_response = self.client.post(
            f"/api/v1/billing/direct-sales/{direct_sale_id}/collect/",
            {
                "amount": "4500.00",
                "finance_account_id": self.cash_account.id,
                "reference_no": "DIRSALE-API-COLLECT-001",
                "notes": "Collected later from admin",
            },
            format="json",
        )
        self.assertEqual(collect_response.status_code, status.HTTP_201_CREATED, collect_response.data)
        self.assertTrue(collect_response.data["created"])
        self.assertEqual(collect_response.data["direct_sale"]["balance_total"], "0.00")
        self.assertEqual(collect_response.data["invoice"]["balance_total"], "0.00")
        self.assertEqual(collect_response.data["receipt"]["amount"], "4500.00")

        outstanding_list = self.client.get("/api/v1/billing/direct-sales/?outstanding_only=true")
        self.assertEqual(outstanding_list.status_code, status.HTTP_200_OK, outstanding_list.data)
        self.assertEqual(outstanding_list.data["count"], 0)

    def test_direct_sale_create_returns_clear_400_when_numbering_missing(self):
        DocumentSequence.objects.filter(document_type="DIRECT_SALE").delete()
        response = self.client.post(
            "/api/v1/billing/direct-sales/",
            {
                "sale_date": date(2026, 4, 16),
                "customer": self.customer.id,
                "tax_mode": "NON_GST",
                "finance_account": self.cash_account.id,
                "customer_name_snapshot": self.customer.name,
                "customer_phone_snapshot": self.customer.phone,
                "lines": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Direct sale invoice numbering is not configured", str(response.data))

    def test_direct_sale_create_rejects_product_under_active_rent_possession(self):
        self.product.is_rent_enabled = True
        self.product.save(update_fields=["is_rent_enabled"])
        rent_sub = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=6,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        possession = rent_sub.product_possession
        record_handover(possession=possession, handed_over_by=self.admin)

        response = self.client.post(
            "/api/v1/billing/direct-sales/",
            {
                "sale_date": date(2026, 4, 16),
                "customer": self.customer.id,
                "tax_mode": "NON_GST",
                "finance_account": self.cash_account.id,
                "customer_name_snapshot": self.customer.name,
                "customer_phone_snapshot": self.customer.phone,
                "lines": [
                    {
                        "product": self.product.id,
                        "inventory_item": self.inventory_item.id,
                        "description": "Blocked by active possession",
                        "quantity": "1.000",
                        "unit_price": "9500.00",
                        "discount_amount": "0.00",
                        "taxable_value": "9500.00",
                        "gst_rate": None,
                        "cgst_amount": "0.00",
                        "sgst_amount": "0.00",
                        "igst_amount": "0.00",
                        "line_total": "9500.00",
                        "hsn_sac_code": "",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("active rent/lease possession", str(response.data))

    def test_cancelled_invoice_direct_sale_is_removed_from_outstanding_and_not_collectible(self):
        create_response = self.client.post(
            "/api/v1/billing/direct-sales/",
            {
                "sale_date": date(2026, 4, 18),
                "customer": self.customer.id,
                "tax_mode": "NON_GST",
                "finance_account": self.cash_account.id,
                "delivery_required": False,
                "customer_name_snapshot": self.customer.name,
                "customer_phone_snapshot": self.customer.phone,
                "subtotal": "9500.00",
                "discount_total": "0.00",
                "taxable_total": "9500.00",
                "tax_total": "0.00",
                "grand_total": "9500.00",
                "received_total": "2500.00",
                "balance_total": "7000.00",
                "notes": "Cancel invoice collectible posture test",
                "lines": [
                    {
                        "product": self.product.id,
                        "inventory_item": self.inventory_item.id,
                        "description": "Invoice cancel posture line",
                        "quantity": "1.000",
                        "unit_price": "9500.00",
                        "discount_amount": "0.00",
                        "taxable_value": "9500.00",
                        "gst_rate": None,
                        "cgst_amount": "0.00",
                        "sgst_amount": "0.00",
                        "igst_amount": "0.00",
                        "line_total": "9500.00",
                        "hsn_sac_code": "",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        direct_sale_id = create_response.data["id"]
        invoice_id = create_response.data["billing_invoice_id"]

        approve_response = self.client.post(
            f"/api/v1/billing/invoices/{invoice_id}/approve/",
            {},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK, approve_response.data)
        post_response = self.client.post(
            f"/api/v1/billing/invoices/{invoice_id}/post/",
            {},
            format="json",
        )
        self.assertEqual(post_response.status_code, status.HTTP_200_OK, post_response.data)

        receipt_id = ReceiptDocument.objects.filter(billing_invoice_id=invoice_id).order_by("-id").values_list("id", flat=True).first()
        self.assertTrue(receipt_id)
        void_response = self.client.post(
            f"/api/v1/admin/billing/receipts/{receipt_id}/void/",
            {"reason": "Void receipt before invoice cancellation"},
            format="json",
        )
        self.assertEqual(void_response.status_code, status.HTTP_200_OK, void_response.data)

        cancel_invoice = self.client.post(
            f"/api/v1/billing/invoices/{invoice_id}/cancel/",
            {"reason": "Cancel invoice for collectible posture test", "confirm": True},
            format="json",
        )
        self.assertEqual(cancel_invoice.status_code, status.HTTP_200_OK, cancel_invoice.data)

        outstanding_list = self.client.get("/api/v1/billing/direct-sales/?outstanding_only=true")
        self.assertEqual(outstanding_list.status_code, status.HTTP_200_OK, outstanding_list.data)
        ids = [row["id"] for row in outstanding_list.data["results"]]
        self.assertNotIn(direct_sale_id, ids)

        collect_response = self.client.post(
            f"/api/v1/billing/direct-sales/{direct_sale_id}/collect/",
            {
                "amount": "1000.00",
                "finance_account_id": self.cash_account.id,
                "reference_no": "DIRSALE-API-NONCOLLECT-001",
            },
            format="json",
        )
        self.assertEqual(collect_response.status_code, status.HTTP_400_BAD_REQUEST, collect_response.data)
        self.assertIn("retail invoice is posted", str(collect_response.data).lower())

    def test_cancel_direct_sale_marks_keyed_purchase_needs_cancelled(self):
        create_response = self.client.post(
            "/api/v1/billing/direct-sales/",
            {
                "sale_date": date(2026, 4, 19),
                "customer": self.customer.id,
                "tax_mode": "NON_GST",
                "finance_account": self.cash_account.id,
                "delivery_required": False,
                "customer_name_snapshot": self.customer.name,
                "customer_phone_snapshot": self.customer.phone,
                "subtotal": "9500.00",
                "discount_total": "0.00",
                "taxable_total": "9500.00",
                "tax_total": "0.00",
                "grand_total": "9500.00",
                "received_total": "0.00",
                "balance_total": "9500.00",
                "lines": [
                    {
                        "product": self.product.id,
                        "inventory_item": self.inventory_item.id,
                        "description": "Need cancellation line",
                        "quantity": "1.000",
                        "create_purchase_requirement": True,
                        "requirement_quantity": "1.000",
                        "requirement_note": "Create keyed direct-sale stock need",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        sale_id = create_response.data["id"]

        need = PurchaseNeed.objects.get(
            source_module=PurchaseNeed.SourceModule.DIRECT_SALE,
            source_object_id=f"ds:{sale_id}:p:{self.product.id}",
        )
        self.assertEqual(need.status, PurchaseNeedStatus.OPEN)

        cancel_response = self.client.post(
            f"/api/v1/billing/direct-sales/{sale_id}/cancel/",
            {"reason": "Customer dropped order before invoicing", "confirm": True},
            format="json",
        )
        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK, cancel_response.data)

        need.refresh_from_db()
        self.assertEqual(need.status, PurchaseNeedStatus.CANCELLED)
        self.assertIn("linked direct sale was cancelled", (need.note or "").lower())


class BusinessLogicEdgeCaseAndBoundaryTests(APITestCase):
    """
    Layer 1: Truthy, Falsy, and Boundary Matrix Tests
    Validates proper True vs proper False handling, strict rejection of falsy/empty/corrupted
    inputs, numeric bounds, type coercion, and injection safety across billing and sales.
    """

    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="edge_case_admin",
            phone="9388000099",
        )
        self.client.force_authenticate(user=self.admin)
        ensure_test_accounting_posting_prerequisites(date(2026, 4, 1), performed_by=self.admin)
        ensure_document_numbering_profile_for_date(DocumentType.DIRECT_SALE, date(2026, 4, 16), performed_by=self.admin)
        ensure_document_numbering_profile_for_date(DocumentType.TAX_INVOICE, date(2026, 4, 16), performed_by=self.admin)
        self.customer = create_customer_profile(
            name="Edge Case Customer",
            phone="7388000099",
        )
        self.product = create_product(
            name="Edge Case Product",
            product_code="EDGE-CASE-001",
            base_price=Decimal("5000.00"),
        )
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="EDGE-CASE-SKU-001",
            opening_stock_qty=Decimal("10.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("3000.00"),
        )
        cash_chart = ChartOfAccount.objects.create(
            code="EDGE-CASH-001",
            name="Edge Case Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="Edge Case Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )
        ensure_test_collection_purpose_mapping(finance_account=self.cash_account)

    def _valid_base_payload(self):
        return {
            "sale_date": date(2026, 4, 16),
            "customer": self.customer.id,
            "tax_mode": "NON_GST",
            "finance_account": self.cash_account.id,
            "delivery_required": False,
            "customer_name_snapshot": self.customer.name,
            "customer_phone_snapshot": self.customer.phone,
            "subtotal": "5000.00",
            "discount_total": "0.00",
            "taxable_total": "5000.00",
            "tax_total": "0.00",
            "grand_total": "5000.00",
            "received_total": "0.00",
            "balance_total": "5000.00",
            "lines": [
                {
                    "product": self.product.id,
                    "inventory_item": self.inventory_item.id,
                    "description": "Standard edge line",
                    "quantity": "1.000",
                    "unit_price": "5000.00",
                    "discount_amount": "0.00",
                    "taxable_value": "5000.00",
                    "line_total": "5000.00",
                }
            ],
        }

    # 1. Empty / Falsy Inputs
    def test_empty_payload_and_falsy_inputs_return_400_never_500(self):
        for val in [{}, {"lines": []}, {"lines": None}, {"lines": ""}, {"lines": 0}, {"lines": False}]:
            res = self.client.post("/api/v1/billing/direct-sales/", val, format="json")
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, f"Failed for {val}")
            self.assertNotEqual(res.status_code, 500, "Server crashed with 500 on falsy input")

    # 2. Numeric Boundaries
    def test_negative_numbers_and_invalid_quantities_strictly_rejected(self):
        # Negative quantity
        p_neg_qty = self._valid_base_payload()
        p_neg_qty["lines"][0]["quantity"] = "-1.000"
        res = self.client.post("/api/v1/billing/direct-sales/", p_neg_qty, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotEqual(res.status_code, 500)

        # Zero quantity
        p_zero_qty = self._valid_base_payload()
        p_zero_qty["lines"][0]["quantity"] = "0.000"
        res = self.client.post("/api/v1/billing/direct-sales/", p_zero_qty, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotEqual(res.status_code, 500)

        # Negative unit price
        p_neg_price = self._valid_base_payload()
        p_neg_price["lines"][0]["unit_price"] = "-500.00"
        res = self.client.post("/api/v1/billing/direct-sales/", p_neg_price, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotEqual(res.status_code, 500)

    # 3. Floating-Point Precision & Rounding
    def test_floating_point_precision_and_exact_decimal_rounding(self):
        p_float = self._valid_base_payload()
        p_float["subtotal"] = "5000.30"
        p_float["taxable_total"] = "5000.30"
        p_float["grand_total"] = "5000.30"
        p_float["balance_total"] = "5000.30"
        p_float["lines"][0]["unit_price"] = "5000.30"
        p_float["lines"][0]["taxable_value"] = "5000.30"
        p_float["lines"][0]["line_total"] = "5000.30"

        res = self.client.post("/api/v1/billing/direct-sales/", p_float, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        sale_data = res.data
        self.assertEqual(Decimal(str(sale_data["grand_total"])), Decimal("5000.30"))

    # 4. Type Coercion & SQL Injection Resilience
    def test_type_coercion_and_sql_injection_resilience(self):
        # String numbers coerced cleanly
        p_string_nums = self._valid_base_payload()
        p_string_nums["lines"][0]["quantity"] = "2.000"
        p_string_nums["lines"][0]["unit_price"] = "2500.00"
        p_string_nums["lines"][0]["line_total"] = "5000.00"
        res = self.client.post("/api/v1/billing/direct-sales/", p_string_nums, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # SQL Injection attempt in customer_name_snapshot and notes
        p_injection = self._valid_base_payload()
        malicious_input = "'; DROP TABLE billing_directsale; -- ' OR 1=1"
        p_injection["customer_name_snapshot"] = malicious_input
        p_injection["notes"] = "<script>alert('xss')</script> -- union select null"

        res = self.client.post("/api/v1/billing/direct-sales/", p_injection, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        from billing.models import DirectSale
        sale = DirectSale.objects.get(id=res.data["id"])
        self.assertEqual(sale.customer_name_snapshot, malicious_input)
        self.assertTrue(DirectSale.objects.exists())

    # 5. Required vs. Optional Fields
    def test_missing_required_keys_gives_clean_validation_error(self):
        # Missing 'lines'
        payload = self._valid_base_payload()
        del payload["lines"]
        res = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("lines", res.data)

        # Missing required line field 'product'
        payload2 = self._valid_base_payload()
        del payload2["lines"][0]["product"]
        res2 = self.client.post("/api/v1/billing/direct-sales/", payload2, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
