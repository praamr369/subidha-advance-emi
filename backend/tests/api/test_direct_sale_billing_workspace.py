from datetime import date
from decimal import Decimal

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import DocumentSequence
from accounting.services.gst_document_posting_service import financial_year_for
from billing.models import BillingInvoice, DirectSale, DirectSaleLine, ReceiptDocument
from inventory.models import InventoryItem, PurchaseNeed, PurchaseNeedStatus, StockLocation, Warehouse
from inventory.services.purchase_need_service import direct_sale_purchase_need_source_key
from service_desk.models import ServiceDeskCase, ServiceDeskCaseStatus, ServiceDeskCaseType
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
)


class DirectSaleBillingWorkspaceTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="direct_sale_workspace_admin", phone="9377000011")
        self.client.force_authenticate(self.admin)
        self.customer = create_customer_profile(
            name="Direct Sale Workspace Customer",
            phone="7377000011",
        )
        self.product = create_product(
            name="Workspace Sofa Deluxe",
            product_code="WS-SOFA-001",
            base_price=Decimal("12000.00"),
        )
        self.location = StockLocation.objects.create(
            code="WS-STORE",
            name="Workspace Store",
            location_type="STORE",
        )
        self.warehouse = Warehouse.objects.create(
            code="WS-WH",
            name="Workspace Warehouse",
            stock_location=self.location,
        )
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="WS-SOFA-SKU-001",
            default_stock_location=self.location,
            opening_stock_qty=Decimal("0.000"),
            reorder_level_qty=Decimal("1.000"),
        )
        fy = financial_year_for(date.today())
        DocumentSequence.objects.create(
            series_code="DIRECT_SALE_INVOICE",
            financial_year=fy,
            prefix=f"DSI-{fy}",
            next_number=1,
            padding=5,
            is_active=True,
        )

    def _payload(self, **line_overrides):
        line = {
            "product": self.product.id,
            "inventory_item": self.inventory_item.id,
            "description": "Workspace sofa direct sale",
            "quantity": "2.000",
            "discount_amount": "1000.00",
            "gst_rate": None,
            "cgst_amount": "0.00",
            "sgst_amount": "0.00",
            "igst_amount": "0.00",
            "create_purchase_requirement": True,
            "requirement_quantity": "2.000",
            "requirement_note": "Order for walk-in retail bill",
        }
        line.update(line_overrides)
        return {
            "sale_date": date(2026, 5, 1),
            "customer": self.customer.id,
            "tax_mode": "NON_GST",
            "customer_name_snapshot": self.customer.name,
            "customer_phone_snapshot": self.customer.phone,
            "received_total": "0.00",
            "lines": [line],
        }

    def test_billing_product_search_finds_by_name_code_and_sku(self):
        for query in ["Workspace Sofa", "WS-SOFA-001", "WS-SOFA-SKU-001"]:
            response = self.client.get(
                "/api/v1/admin/billing/product-search/",
                {"q": query, "include_inventory": "true", "page_size": 10},
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
            ids = {row["id"] for row in response.data["results"]}
            self.assertIn(self.product.id, ids)

    def test_billing_product_search_includes_inventory_fields(self):
        response = self.client.get(
            "/api/v1/admin/billing/product-search/",
            {"q": "WS-SOFA", "include_inventory": "true", "direct_sale_enabled": "true"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = next(item for item in response.data["results"] if item["id"] == self.product.id)
        self.assertEqual(row["inventory_item_id"], self.inventory_item.id)
        self.assertEqual(row["sku"], "WS-SOFA-SKU-001")
        self.assertEqual(row["current_stock_qty"], "0.000")
        self.assertTrue(row["stock_tracking_enabled"])
        self.assertTrue(row["delivery_stock_bridge_enabled"])
        self.assertTrue(row["inventory_ready"])

    def test_direct_sale_defaults_unit_price_and_discount_does_not_change_base_price(self):
        before_price = self.product.base_price
        response = self.client.post(
            "/api/v1/billing/direct-sales/",
            self._payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        sale = DirectSale.objects.get(pk=response.data["id"])
        line = DirectSaleLine.objects.get(direct_sale=sale)
        self.product.refresh_from_db()

        self.assertEqual(line.unit_price, before_price)
        self.assertEqual(sale.subtotal, Decimal("24000.00"))
        self.assertEqual(sale.discount_total, Decimal("1000.00"))
        self.assertEqual(sale.grand_total, Decimal("23000.00"))
        self.assertEqual(self.product.base_price, before_price)

    def test_discount_cannot_exceed_line_gross(self):
        response = self.client.post(
            "/api/v1/billing/direct-sales/",
            self._payload(discount_amount="24001.00"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("discount_amount", str(response.data))

    def test_duplicate_submit_with_same_idempotency_key_is_safe(self):
        payload = self._payload()
        first = self.client.post(
            "/api/v1/billing/direct-sales/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="direct-sale-workspace-idem-1",
        )
        second = self.client.post(
            "/api/v1/billing/direct-sales/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="direct-sale-workspace-idem-1",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(DirectSale.objects.count(), 1)
        self.assertEqual(BillingInvoice.objects.count(), 1)
        self.assertEqual(ReceiptDocument.objects.count(), 0)
        self.assertEqual(PurchaseNeed.objects.count(), 1)

    def test_requirement_creation_during_direct_sale_creates_purchase_need_only(self):
        response = self.client.post(
            "/api/v1/billing/direct-sales/",
            self._payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        need = PurchaseNeed.objects.get()
        self.assertEqual(need.source_module, PurchaseNeed.SourceModule.DIRECT_SALE)
        self.assertEqual(
            need.source_object_id,
            direct_sale_purchase_need_source_key(sale_id=response.data["id"], product_id=self.product.id),
        )
        self.assertEqual(need.product_id, self.product.id)
        self.assertEqual(need.required_quantity, Decimal("2.000"))
        self.assertEqual(need.shortage_quantity, Decimal("2.000"))
        self.assertEqual(need.note, "Order for walk-in retail bill")

    def test_existing_subscription_financial_snapshot_is_unchanged(self):
        batch = create_batch(batch_code="WS-BATCH-001")
        lucky_id = create_lucky_id(batch=batch, lucky_number=37)
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
            partner=self.admin,
            total_amount=Decimal("12000.00"),
            monthly_amount=Decimal("800.00"),
            tenure_months=15,
        )

        response = self.client.post(
            "/api/v1/billing/direct-sales/",
            self._payload(discount_amount="2000.00"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        subscription.refresh_from_db()
        self.assertEqual(subscription.total_amount, Decimal("12000.00"))
        self.assertEqual(subscription.monthly_amount, Decimal("800.00"))
        self.assertEqual(subscription.product_id, self.product.id)

    def test_walkin_snapshot_can_create_without_customer_link(self):
        payload = self._payload()
        payload["customer"] = None
        payload["customer_mode"] = "WALK_IN"
        payload["customer_name_snapshot"] = "Walk In Snapshot User"
        payload["customer_phone_snapshot"] = "9000000001"
        payload["customer_snapshot_billing_address_line1"] = "Market Road"
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        sale = DirectSale.objects.get(pk=response.data["id"])
        self.assertIsNone(sale.customer_id)
        self.assertEqual(sale.customer_name_snapshot, "Walk In Snapshot User")
        self.assertEqual(sale.customer_snapshot_billing_address_line1, "Market Road")

    def test_walkin_snapshot_requires_name_and_phone(self):
        payload = self._payload()
        payload["customer"] = None
        payload["customer_mode"] = "WALK_IN"
        payload["customer_name_snapshot"] = ""
        payload["customer_phone_snapshot"] = ""
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("customer_name_snapshot", response.data)
        self.assertIn("customer_phone_snapshot", response.data)

    def test_new_customer_mode_creates_profile_and_links_sale(self):
        payload = self._payload()
        payload["customer"] = None
        payload["customer_mode"] = "NEW"
        payload["new_customer_name"] = "Billing New Customer"
        payload["new_customer_phone"] = "9000000011"
        payload["new_customer_email"] = "billing.new@example.com"
        payload["new_customer_billing_address_line1"] = "New Street 10"
        payload["new_customer_city"] = "Asansol"
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        sale = DirectSale.objects.select_related("customer", "customer__user").get(pk=response.data["id"])
        self.assertIsNotNone(sale.customer_id)
        self.assertEqual(sale.customer.name, "Billing New Customer")
        self.assertFalse(sale.customer.user.has_usable_password())

    def test_existing_customer_mode_requires_selected_customer_id(self):
        payload = self._payload()
        payload["customer_mode"] = "EXISTING"
        payload["customer"] = None
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("customer", response.data)

    def test_existing_customer_mode_create_succeeds_with_selected_customer_id(self):
        payload = self._payload()
        payload["customer_mode"] = "EXISTING"
        payload["customer"] = self.customer.id
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        sale = DirectSale.objects.get(pk=response.data["id"])
        self.assertEqual(sale.customer_id, self.customer.id)

    def test_new_customer_mode_requires_name_and_phone(self):
        payload = self._payload()
        payload["customer"] = None
        payload["customer_mode"] = "NEW"
        payload["new_customer_name"] = ""
        payload["new_customer_phone"] = ""
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("new_customer_name", response.data)
        self.assertIn("new_customer_phone", response.data)

    def test_gst_registered_business_requires_gstin(self):
        payload = self._payload()
        payload["tax_mode"] = "GST"
        payload["customer_gst_type"] = "REGISTERED_BUSINESS"
        payload["customer_gstin"] = ""
        payload["customer_snapshot_place_of_supply"] = "WB"
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("customer_gstin", response.data)

    def test_non_gst_allows_without_gstin(self):
        payload = self._payload()
        payload["tax_mode"] = "NON_GST"
        payload["customer_gst_type"] = "UNREGISTERED_CONSUMER"
        payload["customer_gstin"] = ""
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_admin_customer_search_finds_by_name_phone_and_mixed_tokens(self):
        self.customer.name = "Debjit Roy"
        self.customer.phone = "7797280952"
        self.customer.save(update_fields=["name", "phone"])

        by_name = self.client.get("/api/v1/admin/customers/search/", {"q": "Debjit Roy"})
        self.assertEqual(by_name.status_code, status.HTTP_200_OK, by_name.data)
        self.assertIn(self.customer.id, {row["id"] for row in by_name.data["results"]})

        by_phone = self.client.get("/api/v1/admin/customers/search/", {"q": "7797280952"})
        self.assertEqual(by_phone.status_code, status.HTTP_200_OK, by_phone.data)
        self.assertIn(self.customer.id, {row["id"] for row in by_phone.data["results"]})

        by_mixed = self.client.get("/api/v1/admin/customers/search/", {"q": "Debjit Roy 7797280952"})
        self.assertEqual(by_mixed.status_code, status.HTTP_200_OK, by_mixed.data)
        self.assertIn(self.customer.id, {row["id"] for row in by_mixed.data["results"]})

    def test_admin_customer_search_normalizes_spaces_and_case(self):
        self.customer.name = "Debjit Roy"
        self.customer.phone = "7797280952"
        self.customer.save(update_fields=["name", "phone"])
        response = self.client.get("/api/v1/admin/customers/search/", {"q": "   debJIT    roy   7797280952   "})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn(self.customer.id, {row["id"] for row in response.data["results"]})

    def test_admin_customer_search_finds_by_gstin_when_available(self):
        payload = self._payload()
        payload["tax_mode"] = "GST"
        payload["customer_gst_type"] = "REGISTERED_BUSINESS"
        payload["customer_gstin"] = "19ABCDE1234F1Z5"
        payload["customer_snapshot_place_of_supply"] = "WB"
        created = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)

        response = self.client.get("/api/v1/admin/customers/search/", {"q": "19ABCDE1234F1Z5"})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn(self.customer.id, {row["id"] for row in response.data["results"]})

    def test_malformed_direct_sale_payload_returns_400_not_500(self):
        payload = self._payload()
        payload["lines"][0]["quantity"] = "invalid"
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

    def test_received_total_exceeding_grand_total_returns_400_not_500(self):
        payload = self._payload()
        payload["received_total"] = "999999.00"
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

    @override_settings(CORS_ALLOWED_ORIGINS=["https://erp.example.com"])
    def test_direct_sale_cors_preflight_allows_idempotency_headers(self):
        response = self.client.options(
            "/api/v1/billing/direct-sales/",
            HTTP_ORIGIN="https://erp.example.com",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization,content-type,idempotency-key",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        allow_headers = (response.get("Access-Control-Allow-Headers") or "").lower()
        self.assertIn("idempotency-key", allow_headers)

    def test_delivery_required_false_skips_service_desk_tracking_case(self):
        payload = self._payload()
        payload["delivery_required"] = False
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertFalse(ServiceDeskCase.objects.filter(direct_sale_id=response.data["id"]).exists())
        self.assertEqual(response.data.get("delivery_status"), "NONE")

    def test_delivery_required_unpaid_creates_invoice_pending_case_and_labels(self):
        payload = self._payload()
        payload["delivery_required"] = True
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        case = ServiceDeskCase.objects.get(direct_sale_id=response.data["id"])
        self.assertEqual(case.case_type, ServiceDeskCaseType.DIRECT_SALE_DELIVERY)
        self.assertEqual(case.status, ServiceDeskCaseStatus.OPEN)
        self.assertEqual(response.data.get("delivery_status"), "DRAFT_HOLD")
        self.assertEqual(response.data.get("delivery_request_id"), case.id)

    def test_explicit_requirement_when_stock_covers_sale_still_creates_need(self):
        self.inventory_item.opening_stock_qty = Decimal("50.000")
        self.inventory_item.save(update_fields=["opening_stock_qty"])
        response = self.client.post("/api/v1/billing/direct-sales/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        need = PurchaseNeed.objects.get(
            source_object_id=direct_sale_purchase_need_source_key(
                sale_id=response.data["id"],
                product_id=self.product.id,
            )
        )
        self.assertEqual(need.shortage_quantity, Decimal("0.000"))

    def test_direct_sale_bootstraps_primary_warehouse_when_none_exist(self):
        Warehouse.objects.all().delete()
        self.assertFalse(Warehouse.objects.exists())
        response = self.client.post("/api/v1/billing/direct-sales/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(Warehouse.objects.filter(code="PRIMARY").exists())
        self.assertEqual(PurchaseNeed.objects.count(), 1)

    def test_full_prepayment_delivery_ready_after_finalize_invoice(self):
        payload = self._payload()
        payload["delivery_required"] = True
        payload["received_total"] = "23000.00"
        payload["balance_total"] = "0.00"
        payload["subtotal"] = "24000.00"
        payload["discount_total"] = "1000.00"
        payload["taxable_total"] = "23000.00"
        payload["tax_total"] = "0.00"
        payload["grand_total"] = "23000.00"
        self.inventory_item.opening_stock_qty = Decimal("50.000")
        self.inventory_item.save(update_fields=["opening_stock_qty"])
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        sale_id = response.data["id"]
        case = ServiceDeskCase.objects.get(direct_sale_id=sale_id)
        self.assertEqual(case.status, ServiceDeskCaseStatus.OPEN)
        self.assertEqual(response.data.get("delivery_status"), "DRAFT_HOLD")

        finalize = self.client.post(
            f"/api/v1/admin/billing/direct-sales/{sale_id}/finalize-invoice/",
            {},
            format="json",
        )
        self.assertEqual(finalize.status_code, status.HTTP_200_OK, finalize.data)
        case.refresh_from_db()
        self.assertEqual(case.status, ServiceDeskCaseStatus.AUTHORIZED)
        self.assertEqual(finalize.data["direct_sale"].get("delivery_status"), "READY_FOR_DELIVERY")

    def test_admin_delivery_register_includes_direct_sale_case_rows(self):
        payload = self._payload()
        payload["delivery_required"] = True
        create_resp = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.data)
        sale_id = create_resp.data["id"]

        delivery_resp = self.client.get("/api/v1/admin/deliveries/")
        self.assertEqual(delivery_resp.status_code, status.HTTP_200_OK, delivery_resp.data)
        ds_rows = [row for row in delivery_resp.data["results"] if row.get("source_type") == "DIRECT_SALE"]
        self.assertTrue(any(row.get("direct_sale_id") == sale_id for row in ds_rows))
        self.assertGreaterEqual(delivery_resp.data.get("direct_sale_delivery_count", 0), 1)
        row = next(row for row in ds_rows if row.get("direct_sale_id") == sale_id)
        self.assertIn("action_endpoints", row)
        self.assertIn("/direct-sale-cases/", (row.get("action_endpoints") or {}).get("schedule", ""))

    def test_admin_can_schedule_dispatch_and_deliver_direct_sale_case(self):
        payload = self._payload()
        payload["delivery_required"] = True
        payload["received_total"] = "23000.00"
        payload["balance_total"] = "0.00"
        payload["subtotal"] = "24000.00"
        payload["discount_total"] = "1000.00"
        payload["taxable_total"] = "23000.00"
        payload["tax_total"] = "0.00"
        payload["grand_total"] = "23000.00"
        self.inventory_item.opening_stock_qty = Decimal("50.000")
        self.inventory_item.save(update_fields=["opening_stock_qty"])
        created = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        sale_id = created.data["id"]
        finalize = self.client.post(f"/api/v1/admin/billing/direct-sales/{sale_id}/finalize-invoice/", {}, format="json")
        self.assertEqual(finalize.status_code, status.HTTP_200_OK, finalize.data)
        case = ServiceDeskCase.objects.get(direct_sale_id=sale_id)

        schedule = self.client.post(
            f"/api/v1/admin/deliveries/direct-sale-cases/{case.id}/schedule/",
            {"receiver_name": "Receiver A"},
            format="json",
        )
        self.assertEqual(schedule.status_code, status.HTTP_200_OK, schedule.data)
        dispatch = self.client.post(
            f"/api/v1/admin/deliveries/direct-sale-cases/{case.id}/dispatch/",
            {"notes": "Dispatched"},
            format="json",
        )
        self.assertEqual(dispatch.status_code, status.HTTP_200_OK, dispatch.data)
        delivered = self.client.post(
            f"/api/v1/admin/deliveries/direct-sale-cases/{case.id}/mark-delivered/",
            {"receiver_name": "Receiver A", "delivery_note": "Handed over"},
            format="json",
        )
        self.assertEqual(delivered.status_code, status.HTTP_200_OK, delivered.data)
        case.refresh_from_db()
        self.assertEqual(case.status, ServiceDeskCaseStatus.RESOLVED)
        case.direct_sale.refresh_from_db()
        self.assertIsNotNone(case.direct_sale.delivered_at)

    def test_draft_sale_exposes_operational_state_and_finalize_action(self):
        response = self.client.post("/api/v1/billing/direct-sales/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data.get("operational_state"), "DRAFT_NEEDS_INVOICE")
        self.assertIn("FINALIZE_INVOICE", response.data.get("next_actions") or [])
        self.assertNotIn("COLLECT_DIRECT_SALE_BALANCE", response.data.get("next_actions") or [])

    def test_finalize_invoice_endpoint_is_idempotent(self):
        create_resp = self.client.post("/api/v1/billing/direct-sales/", self._payload(), format="json")
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.data)
        sale_id = create_resp.data["id"]

        finalize_first = self.client.post(
            f"/api/v1/admin/billing/direct-sales/{sale_id}/finalize-invoice/",
            {},
            format="json",
        )
        self.assertEqual(finalize_first.status_code, status.HTTP_200_OK, finalize_first.data)
        self.assertTrue(finalize_first.data.get("updated"))
        self.assertEqual(finalize_first.data["direct_sale"]["status"], "INVOICED")
        self.assertIn(
            finalize_first.data["direct_sale"].get("operational_state"),
            {"RECEIVABLE_READY", "PARTIAL_PAYMENT_HOLD", "PAID_STOCK_BLOCKED", "PAID_READY_FOR_DELIVERY"},
        )

        finalize_second = self.client.post(
            f"/api/v1/admin/billing/direct-sales/{sale_id}/finalize-invoice/",
            {},
            format="json",
        )
        self.assertEqual(finalize_second.status_code, status.HTTP_200_OK, finalize_second.data)
        self.assertFalse(finalize_second.data.get("updated"))
        self.assertEqual(finalize_second.data["direct_sale"]["status"], "INVOICED")

    def test_collect_endpoint_rejects_draft_sale(self):
        create_resp = self.client.post("/api/v1/billing/direct-sales/", self._payload(), format="json")
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.data)
        sale_id = create_resp.data["id"]
        collect_resp = self.client.post(
            f"/api/v1/billing/direct-sales/{sale_id}/collect/",
            {
                "amount": "100.00",
            },
            format="json",
        )
        self.assertEqual(collect_resp.status_code, status.HTTP_400_BAD_REQUEST, collect_resp.data)
        self.assertIn("invoiced", str(collect_resp.data).lower())

    def test_finalize_invoice_not_blocked_by_open_purchase_need(self):
        create_resp = self.client.post("/api/v1/billing/direct-sales/", self._payload(), format="json")
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.data)
        sale_id = create_resp.data["id"]
        self.assertTrue(PurchaseNeed.objects.filter(source_module=PurchaseNeed.SourceModule.DIRECT_SALE).exists())
        finalize = self.client.post(
            f"/api/v1/admin/billing/direct-sales/{sale_id}/finalize-invoice/",
            {},
            format="json",
        )
        self.assertEqual(finalize.status_code, status.HTTP_200_OK, finalize.data)
        self.assertEqual(finalize.data["direct_sale"]["status"], "INVOICED")

    def test_admin_stock_need_recheck_resolves_when_atp_covers(self):
        create_resp = self.client.post("/api/v1/billing/direct-sales/", self._payload(), format="json")
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.data)
        need = PurchaseNeed.objects.get()
        self.assertEqual(need.status, PurchaseNeedStatus.OPEN)
        self.inventory_item.opening_stock_qty = Decimal("50.000")
        self.inventory_item.save(update_fields=["opening_stock_qty"])
        recheck = self.client.post(f"/api/v1/admin/inventory/stock-needs/{need.id}/recheck/", {}, format="json")
        self.assertEqual(recheck.status_code, status.HTTP_200_OK, recheck.data)
        self.assertEqual(recheck.data.get("recheck", {}).get("outcome"), "RESOLVED_BY_AVAILABLE_STOCK")
        need.refresh_from_db()
        self.assertEqual(need.status, PurchaseNeedStatus.FULFILLED)

        again = self.client.post(f"/api/v1/admin/inventory/stock-needs/{need.id}/recheck/", {}, format="json")
        self.assertEqual(again.status_code, status.HTTP_200_OK, again.data)
        self.assertEqual(again.data.get("recheck", {}).get("outcome"), "NO_CHANGE")
