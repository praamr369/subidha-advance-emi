from datetime import date
from decimal import Decimal

from django.test import TestCase

from inventory.models import InventoryItem, StockLedger, StockLocation, StockMovementType
from manufacturing.models import (
    ManufacturingAccountingStatus,
    ManufacturingBomStatus,
    ProductionJobStatus,
)
from manufacturing.services.production_service import (
    activate_manufacturing_bom,
    complete_production_job,
    post_production_materials,
    post_production_output,
    release_production_job,
    upsert_manufacturing_bom_draft,
    upsert_production_job_draft,
)
from subscriptions.models import AuditLog
from tests.helpers import create_admin_user, create_product


class ManufacturingWorkflowTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="mfg_admin", phone="9387700101")
        self.location = StockLocation.objects.create(code="MFG-FLR", name="Manufacturing Floor")
        self.raw_product = create_product(
            name="Wood Panel",
            product_code="RAW-PANEL-01",
            base_price=Decimal("1000.00"),
        )
        self.fg_product = create_product(
            name="Dining Table",
            product_code="FG-TABLE-01",
            base_price=Decimal("25000.00"),
        )
        self.raw_item = InventoryItem.objects.create(
            product=self.raw_product,
            sku="RAW-PANEL-01",
            stock_item_type="RAW_MATERIAL",
            default_stock_location=self.location,
            standard_unit_cost=Decimal("100.00"),
        )
        self.fg_item = InventoryItem.objects.create(
            product=self.fg_product,
            sku="FG-TABLE-01",
            stock_item_type="FINISHED_GOOD",
            default_stock_location=self.location,
            standard_unit_cost=Decimal("5000.00"),
        )

    def test_bom_release_issue_receive_complete_posts_stock_and_accounting(self):
        bom = upsert_manufacturing_bom_draft(
            payload={
                "finished_good_inventory_item": self.fg_item,
                "revision_no": 1,
                "is_default": True,
                "notes": "Core dining-table BOM",
                "lines": [
                    {
                        "inventory_item": self.raw_item,
                        "quantity_per_unit": Decimal("3.000"),
                        "wastage_percent": Decimal("0.00"),
                    }
                ],
            },
            performed_by=self.admin,
        )
        bom, updated = activate_manufacturing_bom(bom_id=bom.id, performed_by=self.admin)
        self.assertTrue(updated)
        self.assertEqual(bom.status, ManufacturingBomStatus.ACTIVE)

        job = upsert_production_job_draft(
            payload={
                "job_date": date(2026, 4, 20),
                "bom": bom,
                "finished_good_inventory_item": self.fg_item,
                "stock_location": self.location,
                "planned_output_qty": Decimal("2.000"),
                "notes": "Build two dining tables",
            },
            performed_by=self.admin,
        )
        self.assertEqual(job.material_issue_lines.count(), 1)

        job, updated = release_production_job(job_id=job.id, performed_by=self.admin)
        self.assertTrue(updated)
        self.assertEqual(job.status, ProductionJobStatus.RELEASED)

        job, updated = post_production_materials(
            job_id=job.id,
            movement_date=date(2026, 4, 20),
            performed_by=self.admin,
        )
        self.assertTrue(updated)
        issue_line = job.material_issue_lines.get()
        self.assertTrue(issue_line.is_posted)
        self.assertIsNotNone(issue_line.posted_journal_entry_id)
        self.assertTrue(
            StockLedger.objects.filter(
                inventory_item=self.raw_item,
                movement_type=StockMovementType.PRODUCTION_ISSUE_OUT,
                reference_model="ProductionMaterialIssueLine",
                reference_id=str(issue_line.id),
            ).exists()
        )

        job, updated = post_production_output(
            job_id=job.id,
            output_date=date(2026, 4, 21),
            receipt_lines=[{"quantity": Decimal("2.000")}],
            performed_by=self.admin,
        )
        self.assertTrue(updated)
        receipt_line = job.receipt_lines.get()
        self.assertTrue(receipt_line.is_posted)
        self.assertIsNotNone(receipt_line.posted_journal_entry_id)
        self.assertTrue(
            StockLedger.objects.filter(
                inventory_item=self.fg_item,
                movement_type=StockMovementType.PRODUCTION_RECEIPT_IN,
                reference_model="ProductionReceiptLine",
                reference_id=str(receipt_line.id),
            ).exists()
        )

        job, updated = complete_production_job(job_id=job.id, performed_by=self.admin)
        self.assertTrue(updated)
        job.refresh_from_db()

        self.assertEqual(job.status, ProductionJobStatus.COMPLETED)
        self.assertEqual(job.completed_output_qty, Decimal("2.000"))
        self.assertEqual(job.total_issued_cost, Decimal("600.00"))
        self.assertEqual(job.total_received_cost, Decimal("600.00"))
        self.assertEqual(job.wip_cost, Decimal("0.00"))
        self.assertEqual(job.accounting_status, ManufacturingAccountingStatus.POSTED)
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="ProductionJob",
                object_id=job.id,
                action_type=AuditLog.ActionType.PRODUCTION_OUTPUT_POSTED,
            ).exists()
        )

    def test_material_return_correction_reduces_net_issue_and_posts_return_stock(self):
        job = upsert_production_job_draft(
            payload={
                "job_date": date(2026, 4, 22),
                "finished_good_inventory_item": self.fg_item,
                "stock_location": self.location,
                "planned_output_qty": Decimal("1.000"),
                "material_issue_lines": [
                    {
                        "inventory_item": self.raw_item,
                        "entry_kind": "ISSUE",
                        "quantity": Decimal("5.000"),
                        "unit_cost_snapshot": Decimal("50.0000"),
                    }
                ],
            },
            performed_by=self.admin,
        )
        job, _ = release_production_job(job_id=job.id, performed_by=self.admin)
        job, _ = post_production_materials(
            job_id=job.id,
            movement_date=date(2026, 4, 22),
            performed_by=self.admin,
        )
        job, updated = post_production_materials(
            job_id=job.id,
            movement_date=date(2026, 4, 22),
            lines=[
                {
                    "inventory_item": self.raw_item,
                    "entry_kind": "RETURN",
                    "quantity": Decimal("1.000"),
                    "unit_cost_snapshot": Decimal("50.0000"),
                    "notes": "Correction return",
                }
            ],
            performed_by=self.admin,
        )
        self.assertTrue(updated)
        job.refresh_from_db()

        return_line = job.material_issue_lines.filter(entry_kind="RETURN").latest("id")
        self.assertTrue(return_line.is_posted)
        self.assertIsNotNone(return_line.posted_journal_entry_id)
        self.assertEqual(job.total_issued_cost, Decimal("200.00"))
        self.assertTrue(
            StockLedger.objects.filter(
                inventory_item=self.raw_item,
                movement_type=StockMovementType.PRODUCTION_RETURN_IN,
                reference_model="ProductionMaterialIssueLine",
                reference_id=str(return_line.id),
            ).exists()
        )
