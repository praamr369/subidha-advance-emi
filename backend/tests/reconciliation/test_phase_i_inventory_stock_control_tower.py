from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    DocumentSequence,
    JournalEntry,
    JournalEntryStatus,
    JournalEntryType,
)
from billing.models import (
    BillingDocumentStatus,
    BillingInvoice,
    BillingInvoiceLine,
    DirectSale,
    DirectSaleReturn,
    DirectSaleReturnLine,
    DirectSaleReturnStatus,
)
from branch_control.models import Branch
from inventory.models import (
    InventoryItem,
    InventoryItemType,
    StockLedger,
    StockLocation,
    StockMovementType,
)
from manufacturing.models import (
    ProductionJob,
    ProductionJobStatus,
    ProductionMaterialEntryKind,
    ProductionMaterialIssueLine,
    ProductionReceiptLine,
)
from tests.helpers import create_admin_user, create_customer_profile, create_customer_user, create_product


class AdminReconciliationControlTowerPhaseIInventoryStockTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="admin_phase_i", phone="9011000301")
        self.branch = Branch.objects.order_by("id").first()
        user = create_customer_user(username="phase_i_customer", phone="9011000302")
        self.customer = create_customer_profile(user=user, name="PhaseI Customer", phone="9011000302")

        self.sequence = DocumentSequence.objects.create(
            series_code="PHI-SEQ",
            financial_year="2026-27",
            prefix="PHI-2026-27",
            next_number=1,
        )
        self.stock_location = StockLocation.objects.create(
            code="PHI-LOC-001",
            name="Phase I Store",
            branch=self.branch,
            location_type="STORE",
            is_active=True,
        )

    def _run_control_tower(self, *, date_from: str, date_to: str):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/admin/reconciliation/runs/",
            data={"date_from": date_from, "date_to": date_to, "branch_id": self.branch.id if self.branch else None},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        run_id = resp.data["id"]
        items_resp = self.client.get(f"/api/v1/admin/reconciliation/items/?run={run_id}")
        self.assertEqual(items_resp.status_code, status.HTTP_200_OK)
        return run_id, items_resp.data.get("results", [])

    def _make_stock_tracked_item(self, *, product_code: str, name: str, item_type: str = InventoryItemType.FINISHED_GOOD):
        product = create_product(name=name, product_code=product_code, base_price=Decimal("1000.00"))
        item = InventoryItem.objects.create(
            product=product,
            stock_tracking_enabled=True,
            stock_item_type=item_type,
            opening_stock_qty=Decimal("0.000"),
            default_stock_location=self.stock_location,
            stock_tracking_status="STOCK_ACTIVE",
            is_active=True,
        )
        return product, item

    def _make_direct_sale(self) -> DirectSale:
        return DirectSale.objects.create(
            sale_no="PHI-SALE-001",
            sale_date=date(2026, 4, 15),
            financial_year="2026-27",
            doc_series=self.sequence,
            customer=self.customer,
            branch=self.branch,
            status="INVOICED",
            tax_mode="NON_GST",
            tax_calculation_mode="NON_GST",
            customer_gst_type="UNREGISTERED_CONSUMER",
            subtotal=Decimal("1000.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("1000.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("1000.00"),
            received_total=Decimal("0.00"),
            balance_total=Decimal("1000.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )

    def _make_posted_invoice(self, *, direct_sale: DirectSale) -> BillingInvoice:
        inv = BillingInvoice.objects.create(
            document_no="PHI-INV-001",
            invoice_date=date(2026, 4, 15),
            financial_year="2026-27",
            doc_series=self.sequence,
            customer=self.customer,
            direct_sale=direct_sale,
            branch=self.branch,
            billing_channel="RETAIL",
            tax_mode="NON_GST",
            status=BillingDocumentStatus.DRAFT,
            subtotal=Decimal("1000.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("1000.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("1000.00"),
            received_total=Decimal("0.00"),
            balance_total=Decimal("1000.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        journal = JournalEntry.objects.create(
            entry_date=inv.invoice_date,
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Phase I invoice posting",
            source_model="BillingInvoice",
            source_id=str(inv.id),
            voucher_type="BILLING_INVOICE",
        )
        BillingInvoice.objects.filter(pk=inv.id).update(
            posted_journal_entry=journal,
            status=BillingDocumentStatus.POSTED,
        )
        return BillingInvoice.objects.get(pk=inv.id)

    def test_allowlisted_posted_invoice_missing_stock_deduction_creates_item(self):
        _, item = self._make_stock_tracked_item(product_code="PHI-P-001", name="Phase I Item")
        sale = self._make_direct_sale()
        inv = self._make_posted_invoice(direct_sale=sale)
        BillingInvoiceLine.objects.create(
            invoice=inv,
            product=item.product,
            inventory_item=item,
            description="Item line",
            quantity=Decimal("1.000"),
            unit_price=Decimal("1000.00"),
            discount_amount=Decimal("0.00"),
            taxable_value=Decimal("1000.00"),
            cgst_amount=Decimal("0.00"),
            sgst_amount=Decimal("0.00"),
            igst_amount=Decimal("0.00"),
            line_total=Decimal("1000.00"),
        )

        _, results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("BILLING_INVOICE_STOCK_DEDUCTION_MISSING", exception_codes)

    def test_non_allowlisted_stock_reference_does_not_satisfy_invoice_check(self):
        _, item = self._make_stock_tracked_item(product_code="PHI-P-002", name="Phase I Item 2")
        sale = self._make_direct_sale()
        inv = self._make_posted_invoice(direct_sale=sale)
        inv_line = BillingInvoiceLine.objects.create(
            invoice=inv,
            product=item.product,
            inventory_item=item,
            description="Item line 2",
            quantity=Decimal("1.000"),
            unit_price=Decimal("1000.00"),
            discount_amount=Decimal("0.00"),
            taxable_value=Decimal("1000.00"),
            cgst_amount=Decimal("0.00"),
            sgst_amount=Decimal("0.00"),
            igst_amount=Decimal("0.00"),
            line_total=Decimal("1000.00"),
        )

        # Create a SALE_OUT StockLedger row with a non-allowlisted reference_model (legacy/ambiguous),
        # which Phase I must NOT treat as satisfying the invoice-line linkage requirement.
        StockLedger.objects.create(
            inventory_item=item,
            movement_type=StockMovementType.SALE_OUT,
            quantity_in=Decimal("0.000"),
            quantity_out=Decimal("1.000"),
            movement_date=inv.invoice_date,
            stock_location=self.stock_location,
            reference_model="DirectSaleLine",
            reference_id=str(inv_line.id),
            notes="legacy ref",
        )

        _, results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("BILLING_INVOICE_STOCK_DEDUCTION_MISSING", exception_codes)
        self.assertNotIn("STOCK_LEDGER_REFERENCE_FORMAT_INVALID", exception_codes)

    def test_allowlisted_posted_return_missing_stock_restoration_creates_item(self):
        _, item = self._make_stock_tracked_item(product_code="PHI-P-003", name="Phase I Item 3")
        sale = self._make_direct_sale()
        inv = self._make_posted_invoice(direct_sale=sale)
        sale_line = sale.lines.create(
            product=item.product,
            inventory_item=item,
            description="Sale line",
            quantity=Decimal("1.000"),
            unit_price=Decimal("1000.00"),
            discount_amount=Decimal("0.00"),
            taxable_value=Decimal("1000.00"),
            cgst_amount=Decimal("0.00"),
            sgst_amount=Decimal("0.00"),
            igst_amount=Decimal("0.00"),
            line_total=Decimal("1000.00"),
        )
        ret = DirectSaleReturn.objects.create(
            return_no="PHI-RET-001",
            direct_sale=sale,
            original_invoice=inv,
            customer=self.customer,
            status=DirectSaleReturnStatus.POSTED,
            return_kind="DELIVERED_RETURN",
            stock_destination="SELLABLE",
            stock_location=self.stock_location,
            reason="Return test",
            subtotal=Decimal("100.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("100.00"),
            stock_effect=True,
            metadata={"financial_mode": "NO_ACTIVE_CUSTOMER_VALUE"},
            posted_by=self.admin,
            posted_at=timezone.make_aware(datetime(2026, 4, 16, 10, 0, 0)),
        )
        DirectSaleReturnLine.objects.create(
            direct_sale_return=ret,
            direct_sale_line=sale_line,
            inventory_item=item,
            description="Return line",
            quantity=Decimal("1.000"),
            unit_price=Decimal("1000.00"),
            taxable_value=Decimal("1000.00"),
            tax_amount=Decimal("0.00"),
            line_total=Decimal("1000.00"),
        )

        _, results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("DIRECT_SALE_RETURN_STOCK_RESTORATION_MISSING", exception_codes)

    def test_allowlisted_return_stock_quantity_mismatch_creates_item(self):
        _, item = self._make_stock_tracked_item(product_code="PHI-P-004", name="Phase I Item 4")
        sale = self._make_direct_sale()
        inv = self._make_posted_invoice(direct_sale=sale)
        sale_line = sale.lines.create(
            product=item.product,
            inventory_item=item,
            description="Sale line mismatch",
            quantity=Decimal("2.000"),
            unit_price=Decimal("1000.00"),
            discount_amount=Decimal("0.00"),
            taxable_value=Decimal("2000.00"),
            cgst_amount=Decimal("0.00"),
            sgst_amount=Decimal("0.00"),
            igst_amount=Decimal("0.00"),
            line_total=Decimal("2000.00"),
        )
        ret = DirectSaleReturn.objects.create(
            return_no="PHI-RET-002",
            direct_sale=sale,
            original_invoice=inv,
            customer=self.customer,
            status=DirectSaleReturnStatus.POSTED,
            return_kind="DELIVERED_RETURN",
            stock_destination="SELLABLE",
            stock_location=self.stock_location,
            reason="Return mismatch test",
            subtotal=Decimal("200.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("200.00"),
            stock_effect=True,
            metadata={"financial_mode": "NO_ACTIVE_CUSTOMER_VALUE"},
            posted_by=self.admin,
            posted_at=timezone.make_aware(datetime(2026, 4, 17, 10, 0, 0)),
        )
        ret_line = DirectSaleReturnLine.objects.create(
            direct_sale_return=ret,
            direct_sale_line=sale_line,
            inventory_item=item,
            description="Return line mismatch",
            quantity=Decimal("2.000"),
            unit_price=Decimal("1000.00"),
            taxable_value=Decimal("2000.00"),
            tax_amount=Decimal("0.00"),
            line_total=Decimal("2000.00"),
        )
        StockLedger.objects.create(
            inventory_item=item,
            movement_type=StockMovementType.SALE_RETURN_IN,
            quantity_in=Decimal("1.000"),
            quantity_out=Decimal("0.000"),
            movement_date=date(2026, 4, 17),
            stock_location=self.stock_location,
            reference_model="DirectSaleReturnLine",
            reference_id=f"{ret.id}:{ret_line.id}",
            notes="wrong qty",
        )

        _, results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("DIRECT_SALE_RETURN_STOCK_QUANTITY_MISMATCH", exception_codes)

    def test_negative_stock_creates_item_when_computed_on_hand_is_negative(self):
        _, item = self._make_stock_tracked_item(product_code="PHI-P-005", name="Phase I Item 5")
        StockLedger.objects.create(
            inventory_item=item,
            movement_type=StockMovementType.SALE_OUT,
            quantity_in=Decimal("0.000"),
            quantity_out=Decimal("1.000"),
            movement_date=date(2026, 4, 18),
            stock_location=self.stock_location,
            reference_model="MANUAL",
            reference_id="0",
            notes="negative test",
        )
        _, results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("INVENTORY_NEGATIVE_STOCK", exception_codes)

    def test_production_completed_missing_finished_good_stock_receipt_creates_item(self):
        _, fg_item = self._make_stock_tracked_item(product_code="PHI-FG-001", name="Phase I FG")
        _, rm_item = self._make_stock_tracked_item(
            product_code="PHI-RM-001",
            name="Phase I RM",
            item_type=InventoryItemType.RAW_MATERIAL,
        )
        job = ProductionJob.objects.create(
            job_no="PHI-JOB-001",
            job_date=date(2026, 4, 19),
            status=ProductionJobStatus.COMPLETED,
            finished_good_inventory_item=fg_item,
            stock_location=self.stock_location,
            planned_output_qty=Decimal("10.000"),
            completed_output_qty=Decimal("5.000"),
            wip_cost=Decimal("0.00"),
            notes="Phase I job",
        )
        ProductionMaterialIssueLine.objects.create(
            production_job=job,
            inventory_item=rm_item,
            entry_kind=ProductionMaterialEntryKind.ISSUE,
            description="RM issue",
            planned_quantity=Decimal("1.000"),
            quantity=Decimal("1.000"),
            unit_cost_snapshot=Decimal("10.0000"),
            line_total_cost=Decimal("10.00"),
            is_posted=True,
        )
        ProductionReceiptLine.objects.create(
            production_job=job,
            inventory_item=fg_item,
            description="FG receipt",
            quantity=Decimal("5.000"),
            unit_cost_snapshot=Decimal("10.0000"),
            line_total_cost=Decimal("50.00"),
            is_posted=True,
        )

        _, results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("PRODUCTION_JOB_FINISHED_GOOD_RECEIPT_STOCK_MISSING", exception_codes)
        self.assertIn("PRODUCTION_JOB_RAW_MATERIAL_STOCK_MOVEMENT_MISSING", exception_codes)

    def test_phase_i_runner_does_not_mutate_source_records(self):
        _, item = self._make_stock_tracked_item(product_code="PHI-P-006", name="Phase I Item 6")
        sale = self._make_direct_sale()
        inv = self._make_posted_invoice(direct_sale=sale)
        BillingInvoiceLine.objects.create(
            invoice=inv,
            product=item.product,
            inventory_item=item,
            description="Mutation safety line",
            quantity=Decimal("1.000"),
            unit_price=Decimal("1000.00"),
            discount_amount=Decimal("0.00"),
            taxable_value=Decimal("1000.00"),
            cgst_amount=Decimal("0.00"),
            sgst_amount=Decimal("0.00"),
            igst_amount=Decimal("0.00"),
            line_total=Decimal("1000.00"),
        )

        before_stock = StockLedger.objects.count()
        before_invoice_status = BillingInvoice.objects.get(pk=inv.id).status

        self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")

        self.assertEqual(before_stock, StockLedger.objects.count())
        self.assertEqual(before_invoice_status, BillingInvoice.objects.get(pk=inv.id).status)
