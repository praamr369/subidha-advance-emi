from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from products_pim.models import PimProduct, ProductCategory, ProductMediaItem, ProductVariant
from products_pim.serializers import PimProductDetailSerializer, PimProductListSerializer
from tests.helpers import create_admin_user, create_customer_user

URL = "/api/v1/pim/products/price-list-quote/"


class PriceListQuoteApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="quote_admin", phone="9364000991")
        self.customer = create_customer_user(username="quote_customer", phone="9364000992")
        self.category = ProductCategory.objects.create(name="Living Room", slug="living-room-quote")

        # Base product (Blueprint)
        self.sofa_base = PimProduct.objects.create(
            code="SOFA-ROYAL",
            name="Royal 3-Seater Sofa",
            category=self.category,
            base_price=Decimal("30000.00"),
            rent_monthly_yield_percent=Decimal("5.00"),
            lease_monthly_yield_percent=Decimal("3.50"),
            is_active=True,
            is_published=True,
        )

        # Child Variant SKU 1
        self.sofa_velvet = PimProduct.objects.create(
            code="SOFA-ROYAL-VELVET",
            name="Royal Sofa Blue Velvet",
            parent=self.sofa_base,
            category=self.category,
            base_price=Decimal("33000.00"),
            rent_monthly_yield_percent=Decimal("5.00"),
            lease_monthly_yield_percent=Decimal("3.50"),
            is_active=True,
            is_published=True,
        )

        # Child Variant SKU 2
        self.sofa_leather = PimProduct.objects.create(
            code="SOFA-ROYAL-LEATHER",
            name="Royal Sofa Brown Leather",
            parent=self.sofa_base,
            category=self.category,
            base_price=Decimal("36000.00"),
            rent_monthly_yield_percent=Decimal("5.00"),
            lease_monthly_yield_percent=Decimal("3.50"),
            is_active=True,
            is_published=True,
        )

        self.client.force_authenticate(user=self.admin)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        res = self.client.post(URL, {"product_ids": [self.sofa_base.id]}, format="json")
        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_requires_admin_role(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post(URL, {"product_ids": [self.sofa_base.id]}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_empty_product_ids_validation(self):
        res = self.client.post(URL, {"product_ids": []}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_price_list_quote_generation_with_all_schemes_and_tenures(self):
        payload = {
            "product_ids": [self.sofa_base.id],
            "include_variants": True,
            "schemes": ["DIRECT_SALE", "RENT", "LEASE", "SFEMI"],
            "rent_tenures": [6, 9, 12, 24],
            "lease_tenures": [12, 24, 36],
            "sfemi_tenures": [12, 15],
            "customer_name": "Ramesh Sen",
            "customer_phone": "9876543210",
        }
        res = self.client.post(URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        self.assertEqual(data["customer_name"], "Ramesh Sen")
        self.assertEqual(data["customer_phone"], "9876543210")
        self.assertEqual(data["rent_tenures"], [6, 9, 12, 24])
        self.assertEqual(data["lease_tenures"], [12, 24, 36])
        self.assertEqual(data["sfemi_tenures"], [12, 15])
        self.assertEqual(data["base_count"], 1)
        self.assertEqual(data["variant_count"], 2)
        self.assertEqual(data["item_count"], 3)  # base + 2 variants

        # Verify base product quotes
        base_item = data["items"][0]
        self.assertEqual(base_item["code"], "SOFA-ROYAL")
        self.assertFalse(base_item["is_child"])
        self.assertEqual(base_item["base_price"], "30000.00")
        self.assertIn("products/SOFA-ROYAL", base_item["public_url"])

        # Check Direct Sale
        ds = base_item["quotes"]["direct_sale"]
        self.assertTrue(ds["available"])
        self.assertEqual(ds["price"], "30000.00")

        # Check Rent tenures (30000 * 0.05 * 12 / tenure)
        rent = base_item["quotes"]["rent"]
        self.assertTrue(rent["available"])
        self.assertIn("6", rent["tenures"])
        self.assertIn("9", rent["tenures"])
        self.assertIn("12", rent["tenures"])
        self.assertIn("24", rent["tenures"])
        # For 6m: 30000 * 5 * 12 / 6 / 100 = 3000.00
        self.assertEqual(rent["tenures"]["6"]["monthly_amount"], "3000.00")
        # For 12m: 30000 * 5 * 12 / 12 / 100 = 1500.00
        self.assertEqual(rent["tenures"]["12"]["monthly_amount"], "1500.00")

        # Check SFEMI Special Promotional 15-month tenure
        sfemi = base_item["quotes"]["sfemi"]
        self.assertTrue(sfemi["available"])
        self.assertIn("12", sfemi["tenures"])
        self.assertIn("15", sfemi["tenures"])

        # 12m SFEMI: 30000 / 12 = 2500.00
        self.assertEqual(sfemi["tenures"]["12"]["monthly_amount"], "2500.00")
        self.assertFalse(sfemi["tenures"]["12"]["is_special_promotion"])

        # 15m Promotional SFEMI: 30000 / 15 = 2000.00
        promo_15m = sfemi["tenures"]["15"]
        self.assertEqual(promo_15m["monthly_amount"], "2000.00")
        self.assertTrue(promo_15m["is_special_promotion"])
        self.assertIn("15-Month SFEMI Special Promotional Plan", promo_15m["plan_label"])
        self.assertIn("Remaining Future EMIs Waived", promo_15m["promotional_benefit"])

        # Child variant checks (find by code)
        items_by_code = {i["code"]: i for i in data["items"]}
        self.assertIn("SOFA-ROYAL-LEATHER", items_by_code)
        self.assertIn("SOFA-ROYAL-VELVET", items_by_code)

        leather_item = items_by_code["SOFA-ROYAL-LEATHER"]
        self.assertTrue(leather_item["is_child"])
        self.assertEqual(leather_item["base_price"], "36000.00")
        self.assertIn("sku=SOFA-ROYAL-LEATHER", leather_item["public_url"])
        leather_sfemi_15m = leather_item["quotes"]["sfemi"]["tenures"]["15"]
        # 36000 / 15 = 2400.00
        self.assertEqual(leather_sfemi_15m["monthly_amount"], "2400.00")

        # WhatsApp text validation
        msg = data["whatsapp_message"]
        self.assertIn("Ramesh Sen", msg)
        self.assertIn("SOFA-ROYAL", msg)
        self.assertIn("SOFA-ROYAL-LEATHER", msg)
        self.assertIn("15-Month Special Promotion", msg)
        self.assertIn("Remaining Future EMIs Waived", msg)
        self.assertNotIn("Lucky Plan", msg)
        self.assertNotIn("Lucky Draw", msg)

        # Check that whatsapp_summary_message is present and concise
        summary_msg = data.get("whatsapp_summary_message", "")
        self.assertTrue(bool(summary_msg))
        self.assertIn("Ramesh Sen", summary_msg)
        self.assertIn("SOFA-ROYAL", summary_msg)
        self.assertLess(len(summary_msg), 1500)

    def test_exclude_unpriced_filter(self):
        # Create unpriced product (base_price = 0)
        unpriced = PimProduct.objects.create(
            code="UNPRICED-ITEM",
            name="Draft Sofa Unpriced",
            category=self.category,
            base_price=Decimal("0.00"),
            is_active=True,
            is_published=True,
        )

        # 1. With exclude_unpriced=True
        res = self.client.post(
            URL,
            {"product_ids": [self.sofa_base.id, unpriced.id], "include_variants": False, "exclude_unpriced": True},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        item_codes = [i["code"] for i in data["items"]]
        self.assertIn("SOFA-ROYAL", item_codes)
        self.assertNotIn("UNPRICED-ITEM", item_codes)

        # 2. With exclude_unpriced=False
        res2 = self.client.post(
            URL,
            {"product_ids": [self.sofa_base.id, unpriced.id], "include_variants": False, "exclude_unpriced": False},
            format="json",
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        data2 = res2.json()
        item_codes2 = [i["code"] for i in data2["items"]]
        self.assertIn("UNPRICED-ITEM", item_codes2)
        unpriced_item = next(i for i in data2["items"] if i["code"] == "UNPRICED-ITEM")
        self.assertFalse(unpriced_item["has_price"])

    def test_category_filter(self):
        other_cat = ProductCategory.objects.create(name="Office", slug="office-quote")
        chair = PimProduct.objects.create(
            code="OFFICE-CHAIR-01",
            name="Ergonomic Mesh Chair",
            category=other_cat,
            base_price=Decimal("8000.00"),
            is_active=True,
            is_published=True,
        )

        res = self.client.post(
            URL,
            {
                "product_ids": [self.sofa_base.id, chair.id],
                "include_variants": False,
                "category_id": other_cat.id,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        item_codes = [i["code"] for i in data["items"]]
        self.assertIn("OFFICE-CHAIR-01", item_codes)
        self.assertNotIn("SOFA-ROYAL", item_codes)

    def test_image_url_direct_image(self):
        sofa_with_img = PimProduct.objects.create(
            code="SOFA-IMG-DIRECT",
            name="Sofa With Direct Photo",
            category=self.category,
            base_price=Decimal("25000.00"),
            image="products/direct_sofa.jpg",
            is_active=True,
            is_published=True,
        )
        res = self.client.post(
            URL,
            {"product_ids": [sofa_with_img.id], "include_variants": False},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        item = res.json()["items"][0]
        self.assertIsNotNone(item["image_url"])
        self.assertIn("products/direct_sofa.jpg", item["image_url"])

    def test_image_url_media_items_hero_and_filters_non_image(self):
        sofa_media = PimProduct.objects.create(
            code="SOFA-MEDIA-GALLERY",
            name="Sofa With Media Items",
            category=self.category,
            base_price=Decimal("28000.00"),
            is_active=True,
            is_published=True,
        )
        # Create non-image media items that must be filtered out
        ProductMediaItem.objects.create(
            product=sofa_media,
            kind="VIDEO",
            file="https://cdn.example.com/tour.mp4",
            is_hero=True,
        )
        ProductMediaItem.objects.create(
            product=sofa_media,
            kind="MODEL_3D",
            file="https://cdn.example.com/mesh.glb",
            is_hero=True,
        )
        # Secondary image
        ProductMediaItem.objects.create(
            product=sofa_media,
            kind="IMAGE",
            file="https://cdn.example.com/gallery_side.jpg",
            is_hero=False,
            display_order=2,
        )
        # Primary hero image
        ProductMediaItem.objects.create(
            product=sofa_media,
            kind="IMAGE",
            file="https://cdn.example.com/gallery_hero.jpg",
            is_hero=True,
            display_order=1,
        )

        res = self.client.post(
            URL,
            {"product_ids": [sofa_media.id], "include_variants": False},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        item = res.json()["items"][0]
        # Should pick the hero IMAGE, never video or 3d model
        self.assertEqual(item["image_url"], "https://cdn.example.com/gallery_hero.jpg")

    def test_image_url_variant_inherits_parent_image(self):
        # Base product has a hero image in media items
        ProductMediaItem.objects.create(
            product=self.sofa_base,
            kind="IMAGE",
            file="https://cdn.example.com/sofa_base_hero.jpg",
            is_hero=True,
        )
        # Child variant SOFA-ROYAL-VELVET has no image of its own
        res = self.client.post(
            URL,
            {"product_ids": [self.sofa_base.id], "include_variants": True},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        items_by_code = {i["code"]: i for i in res.json()["items"]}
        # Child must inherit parent base hero photo
        self.assertEqual(
            items_by_code["SOFA-ROYAL-VELVET"]["image_url"],
            "https://cdn.example.com/sofa_base_hero.jpg",
        )

    def test_image_url_variant_override_custom_photo(self):
        # Base product has a hero image
        ProductMediaItem.objects.create(
            product=self.sofa_base,
            kind="IMAGE",
            file="https://cdn.example.com/sofa_base_hero.jpg",
            is_hero=True,
        )
        # Variant SKU SOFA-ROYAL-LEATHER has its own ProductVariant with custom image
        ProductVariant.objects.create(
            product=self.sofa_base,
            sku="SOFA-ROYAL-LEATHER",
            price=Decimal("36000.00"),
            image="https://cdn.example.com/leather_brown_variant.jpg",
        )
        res = self.client.post(
            URL,
            {"product_ids": [self.sofa_base.id], "include_variants": True},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        items_by_code = {i["code"]: i for i in res.json()["items"]}
        # Child variant must use its specific variant image instead of parent hero
        self.assertEqual(
            items_by_code["SOFA-ROYAL-LEATHER"]["image_url"],
            "https://cdn.example.com/leather_brown_variant.jpg",
        )
        # Child without specific variant image still inherits parent hero
        self.assertEqual(
            items_by_code["SOFA-ROYAL-VELVET"]["image_url"],
            "https://cdn.example.com/sofa_base_hero.jpg",
        )

    def test_image_url_null_when_no_media(self):
        plain = PimProduct.objects.create(
            code="PLAIN-NO-IMG",
            name="Plain Sofa Without Photo",
            category=self.category,
            base_price=Decimal("15000.00"),
            is_active=True,
            is_published=True,
        )
        res = self.client.post(
            URL,
            {"product_ids": [plain.id], "include_variants": False},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        item = res.json()["items"][0]
        self.assertIsNone(item["image_url"])

    def test_pim_serializers_expose_image(self):
        ProductMediaItem.objects.create(
            product=self.sofa_base,
            kind="IMAGE",
            file="https://cdn.example.com/sofa_base_hero.jpg",
            is_hero=True,
        )
        # Test List serializer
        list_data = PimProductListSerializer(self.sofa_base).data
        self.assertEqual(list_data["image"], "https://cdn.example.com/sofa_base_hero.jpg")

        # Test Detail serializer
        detail_data = PimProductDetailSerializer(self.sofa_base).data
        self.assertEqual(detail_data["image"], "https://cdn.example.com/sofa_base_hero.jpg")

        # Test Child variant inherits via serializer
        child_list_data = PimProductListSerializer(self.sofa_velvet).data
        self.assertEqual(child_list_data["image"], "https://cdn.example.com/sofa_base_hero.jpg")

