from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from inventory.models import InventoryItem, StockLocation
from tests.helpers import create_admin_user, create_product


class ManufacturingApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="mfg_api_admin", phone="9387700102")
        self.client.force_authenticate(user=self.admin)
        self.location = StockLocation.objects.create(code="MFG-API", name="Manufacturing API Floor")
        self.raw_product = create_product(
            name="Foam Sheet",
            product_code="RAW-FOAM-01",
            base_price=Decimal("500.00"),
        )
        self.fg_product = create_product(
            name="Office Chair",
            product_code="FG-CHAIR-01",
            base_price=Decimal("12000.00"),
        )
        self.raw_item = InventoryItem.objects.create(
            product=self.raw_product,
            sku="RAW-FOAM-01",
            stock_item_type="RAW_MATERIAL",
            default_stock_location=self.location,
            standard_unit_cost=Decimal("75.00"),
        )
        self.fg_item = InventoryItem.objects.create(
            product=self.fg_product,
            sku="FG-CHAIR-01",
            stock_item_type="FINISHED_GOOD",
            default_stock_location=self.location,
            standard_unit_cost=Decimal("1500.00"),
        )

    def test_admin_can_create_activate_bom_and_release_job(self):
        create_bom = self.client.post(
            "/api/v1/manufacturing/boms/",
            {
                "finished_good_inventory_item": self.fg_item.id,
                "revision_no": 1,
                "is_default": True,
                "notes": "Office chair BOM",
                "lines": [
                    {
                        "inventory_item": self.raw_item.id,
                        "quantity_per_unit": "2.000",
                        "wastage_percent": "0.00",
                        "sort_order": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(create_bom.status_code, status.HTTP_201_CREATED, create_bom.data)

        activate = self.client.post(f"/api/v1/manufacturing/boms/{create_bom.data['id']}/activate/", {}, format="json")
        self.assertEqual(activate.status_code, status.HTTP_200_OK, activate.data)
        self.assertEqual(activate.data["bom"]["status"], "ACTIVE")

        create_job = self.client.post(
            "/api/v1/manufacturing/jobs/",
            {
                "finished_good_inventory_item": self.fg_item.id,
                "bom": create_bom.data["id"],
                "stock_location": self.location.id,
                "planned_output_qty": "3.000",
                "notes": "Build three chairs",
            },
            format="json",
        )
        self.assertEqual(create_job.status_code, status.HTTP_201_CREATED, create_job.data)
        self.assertEqual(len(create_job.data["material_issue_lines"]), 1)

        release = self.client.post(f"/api/v1/manufacturing/jobs/{create_job.data['id']}/release/", {}, format="json")
        self.assertEqual(release.status_code, status.HTTP_200_OK, release.data)
        self.assertEqual(release.data["job"]["status"], "RELEASED")

    def test_overview_and_output_posting_surface_counts(self):
        create_job = self.client.post(
            "/api/v1/manufacturing/jobs/",
            {
                "finished_good_inventory_item": self.fg_item.id,
                "stock_location": self.location.id,
                "planned_output_qty": "1.000",
                "material_issue_lines": [
                    {
                        "inventory_item": self.raw_item.id,
                        "quantity": "4.000",
                        "unit_cost_snapshot": "50.0000",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(create_job.status_code, status.HTTP_201_CREATED, create_job.data)
        job_id = create_job.data["id"]

        self.client.post(f"/api/v1/manufacturing/jobs/{job_id}/release/", {}, format="json")
        issue = self.client.post(
            f"/api/v1/manufacturing/jobs/{job_id}/post-materials/",
            {"movement_date": "2026-04-24"},
            format="json",
        )
        self.assertEqual(issue.status_code, status.HTTP_200_OK, issue.data)

        output = self.client.post(
            f"/api/v1/manufacturing/jobs/{job_id}/post-output/",
            {
                "output_date": "2026-04-24",
                "receipt_lines": [{"quantity": "1.000"}],
            },
            format="json",
        )
        self.assertEqual(output.status_code, status.HTTP_200_OK, output.data)

        overview = self.client.get("/api/v1/manufacturing/overview/")
        self.assertEqual(overview.status_code, status.HTTP_200_OK, overview.data)
        self.assertGreaterEqual(overview.data["summary"]["job_count"], 1)
        self.assertGreaterEqual(overview.data["summary"]["in_progress_count"], 1)
