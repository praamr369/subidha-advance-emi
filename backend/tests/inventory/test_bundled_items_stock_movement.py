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
    FinishedGoodAccessoryLink,
    FGAccessoryChargeMode,
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

    def test_sync_delivery_inventory_bridge_deducts_fg_accessory_link_on_rent_delivery(self):
        """
        When a FinishedGood has an accessory linked via FinishedGoodAccessoryLink,
        delivering a rent subscription deducts RENT_HANDOVER_OUT for both bed and commercial plyboard.
        """
        # Remove ProductRelationship to test FinishedGoodAccessoryLink in isolation
        self.rel.delete()

        # Link accessory via FinishedGoodAccessoryLink
        fg_link = FinishedGoodAccessoryLink.objects.create(
            finished_good=self.bed_inv,
            accessory=self.ply_inv,
            charge_mode=FGAccessoryChargeMode.FREE,
            is_default_included=True,
        )

        sub = Subscription.objects.create(
            customer=self.customer,
            product=self.bed_product,
            plan_type=PlanType.RENT,
            start_date=timezone.now().date(),
            tenure_months=6,
            monthly_amount=Decimal("1000.00"),
            total_amount=Decimal("6000.00"),
        )
        delivery = SubscriptionDelivery.objects.create(
            subscription=sub,
            delivery_reference="DLV-RENT-BED-001",
            batch_number=1,
            status=DeliveryStatus.DELIVERED,
            delivered_at=timezone.now(),
        )

        bridge_result = sync_delivery_inventory_bridge(delivery=delivery)
        self.assertTrue(bridge_result["created"])
        self.assertEqual(bridge_result["entries_created"], 2)  # Bed + Linked Accessory

        # Verify Bed delivery out (RENT_HANDOVER_OUT)
        bed_entry = StockLedger.objects.filter(
            inventory_item=self.bed_inv,
            movement_type=StockMovementType.RENT_HANDOVER_OUT,
            reference_model="SubscriptionDelivery",
        ).first()
        self.assertIsNotNone(bed_entry)
        self.assertEqual(bed_entry.quantity_out, Decimal("1.000"))

        # Verify Commercial Plyboard delivery out (RENT_HANDOVER_OUT)
        ply_entry = StockLedger.objects.filter(
            inventory_item=self.ply_inv,
            movement_type=StockMovementType.RENT_HANDOVER_OUT,
            reference_model="SubscriptionDelivery",
        ).first()
        self.assertIsNotNone(ply_entry)
        self.assertEqual(ply_entry.quantity_out, Decimal("1.000"))
        self.assertIn("Linked Accessory", ply_entry.notes)

        # Calling sync_delivery_inventory_bridge a second time is completely idempotent
        second_result = sync_delivery_inventory_bridge(delivery=delivery)
        self.assertEqual(second_result["entries_created"], 0)

    def test_check_stock_for_delivery_blocks_if_fg_accessory_link_out_of_stock(self):
        """FinishedGoodAccessoryLink accessory out of stock blocks delivery check."""
        self.rel.delete()
        FinishedGoodAccessoryLink.objects.create(
            finished_good=self.bed_inv,
            accessory=self.ply_inv,
            charge_mode=FGAccessoryChargeMode.FREE,
            is_default_included=True,
        )
        # Deplete plyboard stock
        create_stock_ledger_entry(
            inventory_item=self.ply_inv,
            movement_type=StockMovementType.SALE_OUT,
            movement_date=date.today(),
            stock_location=self.location,
            quantity_out=Decimal("10.000"),
            reference_model="TestSetup",
            reference_id="deplete-ply-fg",
        )
        check = check_stock_for_delivery(inventory_item=self.bed_inv, quantity=Decimal("1.000"))
        self.assertFalse(check["ok"])
        self.assertIn("Commercial Plyboard", check["reason"])
        self.assertIn("out of stock", check["reason"])

    def test_fractional_accessory_deduction_from_product_relationship(self):
        """When ProductRelationship has fractional quantity (0.50), exactly 0.500 is deducted."""
        self.rel.quantity = Decimal("0.50")
        self.rel.save(update_fields=["quantity"])

        sub = Subscription.objects.create(
            customer=self.customer,
            product=self.bed_product,
            plan_type=PlanType.RENT,
            start_date=timezone.now().date(),
            tenure_months=6,
            monthly_amount=Decimal("1000.00"),
            total_amount=Decimal("6000.00"),
        )
        delivery = SubscriptionDelivery.objects.create(
            subscription=sub,
            batch_number=1,
            delivered_at=timezone.now(),
            status=DeliveryStatus.DELIVERED,
            delivery_reference="DLV-TEST-FRACT-01",
        )
        res = sync_delivery_inventory_bridge(delivery=delivery)
        self.assertEqual(res["entries_created"], 2)

        ply_entry = StockLedger.objects.filter(
            inventory_item=self.ply_inv,
            movement_type=StockMovementType.RENT_HANDOVER_OUT,
            reference_model="SubscriptionDelivery",
            reference_id__startswith=f"{delivery.id}-",
        ).first()
        self.assertIsNotNone(ply_entry)
        self.assertEqual(ply_entry.quantity_out, Decimal("0.500"))

    def test_fractional_accessory_deduction_from_fg_accessory_link(self):
        """When FinishedGoodAccessoryLink has fractional quantity (0.500), exactly 0.500 is deducted."""
        self.rel.delete()
        link = FinishedGoodAccessoryLink.objects.create(
            finished_good=self.bed_inv,
            accessory=self.ply_inv,
            charge_mode=FGAccessoryChargeMode.FREE,
            is_default_included=True,
            quantity=Decimal("0.500"),
        )
        sub = Subscription.objects.create(
            customer=self.customer,
            product=self.bed_product,
            plan_type=PlanType.RENT,
            start_date=timezone.now().date(),
            tenure_months=6,
            monthly_amount=Decimal("1000.00"),
            total_amount=Decimal("6000.00"),
        )
        delivery = SubscriptionDelivery.objects.create(
            subscription=sub,
            batch_number=1,
            delivered_at=timezone.now(),
            status=DeliveryStatus.DELIVERED,
            delivery_reference="DLV-TEST-FRACT-02",
        )
        res = sync_delivery_inventory_bridge(delivery=delivery)
        self.assertEqual(res["entries_created"], 2)

        ply_entry = StockLedger.objects.filter(
            inventory_item=self.ply_inv,
            movement_type=StockMovementType.RENT_HANDOVER_OUT,
            reference_model="SubscriptionDelivery",
            reference_id=f"{delivery.id}-{self.bed_product.id}:fg_acc:{link.id}",
        ).first()
        self.assertIsNotNone(ply_entry)
        self.assertEqual(ply_entry.quantity_out, Decimal("0.500"))

    def test_resync_updates_existing_ledger_entry_from_full_to_fractional(self):
        """Resync updates an existing 1.000 entry to 0.500 without creating duplicates."""
        self.rel.quantity = Decimal("0.50")
        self.rel.save(update_fields=["quantity"])

        sub = Subscription.objects.create(
            customer=self.customer,
            product=self.bed_product,
            plan_type=PlanType.RENT,
            start_date=timezone.now().date(),
            tenure_months=6,
            monthly_amount=Decimal("1000.00"),
            total_amount=Decimal("6000.00"),
        )
        delivery = SubscriptionDelivery.objects.create(
            subscription=sub,
            batch_number=1,
            delivered_at=timezone.now(),
            status=DeliveryStatus.DELIVERED,
            delivery_reference="DLV-TEST-RESYNC-01",
        )
        # Pre-create entry with wrong 1.000 quantity (simulating previous buggy post)
        old_entry = StockLedger.objects.create(
            inventory_item=self.ply_inv,
            movement_type=StockMovementType.RENT_HANDOVER_OUT,
            movement_date=date.today(),
            stock_location=self.location,
            quantity_in=Decimal("0.000"),
            quantity_out=Decimal("1.000"),
            reference_model="SubscriptionDelivery",
            reference_id=f"{delivery.id}-{self.bed_product.id}:fg_acc:999",
            notes="Old 1.000 entry",
        )

        res = sync_delivery_inventory_bridge(delivery=delivery)
        # Should post an ADJUSTMENT_IN for difference (0.500)
        adj_entry = StockLedger.objects.filter(
            inventory_item=self.ply_inv,
            movement_type=StockMovementType.ADJUSTMENT_IN,
            reference_model="SubscriptionDelivery",
            reference_id=f"{delivery.id}-{self.bed_product.id}:adj_corr:{self.ply_inv.id}",
        ).first()
        self.assertIsNotNone(adj_entry)
        self.assertEqual(adj_entry.quantity_in, Decimal("0.500"))

        # Verify net movement is 0.500
        all_entries = StockLedger.objects.filter(
            inventory_item=self.ply_inv,
            reference_model="SubscriptionDelivery",
            reference_id__startswith=f"{delivery.id}-",
        )
        net_out = sum(e.quantity_out - e.quantity_in for e in all_entries)
        self.assertEqual(net_out, Decimal("0.500"))

    def test_post_invoice_stock_movements_deducts_variant_specific_commercial_plyboards(self):
        """
        Exact simulation of Hybrid Bed scenario:
        - Parent Product: Hybrid Square Bed
        - Variant B (HYBR-SQUA-BED-B): attached 1x COMM-PLYB-7836 + 0.5x COMM-PLYB-7848
        - Variant C (HYBR-SQUA-BED-C): attached 2x COMM-PLYB-7836
        When invoice for Variant B is posted, deducts 1.000 of 7836 and 0.500 of 7848.
        When invoice for Variant C is posted, deducts 2.000 of 7836.
        """
        from django.core.management import call_command
        import io

        # 2nd accessory: 78*48*16mm
        ply48_product = create_product(
            name="Commercial Plyboard 78*48*16mm",
            product_code="COMM-PLYB-7848",
            base_price=Decimal("1700.00"),
            published=True,
        )
        ply48_inv = InventoryItem.objects.create(
            product=ply48_product,
            sku="COMM-PLYB-7848",
            stock_item_type=InventoryItemType.ACCESSORY,
            default_stock_location=self.location,
            stock_tracking_enabled=True,
            opening_stock_qty=Decimal("10.000"),
            standard_unit_cost=Decimal("1500.00"),
        )

        # Operational products for Variant B and Variant C
        bed_b_prod = create_product(
            name="Hybrid Square Bed Queen",
            product_code="HYBR-SQUA-BED-B",
            base_price=Decimal("12500.00"),
            published=True,
        )
        bed_b_inv = InventoryItem.objects.create(
            product=bed_b_prod,
            sku="HYBR-SQUA-BED-B",
            stock_item_type=InventoryItemType.FINISHED_GOOD,
            default_stock_location=self.location,
            stock_tracking_enabled=True,
            opening_stock_qty=Decimal("5.000"),
            standard_unit_cost=Decimal("8000.00"),
        )

        bed_c_prod = create_product(
            name="Hybrid Square Bed King",
            product_code="HYBR-SQUA-BED-C",
            base_price=Decimal("20000.00"),
            published=True,
        )
        bed_c_inv = InventoryItem.objects.create(
            product=bed_c_prod,
            sku="HYBR-SQUA-BED-C",
            stock_item_type=InventoryItemType.FINISHED_GOOD,
            default_stock_location=self.location,
            stock_tracking_enabled=True,
            opening_stock_qty=Decimal("5.000"),
            standard_unit_cost=Decimal("10000.00"),
        )

        # Attach relations (stored with base product + parent_variant_sku)
        ProductRelationship.objects.create(
            product=self.bed_product,
            related_product=self.ply_product,
            parent_variant_sku="HYBR-SQUA-BED-B",
            relationship_type=ProductRelationshipType.ACCESSORY,
            quantity=Decimal("1.00"),
            is_price_included_in_parent=True,
        )
        ProductRelationship.objects.create(
            product=self.bed_product,
            related_product=ply48_product,
            parent_variant_sku="HYBR-SQUA-BED-B",
            relationship_type=ProductRelationshipType.ACCESSORY,
            quantity=Decimal("0.50"),
            is_price_included_in_parent=True,
        )
        ProductRelationship.objects.create(
            product=self.bed_product,
            related_product=self.ply_product,
            parent_variant_sku="HYBR-SQUA-BED-C",
            relationship_type=ProductRelationshipType.ACCESSORY,
            quantity=Decimal("2.00"),
            is_price_included_in_parent=True,
        )

        # Invoice for Variant B (simulating Manoj Bauri INV/FY2026-27/00002)
        inv_b = BillingInvoice.objects.create(
            document_no="INV/FY2026-27/00002",
            invoice_date=date(2026, 11, 8),
            financial_year="2026-27",
            doc_series=self.doc_series,
            status=BillingDocumentStatus.APPROVED,
            customer=self.customer,
            subtotal=Decimal("12500.00"),
            taxable_total=Decimal("12500.00"),
            grand_total=Decimal("12500.00"),
            received_total=Decimal("12500.00"),
            balance_total=Decimal("0.00"),
        )
        BillingInvoiceLine.objects.create(
            invoice=inv_b,
            product=bed_b_prod,
            inventory_item=bed_b_inv,
            description="Hybrid Square Bed Queen",
            quantity=Decimal("1.000"),
            unit_price=Decimal("12500.00"),
            taxable_value=Decimal("12500.00"),
            line_total=Decimal("12500.00"),
        )

        # Post movements for Variant B
        res_b = post_invoice_stock_movements(invoice=inv_b)
        self.assertEqual(res_b["created_count"], 3)  # 1 Bed + 2 bundled plyboards

        # Verify Variant B Bed deducted
        entry_b = StockLedger.objects.filter(
            inventory_item=bed_b_inv,
            movement_type=StockMovementType.SALE_OUT,
            reference_model="BillingInvoiceLine",
            reference_id__startswith=f"{inv_b.id}:",
        ).first()
        self.assertIsNotNone(entry_b)
        self.assertEqual(entry_b.quantity_out, Decimal("1.000"))

        # Verify 1.000 of 78*36mm Commercial Plyboard deducted
        entry_ply36_b = StockLedger.objects.filter(
            inventory_item=self.ply_inv,
            movement_type=StockMovementType.SALE_OUT,
            reference_model="BillingInvoiceLine",
            reference_id__startswith=f"{inv_b.id}:",
        ).first()
        self.assertIsNotNone(entry_ply36_b)
        self.assertEqual(entry_ply36_b.quantity_out, Decimal("1.000"))

        # Verify 0.500 of 78*48mm Commercial Plyboard deducted
        entry_ply48_b = StockLedger.objects.filter(
            inventory_item=ply48_inv,
            movement_type=StockMovementType.SALE_OUT,
            reference_model="BillingInvoiceLine",
            reference_id__startswith=f"{inv_b.id}:",
        ).first()
        self.assertIsNotNone(entry_ply48_b)
        self.assertEqual(entry_ply48_b.quantity_out, Decimal("0.500"))

        # Invoice for Variant C (simulating Umesh Thakur INV/FY2026-27/00003)
        inv_c = BillingInvoice.objects.create(
            document_no="INV/FY2026-27/00003",
            invoice_date=date(2026, 11, 8),
            financial_year="2026-27",
            doc_series=self.doc_series,
            status=BillingDocumentStatus.APPROVED,
            customer=self.customer,
            subtotal=Decimal("20000.00"),
            taxable_total=Decimal("20000.00"),
            grand_total=Decimal("20000.00"),
            received_total=Decimal("12000.00"),
            balance_total=Decimal("8000.00"),
        )
        BillingInvoiceLine.objects.create(
            invoice=inv_c,
            product=bed_c_prod,
            inventory_item=bed_c_inv,
            description="Hybrid Square Bed King",
            quantity=Decimal("1.000"),
            unit_price=Decimal("20000.00"),
            taxable_value=Decimal("20000.00"),
            line_total=Decimal("20000.00"),
        )

        res_c = post_invoice_stock_movements(invoice=inv_c)
        self.assertEqual(res_c["created_count"], 2)  # 1 Bed + 1 bundled plyboard (qty 2)

        entry_ply36_c = StockLedger.objects.filter(
            inventory_item=self.ply_inv,
            movement_type=StockMovementType.SALE_OUT,
            reference_model="BillingInvoiceLine",
            reference_id__startswith=f"{inv_c.id}:",
        ).first()
        self.assertIsNotNone(entry_ply36_c)
        self.assertEqual(entry_ply36_c.quantity_out, Decimal("2.000"))

        # Test management command resync (idempotent, 0 new created)
        out = io.StringIO()
        call_command("resync_invoice_stock_movements", invoice_no="INV/FY2026-27/00002", stdout=out)
        self.assertIn("created 0 new", out.getvalue().lower())
        self.assertIn("existing", out.getvalue().lower())

    def test_accessory_sourcing_and_pricing_setup_and_sync(self):
        """Test ProductRelationship syncing charge_mode, sale_price, sourcing_type, and sourcing_vendor to FinishedGoodAccessoryLink."""
        from accounting.models import Vendor
        from subscriptions.enums import AccessoryChargeMode, SourcingType
        from rest_framework.test import APIRequestFactory
        from api.v1.views.admin_inventory_quick_create import AdminBillingAccessoryOptionsView

        vendor_outsourced = Vendor.objects.create(name="Vendor B Accessories Ltd")

        # 1. Product A (Finished Good)
        ac_prod = create_product(
            name="Air Conditioner Split 1.5T",
            product_code="AC-SPLIT-15T",
            base_price=Decimal("35000.00"),
            published=True,
        )
        ac_inv = InventoryItem.objects.create(
            product=ac_prod,
            sku="AC-SPLIT-15T",
            stock_item_type=InventoryItemType.FINISHED_GOOD,
            default_stock_location=self.location,
            stock_tracking_enabled=True,
            standard_unit_cost=Decimal("22000.00"),
        )

        # 2. Accessory X (Copper Pipe - Supplied Free with Parent)
        pipe_prod = create_product(
            name="Copper Pipe 3m",
            product_code="ACC-COPPER-3M",
            base_price=Decimal("1200.00"),
            published=True,
        )
        pipe_inv = InventoryItem.objects.create(
            product=pipe_prod,
            sku="ACC-COPPER-3M",
            stock_item_type=InventoryItemType.ACCESSORY,
            default_stock_location=self.location,
            standard_unit_cost=Decimal("700.00"),
        )

        # 3. Accessory Z (Heavy Duty Bracket - Outsourced Paid)
        bracket_prod = create_product(
            name="Heavy Duty Wall Bracket",
            product_code="ACC-BRACKET-HD",
            base_price=Decimal("950.00"),
            published=True,
        )
        bracket_inv = InventoryItem.objects.create(
            product=bracket_prod,
            sku="ACC-BRACKET-HD",
            stock_item_type=InventoryItemType.ACCESSORY,
            default_stock_location=self.location,
            standard_unit_cost=Decimal("450.00"),
        )

        # Create ProductRelationships
        rel_free = ProductRelationship.objects.create(
            product=ac_prod,
            related_product=pipe_prod,
            relationship_type=ProductRelationshipType.ACCESSORY,
            quantity=Decimal("1.00"),
            charge_mode=AccessoryChargeMode.FREE,
            sale_price=Decimal("0.00"),
            sourcing_type=SourcingType.SUPPLIED_WITH_PARENT,
        )

        rel_paid = ProductRelationship.objects.create(
            product=ac_prod,
            related_product=bracket_prod,
            relationship_type=ProductRelationshipType.ACCESSORY,
            quantity=Decimal("1.00"),
            charge_mode=AccessoryChargeMode.CHARGEABLE,
            sale_price=Decimal("800.00"),
            sourcing_type=SourcingType.OUTSOURCED_SEPARATE,
            sourcing_vendor=vendor_outsourced,
        )

        # Verify FinishedGoodAccessoryLink sync via signals
        link_free = FinishedGoodAccessoryLink.objects.get(finished_good=ac_inv, accessory=pipe_inv)
        self.assertEqual(link_free.charge_mode, FGAccessoryChargeMode.FREE)
        self.assertEqual(link_free.sourcing_type, SourcingType.SUPPLIED_WITH_PARENT)
        self.assertIsNone(link_free.sourcing_vendor)

        link_paid = FinishedGoodAccessoryLink.objects.get(finished_good=ac_inv, accessory=bracket_inv)
        self.assertEqual(link_paid.charge_mode, FGAccessoryChargeMode.CHARGEABLE)
        self.assertEqual(link_paid.sale_price, Decimal("800.00"))
        self.assertEqual(link_paid.sourcing_type, SourcingType.OUTSOURCED_SEPARATE)
        self.assertEqual(link_paid.sourcing_vendor, vendor_outsourced)

        # Verify AdminBillingAccessoryOptionsView response
        factory = APIRequestFactory()
        request = factory.get(f"/api/v1/admin/inventory/finished-goods/{ac_prod.id}/billing-accessories/")
        request.user = self.customer.user if hasattr(self.customer, 'user') and self.customer.user else None
        view = AdminBillingAccessoryOptionsView.as_view()
        from django.contrib.auth import get_user_model
        User = get_user_model()
        admin_user = User.objects.create_superuser("admin_acc_test", "acc@test.com", "pass123", phone="9999988888")
        from rest_framework.test import force_authenticate
        force_authenticate(request, user=admin_user)

        response = view(request, product_id=ac_prod.id)
        self.assertEqual(response.status_code, 200)
        options = response.data.get("accessory_options", [])
        self.assertEqual(len(options), 2)

        opt_pipe = next((o for o in options if o["link_id"] == link_free.id), None)
        self.assertIsNotNone(opt_pipe)
        self.assertTrue(opt_pipe["is_supplied_with_parent"])
        self.assertEqual(opt_pipe["charge_mode"], "FREE")

        opt_bracket = next((o for o in options if o["link_id"] == link_paid.id), None)
        self.assertIsNotNone(opt_bracket)
        self.assertFalse(opt_bracket["is_supplied_with_parent"])
        self.assertEqual(opt_bracket["charge_mode"], "CHARGEABLE")
        self.assertEqual(opt_bracket["sale_price"], "800.00")
        self.assertEqual(opt_bracket["sourcing_vendor_name"], "Vendor B Accessories Ltd")

    def test_accessory_variant_group_options_and_explicit_direct_sale_no_double_deduction(self):
        """Explicitly selected accessory variants on DirectSale avoid double-deduction or deducting unchosen variants."""
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIRequestFactory, force_authenticate
        from api.v1.views.admin_inventory_quick_create import AdminBillingAccessoryOptionsView
        from billing.services.billing_service import create_direct_sale
        from inventory.models import AccessoryVariantGroup

        grp = AccessoryVariantGroup.objects.create(code="SIDE-RAIL", name="Side Rail", is_active=True)
        rail_normal_prod = create_product(name="Steel Side Rail (Normal)", product_code="RAIL-NORM", base_price=Decimal("500.00"), published=True)
        rail_normal_inv = InventoryItem.objects.create(
            product=rail_normal_prod, sku="RAIL-NORM", stock_item_type=InventoryItemType.ACCESSORY,
            default_stock_location=self.location, stock_tracking_enabled=True, delivery_stock_bridge_enabled=True,
            opening_stock_qty=Decimal("10.000"), standard_unit_cost=Decimal("300.00"), purchase_unit_cost=Decimal("320.00"),
            variant_group=grp, variant_label="Normal Steel",
        )
        rail_hybrid_prod = create_product(name="Side Rail (Hybrid)", product_code="RAIL-HYBR", base_price=Decimal("2000.00"), published=True)
        rail_hybrid_inv = InventoryItem.objects.create(
            product=rail_hybrid_prod, sku="RAIL-HYBR", stock_item_type=InventoryItemType.ACCESSORY,
            default_stock_location=self.location, stock_tracking_enabled=True, delivery_stock_bridge_enabled=True,
            opening_stock_qty=Decimal("8.000"), standard_unit_cost=Decimal("1100.00"), purchase_unit_cost=Decimal("1200.00"),
            variant_group=grp, variant_label="Hybrid",
        )
        FinishedGoodAccessoryLink.objects.create(
            finished_good=self.bed_inv,
            variant_group=grp,
            charge_mode=FGAccessoryChargeMode.CHARGEABLE,
            sale_price=Decimal("0.00"),
            is_default_included=True,
            quantity=Decimal("2.000"),
        )

        User = get_user_model()
        admin_user = User.objects.create_superuser("admin_var_test", "var@test.com", "pass123", phone="9999977777")
        factory = APIRequestFactory()
        request = factory.get(f"/api/v1/admin/inventory/finished-goods/{self.bed_product.id}/billing-accessories/?item_id={self.bed_inv.id}")
        force_authenticate(request, user=admin_user)
        resp = AdminBillingAccessoryOptionsView.as_view()(request, product_id=self.bed_product.id)
        self.assertEqual(resp.status_code, 200)
        group_opt = next((o for o in resp.data["accessory_options"] if o["group_id"] == grp.id), None)
        self.assertIsNotNone(group_opt)
        self.assertEqual(len(group_opt["variants"]), 2)
        v_hybr = next(v for v in group_opt["variants"] if v["id"] == rail_hybrid_inv.id)
        self.assertEqual(v_hybr["purchase_unit_cost"], "1200.00")
        self.assertEqual(v_hybr["base_price"], "2000.00")
        self.assertEqual(v_hybr["available_stock"], "8.000")

        # Create direct sale with bed + chosen Hybrid rail ONLY (is_accessory=True, accessories_configured=True)
        from accounting.models import FinancialYear
        fy = FinancialYear.objects.create(
            code="FY2026-27",
            name="FY 2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
            is_active=True,
        )
        DocumentSequence.objects.create(
            series_code="DS-TEST-2026",
            document_type="DIRECT_SALE",
            financial_year="2026-27",
            financial_year_ref=fy,
            prefix="DS-TEST",
            pattern="DS-TEST/{number}",
            next_number=1,
        )
        DocumentSequence.objects.create(
            series_code="DS-INV-TEST-2026",
            document_type="DIRECT_SALE_INVOICE",
            financial_year="2026-27",
            financial_year_ref=fy,
            prefix="DSINV-TEST",
            pattern="DSINV-TEST/{number}",
            next_number=1,
        )
        sale = create_direct_sale(
            payload={
                "sale_date": date.today(),
                "customer": self.customer,
                "tax_mode": "NON_GST",
                "accessories_configured": True,
                "lines": [
                    {
                        "product": self.bed_product,
                        "inventory_item": self.bed_inv,
                        "description": "Bahubali King Bed",
                        "quantity": Decimal("1.000"),
                        "unit_price": Decimal("15000.00"),
                        "taxable_value": Decimal("15000.00"),
                        "line_total": Decimal("15000.00"),
                        "is_accessory": False,
                    },
                    {
                        "product": rail_hybrid_prod,
                        "inventory_item": rail_hybrid_inv,
                        "description": "Side Rail (Hybrid)",
                        "quantity": Decimal("2.000"),
                        "unit_price": Decimal("2000.00"),
                        "taxable_value": Decimal("4000.00"),
                        "line_total": Decimal("4000.00"),
                        "is_accessory": True,
                        "parent_line_index": 0,
                    },
                ],
            },
            created_by=admin_user,
        )
        invoice = sale.billing_invoices.first()
        invoice.status = BillingDocumentStatus.APPROVED
        invoice.save(update_fields=["status"])
        post_invoice_stock_movements(invoice=invoice, posted_by=admin_user)

        # Bed: 5 - 1 = 4; Hybrid Rail: 8 - 2 = 6 (NOT double deducted); Normal Rail: 10 (untouched); Plyboard: 10 (untouched since explicit selection)
        self.assertEqual(self.bed_inv.current_stock_quantity(), Decimal("4.000"))
        self.assertEqual(rail_hybrid_inv.current_stock_quantity(), Decimal("6.000"))
        self.assertEqual(rail_normal_inv.current_stock_quantity(), Decimal("10.000"))
        self.assertEqual(self.ply_inv.current_stock_quantity(), Decimal("10.000"))

    def test_rent_contract_with_free_and_chargeable_accessory_items_and_delivery_bridge(self):
        """Rent/Lease contracts allow ACCESSORY items when is_accessory=True and bridge deducts only chosen accessories."""
        from django.contrib.auth import get_user_model
        from contracts.services.rent_lease_contract_service import create_rent_contract
        from deliveries.services.delivery_service import create_subscription_delivery
        from api.v1.serializers.contracts import AdminRentContractCreateSerializer

        User = get_user_model()
        admin_user = User.objects.create_superuser("admin_rent_acc", "rentacc@test.com", "pass123", phone="9999966666")

        self.bed_product.is_rent_enabled = True
        self.bed_product.save(update_fields=["is_rent_enabled"])

        extra_acc_prod = create_product(name="Headboard Cushion", product_code="CUSH-01", base_price=Decimal("2000.00"), published=True)
        extra_acc_inv = InventoryItem.objects.create(
            product=extra_acc_prod, sku="CUSH-01", stock_item_type=InventoryItemType.ACCESSORY,
            default_stock_location=self.location, stock_tracking_enabled=True, delivery_stock_bridge_enabled=True,
            opening_stock_qty=Decimal("6.000"),
        )
        # Ensure accessories have is_rent_enabled=False and is_emi_enabled=False (typical accessory master)
        self.ply_product.is_rent_enabled = False
        self.ply_product.is_emi_enabled = False
        self.ply_product.save(update_fields=["is_rent_enabled", "is_emi_enabled"])
        extra_acc_prod.is_rent_enabled = False
        extra_acc_prod.is_emi_enabled = False
        extra_acc_prod.save(update_fields=["is_rent_enabled", "is_emi_enabled"])

        # Validate serializer allows ACCESSORY when is_accessory=True
        ser = AdminRentContractCreateSerializer(data={
            "customer": self.customer.id,
            "product": self.bed_product.id,
            "tenure_months": 6,
            "security_deposit_percent": "20.00",
            "monthly_yield_percent": "5.00",
            "items": [
                {"product": self.bed_product.id, "quantity": 1, "unit_base_price": "15000.00", "is_accessory": False},
                {"product": extra_acc_prod.id, "quantity": 1, "unit_base_price": "2000.00", "is_accessory": True, "parent_item_index": 0, "charge_mode": "CHARGEABLE"},
            ],
        })
        self.assertTrue(ser.is_valid(), ser.errors)

        sub = create_rent_contract(
            customer=self.customer,
            items=ser.validated_data["items"],
            tenure_months=6,
            security_deposit_percent=Decimal("20.00"),
            monthly_yield_percent=Decimal("5.00"),
            performed_by=admin_user,
        )
        # Base = 15000 + 2000 = 17000; Monthly = 5% of 17000 = 850.00
        self.assertEqual(sub.monthly_amount, Decimal("850.00"))
        self.assertEqual(sub.contract_items.filter(is_accessory=True).count(), 1)
        acc_ci = sub.contract_items.get(is_accessory=True)
        self.assertEqual(acc_ci.parent_item.product_id, self.bed_product.id)

        delivery = SubscriptionDelivery.objects.create(
            subscription=sub,
            delivery_reference="DEL-RENT-ACC-1",
            batch_number=1,
            status=DeliveryStatus.DELIVERED,
            delivered_at=timezone.now(),
        )
        from deliveries.models import SubscriptionDeliveryItem
        SubscriptionDeliveryItem.objects.create(delivery=delivery, product=self.bed_product, quantity=1, is_accessory=False)
        SubscriptionDeliveryItem.objects.create(delivery=delivery, product=extra_acc_prod, quantity=1, is_accessory=True, parent_product=self.bed_product)

        sync_delivery_inventory_bridge(delivery=delivery, performed_by=admin_user)
        # Only Bed (5->4) and Cushion (6->5) deducted; Plyboard (10) NOT deducted because explicit accessory was chosen
        self.assertEqual(self.bed_inv.current_stock_quantity(), Decimal("4.000"))
        self.assertEqual(extra_acc_inv.current_stock_quantity(), Decimal("5.000"))
        self.assertEqual(self.ply_inv.current_stock_quantity(), Decimal("10.000"))

    def test_costing_summary_and_stock_ledger_profit_margin_visibility(self):
        """Costing summary includes base cost + included accessories cost, selling price, net profit, and % margin across PIM & Stock Ledger."""
        from django.contrib.auth import get_user_model
        from inventory.models import StockLedger, StockMovementType
        from inventory.services.valuation_service import compute_product_costing_summary
        from inventory.services.stock_ledger_service import build_stock_ledger_list
        from inventory.services.stock_service import build_stock_ledger
        from api.v1.serializers.inventory import StockLedgerSerializer
        from products_pim.models import ProductCategory, PimProduct
        from products_pim.serializers import PimProductDetailSerializer

        User = get_user_model()
        admin_user = User.objects.create_superuser("admin_costing", "costing@test.com", "pass123", phone="9999955555")

        # Configure bed cost 6400 + selling 15000, and included plyboard qty 2 * 1033 = 2066 -> total cost 8466, net 6534, margin 43.56%
        self.bed_inv.purchase_unit_cost = Decimal("6400.00")
        self.bed_inv.save(update_fields=["purchase_unit_cost"])
        self.ply_inv.purchase_unit_cost = Decimal("1033.00")
        self.ply_inv.save(update_fields=["purchase_unit_cost"])

        fg_cat, _ = ProductCategory.objects.get_or_create(slug="furniture", defaults={"name": "Furniture", "product_type": "FINISHED_GOOD"})
        pim_bed, _ = PimProduct.objects.get_or_create(
            code=self.bed_product.product_code,
            defaults={
                "name": self.bed_product.name,
                "category": fg_cat,
                "source_product": self.bed_product,
                "base_price": Decimal("15000.00"),
                "cost_price": Decimal("6400.00"),
                "product_type": "FINISHED_GOOD",
            },
        )

        # Direct helper assertion
        summary = compute_product_costing_summary(inventory_item=self.bed_inv)
        self.assertEqual(summary["product_cost"], "6400.00")
        self.assertEqual(summary["accessories_cost"], "2066.00")
        self.assertEqual(summary["total_cost"], "8466.00")
        self.assertEqual(summary["selling_price"], "15000.00")
        self.assertEqual(summary["net_profit"], "6534.00")
        self.assertEqual(summary["profit_margin_percent"], "43.56")
        self.assertEqual(summary["accessories_count"], 1)

        # PIM Detail Serializer includes costing_summary
        pim_data = PimProductDetailSerializer(pim_bed).data
        self.assertEqual(pim_data["costing_summary"]["total_cost"], "8466.00")
        self.assertEqual(pim_data["costing_summary"]["profit_margin_percent"], "43.56")

        # Create StockLedger entry and verify both ledger builders & serializer expose costing & margin
        ledger_entry = StockLedger.objects.create(
            inventory_item=self.bed_inv,
            movement_type=StockMovementType.PURCHASE_IN,
            quantity_in=Decimal("2.000"),
            quantity_out=Decimal("0.000"),
            movement_date=timezone.localdate(),
            stock_location=self.location,
            reference_model="TestCostRef",
            reference_id="COST-1",
            posted_by=admin_user,
        )

        list_payload = build_stock_ledger_list(inventory_item_id=str(self.bed_inv.id))
        self.assertEqual(list_payload["count"], 1)
        row = list_payload["results"][0]
        self.assertEqual(row["product_cost"], "6400.00")
        self.assertEqual(row["accessories_cost"], "2066.00")
        self.assertEqual(row["total_cost"], "8466.00")
        self.assertEqual(row["selling_price"], "15000.00")
        self.assertEqual(row["net_profit"], "6534.00")
        self.assertEqual(row["profit_margin_percent"], "43.56")
        self.assertEqual(row["movement_total_cost"], "16932.00")
        self.assertEqual(row["movement_selling_value"], "30000.00")
        self.assertEqual(row["movement_net_profit"], "13068.00")

        svc_payload = build_stock_ledger(item_id=self.bed_inv.id)
        self.assertEqual(svc_payload["results"][0]["total_cost"], "8466.00")
        self.assertEqual(svc_payload["results"][0]["profit_margin_percent"], "43.56")

        ser_data = StockLedgerSerializer(ledger_entry).data
        self.assertEqual(ser_data["costing_summary"]["net_profit"], "6534.00")

    def test_sfemi_variant_and_accessory_bundle_lifecycle(self):
        """
        SFEMI (EMI) subscription supports selecting a variant + accessory variants
        while preserving ContractItem strict isolation, recalculating EMI schedule,
        scoping PurchaseNeed demand, and deducting/restoring stock for only chosen accessories.
        """
        from api.v1.serializers.admin_resources import SubscriptionAdminSerializer
        from api.v1.serializers.subscription import BaseSubscriptionSerializer
        from contracts.services.contract_lifecycle_service import modify_pre_activation_contract
        from deliveries.services.delivery_service import create_subscription_delivery
        from inventory.models import PurchaseNeed
        from subscriptions.models import SubscriptionStatus
        from tests.helpers import create_admin_user

        admin_user = create_admin_user(username="sfemi_bundle_admin", phone="9000008811")

        # Create extra chargeable accessory variant AND an unchosen alternative accessory
        hybrid_rail = create_product(
            name="Hybrid Side Rail",
            product_code="ACC-HYB-RAIL",
            base_price=Decimal("2000.00"),
            published=True,
        )
        InventoryItem.objects.create(
            product=hybrid_rail,
            sku="ACC-HYB-RAIL",
            stock_item_type=InventoryItemType.ACCESSORY,
            default_stock_location=self.location,
            stock_tracking_enabled=True,
            delivery_stock_bridge_enabled=True,
            opening_stock_qty=Decimal("8.000"),
            purchase_unit_cost=Decimal("1200.00"),
        )
        steel_rail = create_product(
            name="Steel Side Rail (Normal)",
            product_code="ACC-STEEL-RAIL",
            base_price=Decimal("1200.00"),
            published=True,
        )
        InventoryItem.objects.create(
            product=steel_rail,
            sku="ACC-STEEL-RAIL",
            stock_item_type=InventoryItemType.ACCESSORY,
            default_stock_location=self.location,
            stock_tracking_enabled=True,
            delivery_stock_bridge_enabled=True,
            opening_stock_qty=Decimal("8.000"),
        )
        # Attach steel_rail as another ProductRelationship on bed_product — should NOT be deducted when configured!
        ProductRelationship.objects.create(
            product=self.bed_product,
            related_product=steel_rail,
            relationship_type=ProductRelationshipType.ACCESSORY,
            quantity=Decimal("1.00"),
            is_price_included_in_parent=True,
        )

        # Ensure batch/lucky slots exist
        batch = create_batch(batch_code="B-SFEMI-BUNDLE", duration_months=10)
        lucky = create_lucky_id(batch=batch, lucky_number=1)

        # 1. Create EMI subscription with 1 chargeable + 1 included accessory (leaving steel_rail unchosen)
        serializer = SubscriptionAdminSerializer(
            data={
                "customer": self.customer.id,
                "product": self.bed_product.id,
                "plan_type": PlanType.EMI,
                "tenure_months": 10,
                "start_date": "2026-05-01",
                "batch": batch.id,
                "lucky_id": lucky.id,
                "accessories_configured": True,
                "accessories": [
                    {
                        "product_id": hybrid_rail.id,
                        "quantity": 1,
                        "unit_base_price": "2000.00",
                        "charge_mode": "CHARGEABLE",
                    },
                    {
                        "product_id": self.ply_product.id,
                        "quantity": 2,
                        "unit_base_price": "0.00",
                        "charge_mode": "FREE",
                    },
                ],
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        sub = serializer.save()

        # Total = 15000 (bed) + 2000 (hybrid rail) + 0 (2x ply) = 17000
        self.assertEqual(sub.total_amount, Decimal("17000.00"))
        self.assertEqual(sub.monthly_amount, Decimal("1700.00"))
        self.assertEqual(sub.emis.count(), 10)
        self.assertEqual(sum(e.amount for e in sub.emis.all()), Decimal("17000.00"))
        self.assertEqual(sub.contract_items.count(), 0)

        # Serialization exposes selected_accessories & bundle flags, while keeping contract_items empty
        admin_data = SubscriptionAdminSerializer(sub).data
        base_data = BaseSubscriptionSerializer(sub).data
        self.assertEqual(admin_data["contract_items"], [])
        self.assertEqual(len(admin_data["selected_accessories"]), 2)
        self.assertTrue(admin_data["is_bundle"])
        self.assertEqual(admin_data["bundle_items_count"], 3)
        self.assertEqual(len(base_data["selected_accessories"]), 2)
        self.assertTrue(base_data["is_bundle"])
        self.assertEqual(base_data["bundle_items_count"], 3)

        # PurchaseNeed is NOT created for unchosen steel_rail even if out of stock
        steel_inv = InventoryItem.objects.get(product=steel_rail)
        steel_inv.opening_stock_qty = Decimal("0.000")
        steel_inv.save(update_fields=["opening_stock_qty"])

        shortage_acc = create_product(
            name="Shortage Chosen Accessory",
            product_code="ACC-SHORTAGE",
            base_price=Decimal("500.00"),
            published=True,
        )
        InventoryItem.objects.create(
            product=shortage_acc,
            sku="ACC-SHORTAGE",
            stock_item_type=InventoryItemType.ACCESSORY,
            default_stock_location=self.location,
            stock_tracking_enabled=True,
            opening_stock_qty=Decimal("0.000"),
        )
        lucky_2 = create_lucky_id(batch=batch, lucky_number=2)
        ser_short = SubscriptionAdminSerializer(
            data={
                "customer": self.customer.id,
                "product": self.bed_product.id,
                "plan_type": PlanType.EMI,
                "tenure_months": 10,
                "start_date": "2026-05-01",
                "batch": batch.id,
                "lucky_id": lucky_2.id,
                "accessories_configured": True,
                "accessories": [
                    {
                        "product_id": shortage_acc.id,
                        "quantity": 1,
                        "unit_base_price": "500.00",
                        "charge_mode": "CHARGEABLE",
                    },
                ],
            }
        )
        self.assertTrue(ser_short.is_valid(), ser_short.errors)
        sub_short = ser_short.save()
        demand_pids = set(
            PurchaseNeed.objects.filter(
                source_module=PurchaseNeed.SourceModule.SUBSCRIPTION_DEMAND,
                source_object_id=str(sub_short.id),
            ).values_list("product_id", flat=True)
        )
        self.assertIn(shortage_acc.id, demand_pids)
        self.assertNotIn(steel_rail.id, demand_pids)

        # 2. Modify bundle pre-activation via modify_pre_activation_contract (hybrid_rail qty -> 2 -> total 19000)
        sub.status = SubscriptionStatus.DRAFT
        sub.save(update_fields=["status"])
        modify_pre_activation_contract(
            subscription=sub,
            performed_by=admin_user,
            data={
                "accessories_configured": True,
                "accessories": [
                    {
                        "product_id": hybrid_rail.id,
                        "quantity": 2,
                        "unit_base_price": "2000.00",
                        "charge_mode": "CHARGEABLE",
                    },
                    {
                        "product_id": self.ply_product.id,
                        "quantity": 1,
                        "unit_base_price": "0.00",
                        "charge_mode": "FREE",
                    },
                ],
            },
        )
        sub.status = SubscriptionStatus.ACTIVE
        sub.save(update_fields=["status"])
        sub.refresh_from_db()
        self.assertEqual(sub.total_amount, Decimal("19000.00"))
        self.assertEqual(sub.monthly_amount, Decimal("1900.00"))
        self.assertEqual(sum(e.amount for e in sub.emis.all()), Decimal("19000.00"))

        # 3. Create Delivery & sync inventory bridge -> deducts bed(1), hybrid_rail(2), ply(1), NOT steel_rail!
        delivery = create_subscription_delivery(
            subscription=sub,
            performed_by=admin_user,
            admin_override=True,
            admin_override_reason="SFEMI bundle delivery test",
        )
        d_items = {di.product_id: di for di in delivery.delivery_items.all()}
        self.assertEqual(set(d_items.keys()), {self.bed_product.id, hybrid_rail.id, self.ply_product.id})
        self.assertEqual(d_items[hybrid_rail.id].quantity, 2)
        self.assertTrue(d_items[hybrid_rail.id].is_accessory)
        self.assertEqual(d_items[hybrid_rail.id].parent_product_id, self.bed_product.id)

        delivery.status = DeliveryStatus.DELIVERED
        delivery.delivered_at = timezone.now()
        delivery.save(update_fields=["status", "delivered_at"])
        sync_delivery_inventory_bridge(delivery=delivery, performed_by=admin_user)

        bed_out = StockLedger.objects.filter(
            inventory_item=self.bed_inv, movement_type=StockMovementType.EMI_DELIVERY_OUT
        )
        hyb_out = StockLedger.objects.filter(
            inventory_item__product=hybrid_rail, movement_type=StockMovementType.EMI_DELIVERY_OUT
        )
        ply_out = StockLedger.objects.filter(
            inventory_item=self.ply_inv, movement_type=StockMovementType.EMI_DELIVERY_OUT
        )
        steel_out = StockLedger.objects.filter(
            inventory_item__product=steel_rail, movement_type=StockMovementType.EMI_DELIVERY_OUT
        )
        self.assertEqual(bed_out.count(), 1)
        self.assertEqual(hyb_out.get().quantity_out, Decimal("2.000"))
        self.assertEqual(ply_out.get().quantity_out, Decimal("1.000"))
        self.assertFalse(steel_out.exists())

        # Return reverses exact quantities
        delivery.status = DeliveryStatus.RETURNED
        delivery.returned_at = timezone.now()
        delivery.save(update_fields=["status", "returned_at"])
        sync_delivery_inventory_bridge(delivery=delivery, performed_by=admin_user)
        hyb_in = StockLedger.objects.filter(
            inventory_item__product=hybrid_rail, movement_type=StockMovementType.EMI_RETURN_IN
        )
        self.assertEqual(hyb_in.get().quantity_in, Decimal("2.000"))

    def test_quick_create_accessory_individual_sale_and_contract_guards(self):
        """
        1. Quick-create accessory creates an ACCESSORY product enabled for Direct Sale only.
        2. Direct Sale search shows FinishedGoodAccessoryLink items and allows individual accessory sales.
        3. SFEMI / RENT / LEASE reject standalone ACCESSORY and RAW_MATERIAL products.
        4. SFEMI and RENT/LEASE accept Finished Goods with Free/Chargeable accessories + services.
        """
        from django.contrib.auth import get_user_model
        from django.core.exceptions import ValidationError as DjangoValidationError
        from rest_framework.test import APIRequestFactory, force_authenticate

        from api.v1.serializers.admin_resources import SubscriptionAdminSerializer
        from api.v1.serializers.contracts import AdminRentContractCreateSerializer
        from api.v1.views.direct_sale_workspace import AdminBillingProductSearchView
        from api.v1.views.inventory_fg import FGQuickCreateAccessoryView
        from contracts.services.rent_lease_contract_service import create_rent_contract
        from contracts.services.subscription_service import create_emi_subscription
        from inventory.models import ServiceCatalogItem, ServiceCatalogItemStatus, ServiceType
        from lucky_plan.models import Batch, LuckyId, LuckyIdStatus
        from subscriptions.models import ProductItemType

        User = get_user_model()
        admin_user = User.objects.create_superuser("admin_acc_guard", "guard@test.com", "pass123", phone="9999966666")
        factory = APIRequestFactory()

        # 1. Quick-create & link accessory on bed_inv -> sets item_type=ACCESSORY, direct sale enabled, EMI/RENT/LEASE disabled
        req = factory.post(
            f"/api/v1/admin/inventory/finished-goods/{self.bed_inv.id}/quick-create-accessory/",
            {
                "name": "Quick Foam Cushion",
                "product_code": "ACC-QFC-01",
                "base_price": "1200.00",
                "charge_mode": "CHARGEABLE",
                "sale_price": "950.00",
                "quantity": "2.000",
            },
            format="json",
        )
        force_authenticate(req, user=admin_user)
        resp = FGQuickCreateAccessoryView.as_view()(req, pk=self.bed_inv.id)
        self.assertEqual(resp.status_code, 201, resp.data)
        acc_prod = Product.objects.get(product_code="ACC-QFC-01")
        self.assertEqual(acc_prod.item_type, ProductItemType.ACCESSORY)
        self.assertTrue(acc_prod.is_direct_sale_enabled)
        self.assertFalse(acc_prod.is_emi_enabled)
        self.assertFalse(acc_prod.is_rent_enabled)
        self.assertFalse(acc_prod.is_lease_enabled)

        # 2. Direct Sale product search merges FinishedGoodAccessoryLink on bed_product
        search_req = factory.get(f"/api/v1/admin/billing/products/search/?q={self.bed_product.product_code}&include_inventory=1")
        force_authenticate(search_req, user=admin_user)
        search_resp = AdminBillingProductSearchView.as_view()(search_req)
        self.assertEqual(search_resp.status_code, 200)
        bed_row = next((r for r in search_resp.data["results"] if r["id"] == self.bed_product.id), None)
        self.assertIsNotNone(bed_row)
        self.assertTrue(any(a["product_code"] == "ACC-QFC-01" for a in bed_row["accessories"]))

        # Raw material product
        raw_prod = create_product(name="Teak Timber", product_code="RAW-TEAK-01", base_price=Decimal("400.00"), published=True)
        Product.objects.filter(pk=raw_prod.pk).update(
            item_type=ProductItemType.RAW_MATERIAL,
            is_emi_enabled=False,
            is_rent_enabled=False,
            is_lease_enabled=False,
        )
        raw_prod.refresh_from_db()
        InventoryItem.objects.create(
            product=raw_prod,
            sku="RAW-TEAK-01",
            stock_item_type=InventoryItemType.RAW_MATERIAL,
            default_stock_location=self.location,
            opening_stock_qty=Decimal("10.000"),
        )

        # 3. Standalone accessory and raw material must be blocked in SFEMI, RENT, and LEASE
        from tests.helpers import create_batch
        batch = create_batch(
            batch_code="B-GUARD-01",
            duration_months=6,
        )
        lucky = batch.lucky_ids.filter(status=LuckyIdStatus.AVAILABLE).order_by("lucky_number").first()

        with self.assertRaises(DjangoValidationError):
            create_emi_subscription(
                customer=self.customer,
                product=acc_prod,
                batch=batch,
                lucky_number=1,
                tenure_months=6,
                performed_by=admin_user,
            )
        with self.assertRaises(DjangoValidationError):
            create_emi_subscription(
                customer=self.customer,
                product=raw_prod,
                batch=batch,
                lucky_number=1,
                tenure_months=6,
                performed_by=admin_user,
            )

        emi_ser = SubscriptionAdminSerializer(
            data={
                "customer": self.customer.id,
                "product": acc_prod.id,
                "plan_type": "EMI",
                "tenure_months": 6,
                "start_date": date.today().isoformat(),
                "batch": batch.id,
                "lucky_id": lucky.id,
            }
        )
        self.assertFalse(emi_ser.is_valid())

        with self.assertRaises(DjangoValidationError):
            create_rent_contract(
                customer=self.customer,
                product=acc_prod,
                tenure_months=6,
                security_deposit_percent=Decimal("20.00"),
                performed_by=admin_user,
                save_as_draft=True,
            )

        rent_ser = AdminRentContractCreateSerializer(
            data={
                "customer": self.customer.id,
                "items": [{"product": acc_prod.id, "quantity": 1, "is_accessory": False}],
                "tenure_months": 6,
                "security_deposit_percent": "20.00",
                "save_as_draft": True,
            }
        )
        self.assertFalse(rent_ser.is_valid())

        # 4. SFEMI and RENT accept Finished Good + Free/Chargeable accessories + Services
        svc = ServiceCatalogItem.objects.create(
            code="SVC-INST-99",
            name="Bed Assembly & Installation",
            service_type=ServiceType.INSTALLATION,
            standard_price=Decimal("500.00"),
            status=ServiceCatalogItemStatus.ACTIVE,
        )
        self.bed_product.is_emi_enabled = True
        self.bed_product.is_rent_enabled = True
        self.bed_product.save(update_fields=["is_emi_enabled", "is_rent_enabled"])

        emi_bundle_ser = SubscriptionAdminSerializer(
            data={
                "customer": self.customer.id,
                "product": self.bed_product.id,
                "plan_type": "EMI",
                "tenure_months": 6,
                "start_date": date.today().isoformat(),
                "batch": batch.id,
                "lucky_id": lucky.id,
                "accessories_configured": True,
                "accessories": [
                    {
                        "product_id": acc_prod.id,
                        "quantity": 1,
                        "unit_base_price": "950.00",
                        "charge_mode": "CHARGEABLE",
                    },
                    {
                        "product_id": self.ply_product.id,
                        "quantity": 1,
                        "unit_base_price": "0.00",
                        "charge_mode": "FREE",
                    },
                ],
                "services": [
                    {
                        "service_id": svc.id,
                        "charge_mode": "CHARGEABLE",
                        "sale_price": "500.00",
                    }
                ],
            }
        )
        self.assertTrue(emi_bundle_ser.is_valid(), emi_bundle_ser.errors)
        emi_sub = emi_bundle_ser.save()
        # 15000 (bed) + 950 (chargeable acc) + 0 (free acc) + 500 (service) = 16450
        self.assertEqual(emi_sub.total_amount, Decimal("16450.00"))
        self.assertEqual(len(emi_sub.product_snapshot.get("selected_services", [])), 1)
        self.assertEqual(emi_sub.pricing_snapshot.get("services_total"), "500.00")

        rent_sub = create_rent_contract(
            customer=self.customer,
            items=[
                {"product": self.bed_product, "quantity": 1, "is_accessory": False},
                {"product": acc_prod, "quantity": 1, "is_accessory": True, "charge_mode": "FREE"},
                {"product": self.ply_product, "quantity": 1, "is_accessory": True, "charge_mode": "CHARGEABLE", "unit_base_price": Decimal("300.00")},
            ],
            services=[{"service_id": svc.id, "charge_mode": "CHARGEABLE", "sale_price": "500.00"}],
            tenure_months=6,
            security_deposit_percent=Decimal("20.00"),
            performed_by=admin_user,
            save_as_draft=True,
        )
        self.assertEqual(len(rent_sub.product_snapshot.get("selected_services", [])), 1)
        self.assertEqual(rent_sub.pricing_snapshot.get("services_total"), "500.00")

        # 5. Direct Sale billing accessory options expose service_product_id and Direct Sale accepts attached SERVICE lines
        from accounting.services.document_sequence_service import DocumentType
        from api.v1.views.admin_inventory_quick_create import AdminBillingAccessoryOptionsView
        from api.v1.views.inventory_fg import FGServiceLinkView
        from billing.services.billing_service import create_direct_sale
        from inventory.models import PurchaseNeed
        from tests.helpers import (
            ensure_document_numbering_profile_for_date,
            ensure_test_accounting_posting_prerequisites,
        )

        ensure_test_accounting_posting_prerequisites(performed_by=admin_user)
        ensure_document_numbering_profile_for_date(DocumentType.DIRECT_SALE, date.today(), performed_by=admin_user)
        ensure_document_numbering_profile_for_date(DocumentType.TAX_INVOICE, date.today(), performed_by=admin_user)

        svc_link_req = factory.post(
            f"/api/v1/admin/inventory/finished-goods/{self.bed_inv.id}/services/",
            {"service": svc.id, "charge_mode": "CHARGEABLE", "sale_price": "500.00"},
            format="json",
        )
        force_authenticate(svc_link_req, user=admin_user)
        svc_link_res = FGServiceLinkView.as_view()(svc_link_req, pk=self.bed_inv.id)
        self.assertEqual(svc_link_res.status_code, 201, svc_link_res.data)

        opt_req = factory.get(
            f"/api/v1/admin/inventory/products/{self.bed_product.id}/accessory-options/?item_id={self.bed_inv.id}"
        )
        force_authenticate(opt_req, user=admin_user)
        opt_res = AdminBillingAccessoryOptionsView.as_view()(opt_req, product_id=self.bed_product.id)
        self.assertEqual(opt_res.status_code, 200, opt_res.data)
        svc_opts = opt_res.data.get("service_options", [])
        self.assertEqual(len(svc_opts), 1)
        service_prod_id = svc_opts[0].get("service_product_id")
        self.assertIsNotNone(service_prod_id)
        service_prod = Product.objects.get(pk=service_prod_id)
        self.assertEqual(service_prod.item_type, "SERVICE")

        sale = create_direct_sale(
            payload={
                "sale_date": date.today(),
                "customer": self.customer,
                "tax_mode": "NON_GST",
                "accessories_configured": True,
                "lines": [
                    {
                        "product": self.bed_product,
                        "inventory_item": self.bed_inv,
                        "description": self.bed_product.name,
                        "quantity": Decimal("1.000"),
                        "unit_price": Decimal("15000.00"),
                    },
                    {
                        "product": service_prod,
                        "inventory_item": None,
                        "description": svc.name,
                        "quantity": Decimal("1.000"),
                        "unit_price": Decimal("500.00"),
                        "is_accessory": False,
                        "parent_line_index": 0,
                    },
                ],
            },
            created_by=admin_user,
        )
        self.assertEqual(sale.lines.count(), 2)
        self.assertEqual(sale.grand_total, Decimal("15500.00"))
        self.assertFalse(PurchaseNeed.objects.filter(product=service_prod).exists())
