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
