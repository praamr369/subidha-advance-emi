"""Test that catalog queryset prefetching prevents N+1 queries."""
from decimal import Decimal
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection

from products_core.models import Product
from products_pim.models import PimProduct, ProductMediaItem, MediaKind, MediaScope
from products.services.catalog_browse_service import approved_catalog_queryset, serialize_catalog_product


class CatalogQueryEfficiencyTests(TestCase):
    def setUp(self):
        self.products = []
        for i in range(1, 11):
            p = Product.objects.create(
                product_code=f"PERF-TEST-{i:03d}",
                name=f"Performance Test Sofa {i}",
                base_price=Decimal("12000.00"),
                is_active=True,
                is_emi_enabled=True,
                is_direct_sale_enabled=True,
            )
            # Find the auto-created PIM record from the sync signal and publish it
            pim = PimProduct.objects.filter(source_product=p).first()
            if pim is None:
                pim = PimProduct.objects.create(
                    code=f"PIM-PERF-{i:03d}",
                    source_product=p,
                    name=p.name,
                )
            pim.is_published = True
            pim.save(update_fields=["is_published"])

            ProductMediaItem.objects.create(
                product=pim,
                kind=MediaKind.IMAGE,
                scope=MediaScope.ALL_VARIANTS,
                file=f"https://example.com/media/sofa_{i}.webp",
                is_hero=True,
            )
            self.products.append(p)

    def test_catalog_serialization_does_not_n_plus_one_on_media(self):
        # Evaluate queryset with prefetching
        qs = list(approved_catalog_queryset().filter(product_code__startswith="PERF-TEST-"))
        self.assertEqual(len(qs), 10)

        # In-memory resolution of images and media for all 10 products must execute ZERO extra queries!
        from products.services.catalog_browse_service import _resolve_catalog_image, _resolve_catalog_media
        with CaptureQueriesContext(connection) as ctx:
            for p in qs:
                img = _resolve_catalog_image(p)
                media = _resolve_catalog_media(p)
                self.assertTrue(img.startswith("https://example.com/media/sofa_"))
                self.assertEqual(len(media), 1)

        # All 10 products resolved their images and media entirely from prefetch cache (0 DB queries)!
        self.assertEqual(len(ctx.captured_queries), 0)
