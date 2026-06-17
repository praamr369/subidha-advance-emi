"""
Invoice-anchored delivery rail tests (additive billing→delivery→inventory sync).

Covers the new ``billing.services.invoice_delivery_service`` facade and the
``/billing/invoices/{id}/`` delivery endpoints. Verifies that the rail reuses the
existing direct-sale and subscription delivery engines, surfaces controlled
blockers (400, never 500), and never duplicates stock-ledger movements.
"""

from datetime import date
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import DocumentSequence, FinancialYear
from billing.models import (
    BillingDocumentStatus,
    BillingInvoice,
    BillingInvoiceLine,
    BillingSourceType,
    DirectSale,
    DirectSaleLine,
    DirectSaleStatus,
)
from billing.services.invoice_delivery_service import (
    InvoiceDeliveryBlocked,
    STATUS_BLOCKED,
    STATUS_CANCELLED,
    STATUS_DELIVERED,
    STATUS_NOT_REQUIRED,
    STATUS_PENDING_DELIVERY,
    confirm_delivery_for_invoice,
    create_delivery_from_invoice,
    get_invoice_delivery_readiness,
)
from inventory.models import InventoryItem, StockLedger, StockLocation, StockMovementType
from service_desk.models import ServiceDeskCase, ServiceDeskCaseType
from subscriptions.models import DeliveryStatus
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_delivery,
    create_lucky_id,
    create_product,
    create_subscription,
)


def _build_sequences():
    fy = FinancialYear.objects.create(
        code="FY2026-27",
        name="FY 2026-27",
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
        is_active=True,
    )
    sale_series = DocumentSequence.objects.create(
        series_code="DS_INV",
        document_type="DIRECT_SALE",
        financial_year="2026-27",
        financial_year_ref=fy,
        prefix="DS-2026-27",
        next_number=1,
    )
    invoice_series = DocumentSequence.objects.create(
        series_code="BILL_INV",
        document_type="TAX_INVOICE",
        financial_year="2026-27",
        financial_year_ref=fy,
        prefix="INV-2026-27",
        next_number=1,
    )
    return fy, sale_series, invoice_series


class InvoiceDeliveryServiceTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="inv_delivery_admin", phone="9361000001")
        self.customer = create_customer_profile(name="Invoice Delivery Customer", phone="7361000001")
        self.product = create_product(
            name="Invoice Delivery Sofa",
            product_code="INV-DLV-001",
            base_price=Decimal("12000.00"),
        )
        self.location = StockLocation.objects.create(code="IDLV-STORE", name="Invoice Delivery Store")
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="INV-DLV-SKU-001",
            unit_of_measure="PCS",
            default_stock_location=self.location,
            opening_stock_qty=Decimal("5.000"),
        )
        self.fy, self.sale_series, self.invoice_series = _build_sequences()

    # ---- direct sale fixtures ------------------------------------------------
    def _make_direct_sale(self, *, delivery_required=False, status=DirectSaleStatus.CONFIRMED, balance=Decimal("0.00")):
        sale = DirectSale.objects.create(
            sale_no=f"DS-{DirectSale.objects.count() + 1:04d}",
            sale_date=date(2026, 4, 12),
            financial_year="2026-27",
            doc_series=self.sale_series,
            customer=self.customer,
            status=status,
            delivery_required=delivery_required,
            grand_total=Decimal("12000.00"),
            received_total=(Decimal("12000.00") - balance),
            balance_total=balance,
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        DirectSaleLine.objects.create(
            direct_sale=sale,
            product=self.product,
            inventory_item=self.inventory_item,
            description="Invoice delivery line",
            quantity=Decimal("1.000"),
            unit_price=Decimal("12000.00"),
            taxable_value=Decimal("12000.00"),
            line_total=Decimal("12000.00"),
        )
        return sale

    def _make_invoice_for_sale(self, sale, *, invoice_status=BillingDocumentStatus.DRAFT):
        invoice = BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 12),
            financial_year="2026-27",
            doc_series=self.invoice_series,
            customer=self.customer,
            direct_sale=sale,
            billing_channel="RETAIL",
            source_type=BillingSourceType.DIRECT_SALE,
            tax_mode="NON_GST",
            subtotal=Decimal("12000.00"),
            taxable_total=Decimal("12000.00"),
            grand_total=Decimal("12000.00"),
            received_total=sale.received_total,
            balance_total=sale.balance_total,
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        BillingInvoiceLine.objects.create(
            invoice=invoice,
            product=self.product,
            inventory_item=self.inventory_item,
            description="Invoice delivery line",
            quantity=Decimal("1.000"),
            unit_price=Decimal("12000.00"),
            taxable_value=Decimal("12000.00"),
            line_total=Decimal("12000.00"),
        )
        if invoice_status != BillingDocumentStatus.DRAFT:
            # Bypass model.save() guards: we only need the persisted status token
            # for the delivery-state machine; accounting posting is out of scope.
            BillingInvoice.objects.filter(pk=invoice.pk).update(status=invoice_status)
            invoice.refresh_from_db()
        return invoice

    # ---- readiness -----------------------------------------------------------
    def test_readiness_exposes_required_fields_for_direct_sale(self):
        sale = self._make_direct_sale(delivery_required=True)
        invoice = self._make_invoice_for_sale(sale)

        readiness = get_invoice_delivery_readiness(invoice)

        for key in (
            "can_create_delivery",
            "can_confirm_delivery",
            "blockers",
            "delivery_status",
            "stock_status",
            "linked_delivery",
            "stock_location",
            "already_delivered_quantity",
            "remaining_quantity",
            "delivery_required",
        ):
            self.assertIn(key, readiness)
        self.assertEqual(readiness["source_type"], BillingSourceType.DIRECT_SALE)
        self.assertEqual(readiness["stock_location"], "Invoice Delivery Store")

    def test_draft_invoice_with_required_delivery_reports_blocked(self):
        sale = self._make_direct_sale(delivery_required=True)
        invoice = self._make_invoice_for_sale(sale)

        readiness = get_invoice_delivery_readiness(invoice)
        self.assertEqual(readiness["delivery_status"], STATUS_BLOCKED)
        self.assertTrue(readiness["blockers"])

    def test_counter_sale_without_delivery_reports_not_required(self):
        sale = self._make_direct_sale(delivery_required=False)
        invoice = self._make_invoice_for_sale(sale, invoice_status=BillingDocumentStatus.POSTED)

        readiness = get_invoice_delivery_readiness(invoice)
        self.assertEqual(readiness["delivery_status"], STATUS_NOT_REQUIRED)
        self.assertTrue(readiness["can_create_delivery"])

    # ---- create delivery -----------------------------------------------------
    def test_create_delivery_from_invoice_enables_flag_and_opens_case(self):
        sale = self._make_direct_sale(delivery_required=False)
        invoice = self._make_invoice_for_sale(sale, invoice_status=BillingDocumentStatus.POSTED)
        invoice_grand_total = invoice.grand_total

        result = create_delivery_from_invoice(invoice=invoice, performed_by=self.admin, payload={})

        self.assertTrue(result["created"])
        self.assertIsNotNone(result["delivery_id"])
        sale.refresh_from_db()
        self.assertTrue(sale.delivery_required)
        self.assertTrue(
            ServiceDeskCase.objects.filter(
                direct_sale=sale,
                case_type=ServiceDeskCaseType.DIRECT_SALE_DELIVERY,
            ).exists()
        )
        # The posted invoice's financial fields are untouched (controlled action).
        invoice.refresh_from_db()
        self.assertEqual(invoice.grand_total, invoice_grand_total)
        self.assertEqual(invoice.status, BillingDocumentStatus.POSTED)

    def test_create_delivery_blocked_when_invoice_cancelled(self):
        sale = self._make_direct_sale(delivery_required=True)
        invoice = self._make_invoice_for_sale(sale)
        BillingInvoice.objects.filter(pk=invoice.pk).update(status=BillingDocumentStatus.CANCELLED)
        invoice.refresh_from_db()

        with self.assertRaises(InvoiceDeliveryBlocked) as ctx:
            create_delivery_from_invoice(invoice=invoice, performed_by=self.admin, payload={})
        self.assertEqual(ctx.exception.code, "INVOICE_NOT_ACTIVE")

    def test_create_delivery_is_idempotent_against_existing_case(self):
        sale = self._make_direct_sale(delivery_required=False)
        invoice = self._make_invoice_for_sale(sale, invoice_status=BillingDocumentStatus.POSTED)
        create_delivery_from_invoice(invoice=invoice, performed_by=self.admin, payload={})

        with self.assertRaises(InvoiceDeliveryBlocked) as ctx:
            create_delivery_from_invoice(invoice=invoice, performed_by=self.admin, payload={})
        self.assertEqual(ctx.exception.code, "DELIVERY_EXISTS")
        self.assertEqual(
            ServiceDeskCase.objects.filter(
                direct_sale=sale, case_type=ServiceDeskCaseType.DIRECT_SALE_DELIVERY
            ).count(),
            1,
        )

    def test_create_delivery_does_not_create_stock_out(self):
        sale = self._make_direct_sale(delivery_required=False)
        invoice = self._make_invoice_for_sale(sale, invoice_status=BillingDocumentStatus.POSTED)

        create_delivery_from_invoice(invoice=invoice, performed_by=self.admin, payload={})

        self.assertFalse(
            StockLedger.objects.filter(
                movement_type__in=[
                    StockMovementType.DELIVERY_OUT,
                    StockMovementType.EMI_DELIVERY_OUT,
                ]
            ).exists()
        )

    # ---- confirm direct sale -------------------------------------------------
    def test_confirm_direct_sale_marks_delivered_without_new_stock_ledger(self):
        sale = self._make_direct_sale(delivery_required=True, balance=Decimal("0.00"))
        invoice = self._make_invoice_for_sale(sale, invoice_status=BillingDocumentStatus.POSTED)

        result = confirm_delivery_for_invoice(invoice=invoice, performed_by=self.admin)

        self.assertTrue(result["confirmed"])
        sale.refresh_from_db()
        self.assertEqual(sale.status, DirectSaleStatus.DELIVERED)
        self.assertIsNotNone(sale.delivered_at)
        # No DELIVERY_OUT row: retail stock leaves as SALE_OUT at posting, not here.
        self.assertFalse(
            StockLedger.objects.filter(
                movement_type__in=[
                    StockMovementType.DELIVERY_OUT,
                    StockMovementType.EMI_DELIVERY_OUT,
                ]
            ).exists()
        )

    def test_confirm_blocked_when_balance_outstanding(self):
        sale = self._make_direct_sale(delivery_required=True, balance=Decimal("5000.00"))
        invoice = self._make_invoice_for_sale(sale, invoice_status=BillingDocumentStatus.POSTED)

        with self.assertRaises(InvoiceDeliveryBlocked) as ctx:
            confirm_delivery_for_invoice(invoice=invoice, performed_by=self.admin)
        self.assertEqual(ctx.exception.code, "CONFIRM_BLOCKED")

    # ---- subscription routing + stock-out exactly once -----------------------
    def _make_subscription_invoice(self):
        batch = create_batch(batch_code="INVDLV2026", duration_months=9, start_date=date(2026, 4, 1))
        lucky_id = create_lucky_id(batch=batch, lucky_number=11)
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("12000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=9,
        )
        invoice = BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 12),
            financial_year="2026-27",
            doc_series=self.invoice_series,
            customer=self.customer,
            subscription=subscription,
            billing_channel="EMI",
            source_type=BillingSourceType.SUBSCRIPTION,
            tax_mode="NON_GST",
            grand_total=Decimal("1000.00"),
            received_total=Decimal("1000.00"),
            balance_total=Decimal("0.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        return subscription, invoice

    def test_subscription_invoice_routes_to_subscription_workflow(self):
        subscription, invoice = self._make_subscription_invoice()
        readiness = get_invoice_delivery_readiness(invoice)
        self.assertEqual(readiness["source_type"], BillingSourceType.SUBSCRIPTION)
        self.assertEqual(readiness["delivery_workflow"], "SUBSCRIPTION")
        self.assertEqual(readiness["delivery_status"], STATUS_PENDING_DELIVERY)

    def test_subscription_readiness_blocks_when_evaluation_fails(self):
        # Fail-closed: if contract readiness cannot be evaluated, delivery must be
        # BLOCKED (never optimistically allowed) so the asset cannot leave the shop.
        subscription, invoice = self._make_subscription_invoice()
        with mock.patch(
            "subscriptions.services.contract_activation_readiness_service."
            "evaluate_contract_activation_readiness",
            side_effect=RuntimeError("readiness backend exploded"),
        ):
            readiness = get_invoice_delivery_readiness(invoice)

        self.assertEqual(readiness["delivery_status"], STATUS_BLOCKED)
        self.assertFalse(readiness["can_confirm_delivery"])
        self.assertFalse(readiness["can_create_delivery"])
        self.assertTrue(
            any(
                blocker
                in {
                    "CONTRACT_READINESS_EVALUATION_FAILED",
                    "CONTRACT_READINESS_SERVICE_UNAVAILABLE",
                }
                for blocker in readiness["blockers"]
            ),
            readiness["blockers"],
        )

    def test_confirm_subscription_creates_single_stock_out_and_no_duplicate(self):
        subscription, invoice = self._make_subscription_invoice()
        delivery = create_delivery(
            subscription=subscription,
            status=DeliveryStatus.OUT_FOR_DELIVERY,
            delivery_reference="DLV-INV-SUB-1",
            created_by=self.admin,
            updated_by=self.admin,
        )

        result = confirm_delivery_for_invoice(invoice=invoice, performed_by=self.admin)
        self.assertTrue(result["confirmed"])
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, DeliveryStatus.DELIVERED)

        out_rows = StockLedger.objects.filter(
            inventory_item=self.inventory_item,
            movement_type=StockMovementType.EMI_DELIVERY_OUT,
        )
        self.assertEqual(out_rows.count(), 1)

        # Repeated confirm must be a no-op (idempotent) — no duplicate stock OUT.
        repeat = confirm_delivery_for_invoice(invoice=invoice, performed_by=self.admin)
        self.assertFalse(repeat["confirmed"])
        self.assertEqual(out_rows.count(), 1)

    def test_manual_invoice_has_no_deliverable_source(self):
        invoice = BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 12),
            financial_year="2026-27",
            doc_series=self.invoice_series,
            customer=self.customer,
            billing_channel="RETAIL",
            source_type=BillingSourceType.MANUAL,
            tax_mode="NON_GST",
            grand_total=Decimal("500.00"),
            received_total=Decimal("500.00"),
            balance_total=Decimal("0.00"),
            customer_name_snapshot=self.customer.name,
        )
        readiness = get_invoice_delivery_readiness(invoice)
        self.assertEqual(readiness["delivery_status"], STATUS_NOT_REQUIRED)
        self.assertFalse(readiness["can_create_delivery"])
        with self.assertRaises(InvoiceDeliveryBlocked) as ctx:
            create_delivery_from_invoice(invoice=invoice, performed_by=self.admin, payload={})
        self.assertEqual(ctx.exception.code, "NO_DELIVERABLE_SOURCE")


class InvoiceDeliveryApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="inv_delivery_api_admin", phone="9361000099")
        self.client.force_authenticate(self.admin)
        self.customer = create_customer_profile(name="API Delivery Customer", phone="7361000099")
        self.product = create_product(
            name="API Delivery Sofa",
            product_code="API-DLV-001",
            base_price=Decimal("12000.00"),
        )
        self.location = StockLocation.objects.create(code="API-DLV-STORE", name="API Delivery Store")
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="API-DLV-SKU-001",
            unit_of_measure="PCS",
            default_stock_location=self.location,
            opening_stock_qty=Decimal("5.000"),
        )
        self.fy, self.sale_series, self.invoice_series = _build_sequences()

    def _direct_sale_invoice(self, *, delivery_required=False, invoice_status=BillingDocumentStatus.POSTED):
        sale = DirectSale.objects.create(
            sale_no=f"DS-API-{DirectSale.objects.count() + 1:04d}",
            sale_date=date(2026, 4, 12),
            financial_year="2026-27",
            doc_series=self.sale_series,
            customer=self.customer,
            status=DirectSaleStatus.CONFIRMED,
            delivery_required=delivery_required,
            grand_total=Decimal("12000.00"),
            received_total=Decimal("12000.00"),
            balance_total=Decimal("0.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        DirectSaleLine.objects.create(
            direct_sale=sale,
            product=self.product,
            inventory_item=self.inventory_item,
            description="API delivery line",
            quantity=Decimal("1.000"),
            unit_price=Decimal("12000.00"),
            taxable_value=Decimal("12000.00"),
            line_total=Decimal("12000.00"),
        )
        invoice = BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 12),
            financial_year="2026-27",
            doc_series=self.invoice_series,
            customer=self.customer,
            direct_sale=sale,
            billing_channel="RETAIL",
            source_type=BillingSourceType.DIRECT_SALE,
            tax_mode="NON_GST",
            grand_total=Decimal("12000.00"),
            received_total=Decimal("12000.00"),
            balance_total=Decimal("0.00"),
            customer_name_snapshot=self.customer.name,
        )
        if invoice_status != BillingDocumentStatus.DRAFT:
            BillingInvoice.objects.filter(pk=invoice.pk).update(status=invoice_status)
            invoice.refresh_from_db()
        return sale, invoice

    def test_invoice_list_includes_delivery_summary(self):
        self._direct_sale_invoice(delivery_required=True)
        response = self.client.get("/api/v1/billing/invoices/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.json()["results"]
        self.assertTrue(rows)
        summary = rows[0]["delivery_summary"]
        self.assertIn("delivery_status", summary)
        self.assertEqual(summary["source_type"], BillingSourceType.DIRECT_SALE)

    def test_delivery_readiness_endpoint(self):
        _sale, invoice = self._direct_sale_invoice(delivery_required=True)
        response = self.client.get(f"/api/v1/billing/invoices/{invoice.id}/delivery-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("can_create_delivery", response.json())

    def test_create_delivery_endpoint(self):
        _sale, invoice = self._direct_sale_invoice(delivery_required=False)
        response = self.client.post(f"/api/v1/billing/invoices/{invoice.id}/create-delivery/")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNotNone(response.json()["delivery_id"])

    def test_create_delivery_on_manual_invoice_returns_controlled_400(self):
        invoice = BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 12),
            financial_year="2026-27",
            doc_series=self.invoice_series,
            customer=self.customer,
            billing_channel="RETAIL",
            source_type=BillingSourceType.MANUAL,
            tax_mode="NON_GST",
            grand_total=Decimal("500.00"),
            received_total=Decimal("500.00"),
            balance_total=Decimal("0.00"),
            customer_name_snapshot=self.customer.name,
        )
        response = self.client.post(f"/api/v1/billing/invoices/{invoice.id}/create-delivery/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json().get("code"), "NO_DELIVERABLE_SOURCE")

    def test_delivered_invoice_blocks_create_delivery(self):
        sale, invoice = self._direct_sale_invoice(delivery_required=True)
        # Confirm the handover first.
        confirm_delivery_for_invoice(invoice=invoice, performed_by=self.admin)

        readiness = self.client.get(
            f"/api/v1/billing/invoices/{invoice.id}/delivery-readiness/"
        ).json()
        self.assertEqual(readiness["delivery_status"], STATUS_DELIVERED)
        self.assertFalse(readiness["can_create_delivery"])

        response = self.client.post(f"/api/v1/billing/invoices/{invoice.id}/create-delivery/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_posted_invoice_cannot_be_freely_patched(self):
        _sale, invoice = self._direct_sale_invoice(delivery_required=True)
        response = self.client.patch(
            f"/api/v1/billing/invoices/{invoice.id}/",
            {"notes": "trying to edit posted invoice"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
