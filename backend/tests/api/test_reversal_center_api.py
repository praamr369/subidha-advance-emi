from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from billing.models import DirectSale
from billing.services.billing_service import approve_billing_invoice, create_direct_sale, post_billing_invoice
from billing.services.reversal_service import create_direct_sale_exchange, create_direct_sale_return, post_direct_sale_return
from inventory.models import InventoryItem, StockLocation, StockMovementType
from tests.helpers import create_admin_user, create_cashier_user, create_customer_profile, create_product


class ReversalCenterApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="rev_api_admin", phone="9386222221")
        self.cashier = create_cashier_user(username="rev_api_cashier", phone="9386222222")
        self.customer = create_customer_profile(name="Rev API Customer", phone="7386222221")
        self.product = create_product(name="Rev API Product", product_code="REV-API-001", base_price=Decimal("1000.00"))
        self.sellable_location = StockLocation.objects.create(code="REV-SELL", name="Rev Sellable")
        self.inspection_location = StockLocation.objects.create(code="REV-INSP", name="Rev Inspection")
        self.inventory_item = InventoryItem.objects.create(product=self.product, sku="REV-API-SKU-001", default_stock_location=self.sellable_location, opening_stock_qty=Decimal("10.000"), reorder_level_qty=Decimal("1.000"), standard_unit_cost=Decimal("700.00"))
        cash_chart = ChartOfAccount.objects.create(code="REV-API-CASH-001", name="Rev API Cash", account_type=ChartOfAccountType.ASSET)
        self.cash_account = FinanceAccount.objects.create(name="Rev API Counter", kind=FinanceAccountKind.CASH, chart_account=cash_chart, opening_balance=Decimal("0.00"))

    def _create_sale(self):
        return create_direct_sale(
            payload={
                "sale_date": date(2026, 4, 15),
                "customer": self.customer,
                "tax_mode": "NON_GST",
                "finance_account": self.cash_account,
                "delivery_required": False,
                "received_total": Decimal("0.00"),
                "customer_name_snapshot": self.customer.name,
                "customer_phone_snapshot": self.customer.phone,
                "lines": [{"product": self.product, "inventory_item": self.inventory_item, "description": "Line", "quantity": Decimal("1.000"), "unit_price": Decimal("1000.00"), "discount_amount": Decimal("0.00"), "taxable_value": Decimal("1000.00"), "gst_rate": None, "cgst_amount": Decimal("0.00"), "sgst_amount": Decimal("0.00"), "igst_amount": Decimal("0.00"), "line_total": Decimal("1000.00"), "hsn_sac_code": ""}],
            },
            created_by=self.admin,
        )

    def test_reversal_endpoints_are_admin_only(self):
        sale = self._create_sale()

        self.client.force_authenticate(user=self.cashier)
        response = self.client.post(
            f"/api/v1/admin/billing/direct-sales/{sale.id}/cancel/",
            {"reason": "No"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin)
        ok = self.client.post(
            f"/api/v1/admin/billing/direct-sales/{sale.id}/cancel/",
            {"reason": "Customer changed mind"},
            format="json",
        )
        self.assertEqual(ok.status_code, status.HTTP_200_OK, ok.data)

    def test_cancel_reason_required(self):
        sale = self._create_sale()
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f"/api/v1/admin/billing/direct-sales/{sale.id}/cancel/", {"reason": ""}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancel_invalid_direct_sale_id_returns_field_error(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/v1/admin/billing/direct-sales/0/cancel/", {"reason": "x"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("direct_sale_id", response.data)

    def test_delivered_direct_sale_eligibility_allows_return_and_exchange_without_pre_invoice_cancel(self):
        sale = self._create_sale()
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        DirectSale.objects.filter(pk=sale.id).update(delivered_at=invoice.created_at)

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f"/api/v1/admin/billing/direct-sales/{sale.id}/return-eligibility/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["sale_status"], "INVOICED")
        self.assertEqual(response.data["invoice_status"], "POSTED")
        self.assertEqual(response.data["delivery_status"], "DELIVERED")
        self.assertIn("RETURN_PRODUCT", response.data["allowed_actions"])
        self.assertIn("EXCHANGE_PRODUCT", response.data["allowed_actions"])
        self.assertNotIn("PRE_INVOICE_CANCEL", response.data["allowed_actions"])
        self.assertIn("customer_name", response.data)
        self.assertIn("return_lines", response.data)
        self.assertIn("stock_destinations", response.data)
        self.assertEqual(
            response.data["return_lines"][0]["default_return_quantity"],
            response.data["return_lines"][0]["returnable_quantity"],
        )

    def test_return_eligibility_stock_setup_guidance_when_missing_locations(self):
        sale = self._create_sale()
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        StockLocation.objects.filter(id=self.inspection_location.id).delete()
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f"/api/v1/admin/billing/direct-sales/{sale.id}/return-eligibility/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["stock_setup_required"])
        self.assertIn("INSPECTION", response.data["missing_location_types"])

    def test_setup_return_locations_endpoint_creates_missing_locations(self):
        StockLocation.objects.filter(code__in=["RET-INSP", "RET-DMG", "RET-SVC"]).delete()
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/v1/admin/inventory/locations/setup-return-locations/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertGreaterEqual(response.data["created_count"], 1)

    def test_inventory_ledger_filters_show_return_and_exchange_movements(self):
        replacement_product = create_product(name="Rev API Replacement", product_code="REV-API-002", base_price=Decimal("1200.00"))
        replacement_item = InventoryItem.objects.create(product=replacement_product, sku="REV-API-SKU-002", default_stock_location=self.sellable_location, opening_stock_qty=Decimal("5.000"), reorder_level_qty=Decimal("1.000"), standard_unit_cost=Decimal("900.00"))
        return_sale = self._create_sale()
        return_invoice = return_sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=return_invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=return_invoice.id, posted_by=self.admin)

        ret = create_direct_sale_return(
            direct_sale_id=return_sale.id,
            reason="Filter return",
            stock_destination="INSPECTION",
            stock_location_id=self.inspection_location.id,
            lines=[{"direct_sale_line_id": return_sale.lines.first().id, "quantity": "1.000"}],
            performed_by=self.admin,
        )
        ret.status = "APPROVED"
        ret.save(update_fields=["status", "updated_at"])
        post_direct_sale_return(return_id=ret.id, posted_by=self.admin)

        exchange_sale = self._create_sale()
        exchange_invoice = exchange_sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=exchange_invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=exchange_invoice.id, posted_by=self.admin)

        exchange = create_direct_sale_exchange(
            direct_sale_id=exchange_sale.id,
            returned_lines=[{"direct_sale_line_id": exchange_sale.lines.first().id, "quantity": "1.000"}],
            replacement_lines=[{"inventory_item_id": replacement_item.id, "quantity": "1.000", "unit_price": "1200.00"}],
            reason="Filter exchange",
            stock_destination="INSPECTION",
            stock_location_id=self.inspection_location.id,
            performed_by=self.admin,
        )
        exchange.status = "APPROVED"
        exchange.save(update_fields=["status", "updated_at"])
        post_direct_sale_return(return_id=exchange.id, posted_by=self.admin)

        self.client.force_authenticate(user=self.admin)
        return_response = self.client.get(f"/api/v1/inventory/stock-ledger/?direct_sale_return={ret.id}")
        exchange_response = self.client.get(f"/api/v1/inventory/stock-ledger/?exchange={exchange.id}")

        self.assertEqual(return_response.status_code, status.HTTP_200_OK, return_response.data)
        self.assertTrue(
            any(row["movement_type"] == StockMovementType.SALE_RETURN_IN for row in return_response.data["results"])
        )
        self.assertEqual(exchange_response.status_code, status.HTTP_200_OK, exchange_response.data)
        exchange_types = {row["movement_type"] for row in exchange_response.data["results"]}
        self.assertIn(StockMovementType.SALE_RETURN_IN, exchange_types)
        self.assertIn(StockMovementType.SALE_OUT, exchange_types)

    def test_inventory_item_search_returns_product_and_stock_by_location(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/inventory/items/search/?q=REV-API-SKU-001")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertGreaterEqual(response.data["count"], 1)
        first = response.data["results"][0]
        self.assertIn("product_name", first)
        self.assertIn("sku", first)
        self.assertIn("available_by_location", first)

    def test_create_delivered_return_works_after_void_invoice(self):
        sale = create_direct_sale(
            payload={
                "sale_date": date(2026, 4, 15),
                "customer": self.customer,
                "tax_mode": "NON_GST",
                "finance_account": self.cash_account,
                "delivery_required": False,
                "received_total": Decimal("1000.00"),
                "customer_name_snapshot": self.customer.name,
                "customer_phone_snapshot": self.customer.phone,
                "lines": [{"product": self.product, "inventory_item": self.inventory_item, "description": "Line", "quantity": Decimal("1.000"), "unit_price": Decimal("1000.00"), "discount_amount": Decimal("0.00"), "taxable_value": Decimal("1000.00"), "gst_rate": None, "cgst_amount": Decimal("0.00"), "sgst_amount": Decimal("0.00"), "igst_amount": Decimal("0.00"), "line_total": Decimal("1000.00"), "hsn_sac_code": ""}],
            },
            created_by=self.admin,
        )
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        DirectSale.objects.filter(pk=sale.id).update(delivered_at=invoice.created_at)
        self.client.force_authenticate(user=self.admin)
        receipt = invoice.receipts.first()
        void_response = self.client.post(
            f"/api/v1/admin/billing/receipts/{receipt.id}/void/",
            {"reason": "Void before delivered return"},
            format="json",
        )
        self.assertEqual(void_response.status_code, status.HTTP_200_OK, void_response.data)
        cancel_invoice = self.client.post(
            f"/api/v1/billing/invoices/{invoice.id}/cancel/",
            {"reason": "Cancel invoice", "confirm": True},
            format="json",
        )
        self.assertEqual(cancel_invoice.status_code, status.HTTP_200_OK, cancel_invoice.data)
        eligibility = self.client.get(f"/api/v1/admin/billing/direct-sales/{sale.id}/return-eligibility/")
        self.assertEqual(eligibility.status_code, status.HTTP_200_OK, eligibility.data)
        self.assertEqual(eligibility.data["return_lines"][0]["returnable_quantity"], "1.000")
        create_response = self.client.post(
            f"/api/v1/admin/billing/direct-sales/{sale.id}/returns/",
            {
                "reason": "Delivered return",
                "return_kind": "DELIVERED_RETURN",
                "stock_destination": "INSPECTION",
                "stock_location_id": self.inspection_location.id,
                "lines": [{"sale_line_id": sale.lines.first().id, "quantity": "1.000"}],
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)

    def test_delivered_returned_sale_rejects_cancel_and_prefers_finalize(self):
        sale = self._create_sale()
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        DirectSale.objects.filter(pk=sale.id).update(delivered_at=invoice.created_at)

        self.client.force_authenticate(user=self.admin)
        # Cancel invoice (and void any posted receipts if present) to allow return workflow
        receipt = invoice.receipts.first()
        if receipt is not None:
            self.client.post(
                f"/api/v1/admin/billing/receipts/{receipt.id}/void/",
                {"reason": "Void"},
                format="json",
            )
        self.client.post(f"/api/v1/billing/invoices/{invoice.id}/cancel/", {"reason": "Cancel invoice", "confirm": True}, format="json")

        ret = create_direct_sale_return(
            direct_sale_id=sale.id,
            reason="Full return",
            stock_destination="INSPECTION",
            stock_location_id=self.inspection_location.id,
            lines=[{"direct_sale_line_id": sale.lines.first().id, "quantity": "1.000"}],
            performed_by=self.admin,
        )
        ret.status = "APPROVED"
        ret.save(update_fields=["status", "updated_at"])
        post_direct_sale_return(return_id=ret.id, posted_by=self.admin)

        cancel = self.client.post(f"/api/v1/admin/billing/direct-sales/{sale.id}/cancel/", {"reason": "Try cancel"}, format="json")
        self.assertEqual(cancel.status_code, status.HTTP_400_BAD_REQUEST, cancel.data)
        self.assertIn("finalize", str(cancel.data).lower())

    def test_finalize_reversal_archives_sale_and_blocks_collection(self):
        sale = self._create_sale()
        invoice = sale.billing_invoices.first()
        approve_billing_invoice(invoice_id=invoice.id, approved_by=self.admin)
        post_billing_invoice(invoice_id=invoice.id, posted_by=self.admin)
        DirectSale.objects.filter(pk=sale.id).update(delivered_at=invoice.created_at)

        self.client.force_authenticate(user=self.admin)
        receipt = invoice.receipts.first()
        if receipt is not None:
            void_response = self.client.post(
                f"/api/v1/admin/billing/receipts/{receipt.id}/void/",
                {"reason": "Void receipt for full reversal finalize"},
                format="json",
            )
            self.assertEqual(void_response.status_code, status.HTTP_200_OK, void_response.data)

        cancel_invoice = self.client.post(
            f"/api/v1/billing/invoices/{invoice.id}/cancel/",
            {"reason": "Void invoice for full reversal finalize", "confirm": True},
            format="json",
        )
        self.assertEqual(cancel_invoice.status_code, status.HTTP_200_OK, cancel_invoice.data)

        ret = create_direct_sale_return(
            direct_sale_id=sale.id,
            reason="Full delivered return",
            stock_destination="INSPECTION",
            stock_location_id=self.inspection_location.id,
            lines=[{"direct_sale_line_id": sale.lines.first().id, "quantity": "1.000"}],
            performed_by=self.admin,
        )
        ret.status = "APPROVED"
        ret.save(update_fields=["status", "updated_at"])
        post_direct_sale_return(return_id=ret.id, posted_by=self.admin)

        finalize = self.client.post(
            f"/api/v1/admin/billing/direct-sales/{sale.id}/finalize-reversal/",
            {"reason": "Finalize delivered return archive", "confirm": True},
            format="json",
        )
        self.assertEqual(finalize.status_code, status.HTTP_200_OK, finalize.data)

        sale.refresh_from_db()
        self.assertIn(sale.status, {"RETURNED", "CANCELLED_AFTER_DELIVERY", "REVERSED_POST_INVOICE"})

        self.client.force_authenticate(user=self.cashier)
        collect = self.client.post(
            "/api/v1/cashier/collect-direct-sale/",
            {"direct_sale_id": sale.id, "amount": "100.00", "finance_account_id": self.cash_account.id},
            format="json",
        )
        self.assertEqual(collect.status_code, status.HTTP_400_BAD_REQUEST, collect.data)
        self.assertIn("not collectible", str(collect.data).lower())
