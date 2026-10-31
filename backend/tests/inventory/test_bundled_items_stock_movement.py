from decimal import Decimal
from datetime import date
from django.utils import timezone
from django.test import TestCase

from billing.models import BillingInvoice, BillingInvoiceLine, BillingDocumentStatus, DocumentSequence
from inventory.models import (
    InventoryItem,
    InventoryItemType,
    StockLocation,
    StockLedger,
    StockMovementType,
)
from inventory.services.delivery_bridge_service import sync_delivery_inventory_bridge
from inventory.services.stock_movement_service import check_stock_for_delivery
from inventory.services.stock_service import (
    create_stock_ledger_entry,
    post_invoice_stock_movements,
    post_credit_note_stock_movements,
)
from products_core.models import Product, ProductRelationship
from subscriptions.enums import ProductRelationshipType
from subscriptions.models import Customer, DeliveryStatus, PlanType, Subscription, SubscriptionDelivery
from tests.helpers import create_product, create_customer_profile, create_batch, create_lucky_id, create_subscription


class BundledItemsStockMovementTests(TestCase):
    def setUp(self):
        super().setUp()
        self.location = StockLocation.objects.create(name="Showroom Warehouse", code="LOC-SHOWROOM", is_active=True)
        self.customer = create_customer_profile(name="Test Buyer", phone="9876543210")
        self.doc_series = DocumentSequence.objects.create(
            series_code="BILL_INV_TEST",
            document_type="TAX_INVOICE",
            financial_year="2026-27",
            prefix="INV-TEST",
            next_number=1,
        )

        # 1. Finished Good (Bed)
        self.bed_product = create_product(
            name="Bahubali King Bed",
            product_code="BED-BAHU-KING",
            base_price=Decimal("15000.00"),
            published=True,
        )
        self.bed_inv = InventoryItem.objects.create(
            product=self.bed_product,
            sku="BED-BAHU-KING",
            stock_item_type=InventoryItemType.FINISHED_GOOD,
            default_stock_location=self.location,
            stock_tracking_enabled=True,
            delivery_stock_bridge_enabled=True,
            opening_stock_qty=Decimal("5.000"),
            standard_unit_cost=Decimal("8000.00"),
        )

        # 2. Accessory (Commercial Plyboard)
        self.ply_product = create_product(
            name="Commercial Plyboard 78x36x16mm",
            product_code="COMM-PLYB-7836",
            base_price=Decimal("1500.00"),
            published=True,
        )
        self.ply_inv = InventoryItem.objects.create(
            product=self.ply_product,
            sku="COMM-PLYB-7836",
            stock_item_type=InventoryItemType.ACCESSORY,
            default_stock_location=self.location,
            stock_tracking_enabled=True,
            delivery_stock_bridge_enabled=True,
            opening_stock_qty=Decimal("10.000"),
            standard_unit_cost=Decimal("1200.00"),
            purchase_unit_cost=Decimal("1150.00"),
        )

        # 3. Create ProductRelationship (Bed includes 2x Commercial Plyboard)
        self.rel = ProductRelationship.objects.create(
            product=self.bed_product,
            related_product=self.ply_product,
            relationship_type=ProductRelationshipType.ACCESSORY,
            quantity=Decimal("2.00"),
            is_price_included_in_parent=True,
        )

    def test_post_invoice_stock_movements_deducts_both_bed_and_bundled_plyboard(self):
        """When an invoice for 1 Bed is posted, 1 Bed and 2 Plyboards are deducted."""
        invoice = BillingInvoice.objects.create(
            document_no="INV-TEST-001",
            invoice_date=date.today(),
            financial_year="2026-27",
            doc_series=self.doc_series,
            status=BillingDocumentStatus.APPROVED,
            customer=self.customer,
            subtotal=Decimal("15000.00"),
            taxable_total=Decimal("15000.00"),
            grand_total=Decimal("15000.00"),
            received_total=Decimal("15000.00"),
            balance_total=Decimal("0.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        BillingInvoiceLine.objects.create(
            invoice=invoice,
            product=self.bed_product,
            inventory_item=self.bed_inv,
            description="Bahubali King Bed",
            quantity=Decimal("1.000"),
            unit_price=Decimal("15000.00"),
            taxable_value=Decimal("15000.00"),
            line_total=Decimal("15000.00"),
        )

        result = post_invoice_stock_movements(invoice=invoice)
        self.assertEqual(result["created_count"], 2)  # 1 Bed + 1 Bundled item

        # Verify Bed StockLedger entry
        bed_entry = StockLedger.objects.filter(
            inventory_item=self.bed_inv,
            movement_type=StockMovementType.SALE_OUT,
            reference_model="BillingInvoiceLine",
        ).first()
        self.assertIsNotNone(bed_entry)
        self.assertEqual(bed_entry.quantity_out, Decimal("1.000"))

        # Verify Bundled Commercial Plyboard StockLedger entry
        ply_entry = StockLedger.objects.filter(
            inventory_item=self.ply_inv,
            movement_type=StockMovementType.SALE_OUT,
            reference_model="BillingInvoiceLine",
        ).first()
        self.assertIsNotNone(ply_entry)
        self.assertEqual(ply_entry.quantity_out, Decimal("2.000"))
        self.assertIn("Bundled Accessory", ply_entry.notes)

    def test_sync_delivery_inventory_bridge_deducts_bundled_plyboard_on_subscription_delivery(self):
        """When a subscription delivery is marked DELIVERED, bundled plyboards are also deducted."""
        batch = create_batch(batch_code="BATCH-BED-TEST", duration_months=10)
        lucky_id = create_lucky_id(batch=batch, lucky_number=10)
        sub = create_subscription(
            customer=self.customer,
            product=self.bed_product,
            batch=batch,
            lucky_id=lucky_id,
            tenure_months=10,
            monthly_amount=Decimal("1500.00"),
            total_amount=Decimal("15000.00"),
        )
        delivery = SubscriptionDelivery.objects.create(
            subscription=sub,
            delivery_reference="DEL-TEST-BED-001",
            batch_number=1,
            status=DeliveryStatus.DELIVERED,
            delivered_at=timezone.now(),
        )

        bridge_result = sync_delivery_inventory_bridge(delivery=delivery)
        self.assertTrue(bridge_result["created"])
        self.assertEqual(bridge_result["entries_created"], 2)  # 1 Bed + 1 Bundled item

        # Verify Bed delivery out
        bed_entry = StockLedger.objects.filter(
            inventory_item=self.bed_inv,
            movement_type=StockMovementType.EMI_DELIVERY_OUT,
            reference_model="SubscriptionDelivery",
        ).first()
        self.assertIsNotNone(bed_entry)
        self.assertEqual(bed_entry.quantity_out, Decimal("1.000"))

        # Verify Bundled Commercial Plyboard delivery out
        ply_entry = StockLedger.objects.filter(
            inventory_item=self.ply_inv,
            movement_type=StockMovementType.EMI_DELIVERY_OUT,
            reference_model="SubscriptionDelivery",
        ).first()
        self.assertIsNotNone(ply_entry)
        self.assertEqual(ply_entry.quantity_out, Decimal("2.000"))

    def test_check_stock_for_delivery_blocks_if_bundled_plyboard_out_of_stock(self):
        """If Bed has stock but Plyboard is out of stock, check_stock_for_delivery returns ok=False."""
        # Drive plyboard stock to 0
        create_stock_ledger_entry(
            inventory_item=self.ply_inv,
            movement_type=StockMovementType.SALE_OUT,
            movement_date=date.today(),
            stock_location=self.location,
            quantity_out=Decimal("10.000"),
            reference_model="TestSetup",
            reference_id="deplete-ply",
        )
        self.assertEqual(self.ply_inv.current_stock_quantity(), Decimal("0.000"))
        self.assertGreaterEqual(self.bed_inv.current_stock_quantity(), Decimal("1.000"))

        check = check_stock_for_delivery(inventory_item=self.bed_inv, quantity=Decimal("1.000"))
        self.assertFalse(check["ok"])
        self.assertIn("Commercial Plyboard", check["reason"])
        self.assertIn("out of stock", check["reason"])
