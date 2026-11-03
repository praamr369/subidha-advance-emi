from __future__ import annotations

from decimal import Decimal
from rest_framework import status
from rest_framework.test import APITestCase

from audit.models import AuditLog
from products_pim.models import PimProduct, ProductCategory, ProductVariant
from tests.helpers import create_admin_user


class ProductVariantAuditTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="test_audit_admin")
        self.client.force_authenticate(user=self.admin)

        self.category = ProductCategory.objects.create(name="Audit Furniture")
        self.product = PimProduct.objects.create(
            code="AUDIT-BED",
            name="Audit Bed Frame",
            category=self.category,
            base_price=Decimal("15000.00"),
        )

    def test_variant_update_records_audit_log_and_timeline(self):
        # 1. Create a variant
        variant = ProductVariant.objects.create(
            product=self.product,
            sku="AUDIT-BED-VAR1",
            variant_name="Audit Bed King",
            price=Decimal("18000.00"),
            quantity_on_hand=5,
            reorder_level=2,
        )

        # 2. Update variant pricing & name via API
        response = self.client.patch(
            f"/api/v1/pim/variants/{variant.id}/update_attributes/",
            {
                "price": "22000.00",
                "variant_name": "Audit Bed King Premium",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # 3. Verify AuditLog entry was recorded
        audit = AuditLog.objects.filter(
            action_type=AuditLog.ActionType.PRODUCT_VARIANT_UPDATED,
            object_id=str(variant.id),
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.performed_by, self.admin)

        # Verify field-level diff
        changes = audit.metadata.get("changes", {})
        self.assertIn("price", changes)
        self.assertEqual(str(changes["price"]["old"]), "18000.00")
        self.assertEqual(str(changes["price"]["new"]), "22000.00")
        self.assertIn("variant_name", changes)

        # 4. Query timeline by numeric ID
        timeline_res = self.client.get(
            f"/api/v1/admin/audit-logs/timeline/ProductVariant/{variant.id}/"
        )
        self.assertEqual(timeline_res.status_code, status.HTTP_200_OK)
        results = timeline_res.json()
        entries = results if isinstance(results, list) else results.get("results", [])
        self.assertTrue(len(entries) >= 1)
        self.assertEqual(entries[0]["performed_by_username"], "test_audit_admin")

        # 5. Query timeline by SKU string
        timeline_sku_res = self.client.get(
            f"/api/v1/admin/audit-logs/timeline/ProductVariant/{variant.sku}/"
        )
        self.assertEqual(timeline_sku_res.status_code, status.HTTP_200_OK)
        sku_results = timeline_sku_res.json()
        sku_entries = sku_results if isinstance(sku_results, list) else sku_results.get("results", [])
        self.assertTrue(len(sku_entries) >= 1)

    def test_base_and_child_product_audit_logging(self):
        # 1. Update base product
        res = self.client.patch(
            f"/api/v1/pim/products/{self.product.id}/",
            {
                "name": "Audit Bed Frame Renovated",
                "base_price": "16500.00",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # 2. Verify AuditLog entry for base product
        audit = AuditLog.objects.filter(
            action_type=AuditLog.ActionType.PIM_PRODUCT_UPDATED,
            object_id=self.product.id,
        ).first()
        self.assertIsNotNone(audit)
        changes = audit.metadata.get("changes", {})
        self.assertIn("name", changes)
        self.assertEqual(changes["name"]["old"], "Audit Bed Frame")
        self.assertEqual(changes["name"]["new"], "Audit Bed Frame Renovated")

        # 3. Query base product timeline
        timeline_res = self.client.get(
            f"/api/v1/admin/audit-logs/timeline/PimProduct/{self.product.id}/"
        )
        self.assertEqual(timeline_res.status_code, status.HTTP_200_OK)
        entries = timeline_res.json()
        entries_list = entries if isinstance(entries, list) else entries.get("results", [])
        self.assertTrue(len(entries_list) >= 1)

        # 4. Create child product under base product
        child_product = PimProduct.objects.create(
            code="AUDIT-BED-CHILD",
            name="Audit Bed Single Size",
            parent=self.product,
            category=self.category,
            base_price=Decimal("12000.00"),
        )
        child_res = self.client.patch(
            f"/api/v1/pim/products/{child_product.id}/",
            {"base_price": "12500.00"},
            format="json",
        )
        self.assertEqual(child_res.status_code, status.HTTP_200_OK)

        # Query unified timeline with include_variants=true
        unified_res = self.client.get(
            f"/api/v1/admin/audit-logs/timeline/PimProduct/{self.product.id}/?include_variants=true"
        )
        self.assertEqual(unified_res.status_code, status.HTTP_200_OK)
        unified_entries = unified_res.json()
        unified_list = unified_entries if isinstance(unified_entries, list) else unified_entries.get("results", [])
        self.assertTrue(len(unified_list) >= 2)
