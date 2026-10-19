from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models_business_setup import PublicBusinessProfile
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_partner_user,
    create_product,
    create_user,
)


class Phase8CmsPublicContentControlTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase8_admin", phone="9801000011")
        self.customer = create_user(
            username="phase8_customer",
            password="CustomerPass123!",
            role="CUSTOMER",
            phone="9801000012",
            first_name="Phase8",
        )
        self.partner = create_partner_user(username="phase8_partner", phone="9801000013")
        self.cashier = create_cashier_user(username="phase8_cashier", phone="9801000014")
        self.vendor = create_user(
            username="phase8_vendor",
            password="VendorPass123!",
            role="VENDOR",
            phone="9801000015",
            first_name="Vendor",
        )

    def test_public_products_does_not_expose_internal_financial_or_stock_fields(self):
        create_product(name="Phase8 Public Product", product_code="PH8-PROD-001")

        response = self.client.get("/api/v1/public/products/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        row = response.data["results"][0]
        allowed = {
            "id",
            "product_code",
            "name",
            "seo_name",
            "base_price",
            "price_range",
            "category",
            "category_slug",
            "subcategory",
            "image",
            "video",
            "gallery_images",
            "gallery_videos",
            # "View in your room" AR: a public media URL plus the product's outer
            # size — nothing internal (no cost, stock or allocation).
            "ar_model",
            "description",
            "pim_description",
            "pim_attributes",
            "pim_variants",
            "is_variant_page",
            "parent_product_id",
            "parent_product_code",
            "selected_attributes",
            "sibling_variants",
            # Customer-facing cash/EMI/rent/lease pricing. Publishing which
            # schemes a product can be bought on is the point of the field; the
            # raw is_*_enabled booleans stay private (asserted below).
            "scheme_pricing",
            "rent_yield_estimates",
        }
        self.assertEqual(set(row.keys()), allowed)

        forbidden_fields = {
            "cost_price",
            "opening_stock",
            "current_stock",
            "reorder_level",
            "is_emi_enabled",
            "is_rent_enabled",
            "is_lease_enabled",
            "created_at",
            "updated_at",
        }
        for key in forbidden_fields:
            self.assertNotIn(key, row)

        # The pricing block must not become a side door for internal data.
        pricing = row.get("scheme_pricing")
        if pricing:
            self.assertEqual(
                set(pricing.keys()),
                {
                    "product_id",
                    "product_code",
                    "priced_on",
                    "cash_price",
                    "cash_base_price",
                    "cash_has_discount",
                    "lowest_monthly",
                    "available_schemes",
                    "schemes",
                    "rules",
                    "has_active_batches",
                },
            )
            for scheme in pricing["schemes"].values():
                # Only offerable schemes are listed, so no internal reason
                # string restates a product's configuration flags.
                self.assertTrue(scheme["available"])
                self.assertNotIn("unavailable_reason", scheme)
                if scheme.get("discount"):
                    # Offer name and saving only — no internal package code or
                    # discount configuration.
                    self.assertEqual(
                        set(scheme["discount"].keys()), {"package_name", "amount_off"}
                    )

    def test_admin_public_profile_updates_do_not_mutate_product_price_or_stock_truth(self):
        product = create_product(
            name="Immutable Price Product",
            product_code="PH8-PROD-002",
            base_price=Decimal("12345.00"),
        )

        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            "/api/v1/admin/public-site/profile/",
            {
                "display_name": "Subidha Public",
                "tagline": "Phase8 Content Only",
                "hero_title": "Public Hero",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        product.refresh_from_db()
        self.assertEqual(product.base_price, Decimal("12345.00"))

    def test_admin_public_profile_is_admin_only_for_all_non_admin_roles(self):
        for user in (self.customer, self.partner, self.cashier, self.vendor):
            self.client.force_authenticate(user)
            response = self.client.patch(
                "/api/v1/admin/public-site/profile/",
                {"display_name": "Blocked", "is_active": True},
                format="json",
            )
            self.assertEqual(
                response.status_code,
                status.HTTP_403_FORBIDDEN,
                f"role={user.role} should be forbidden",
            )

    def test_public_pages_endpoints_do_not_require_auth(self):
        PublicBusinessProfile.objects.all().delete()
        PublicBusinessProfile.objects.create(
            display_name="Subidha Furniture",
            is_active=True,
        )
        create_product(name="Public Access Product", product_code="PH8-PROD-003")

        endpoints = [
            "/api/v1/public/stats/",
            "/api/v1/public/business-profile/",
            "/api/v1/public/products/",
            "/api/v1/public/latest-winner/",
            "/api/v1/public/winners/",
            "/api/v1/public/winner-history/",
            "/api/v1/public/health/",
            "/api/v1/public/readiness/",
        ]

        for url in endpoints:
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK, f"url={url} {response.data}")

    def test_admin_can_create_update_and_delete_announcements(self):
        self.client.force_authenticate(self.admin)

        # 1. Create announcement
        create_res = self.client.post(
            "/api/v1/admin/public-site/announcements/",
            {
                "title": "Diwali Special Offer",
                "message": "Get flat 15% off on all Advance EMI plans.",
                "banner_type": "OFFER",
                "badge_text": "15% OFF",
                "action_label": "Claim Now",
                "action_url": "/products",
                "priority": 10,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED, create_res.data)
        banner_id = create_res.data["id"]

        # 2. List announcements in admin
        list_res = self.client.get("/api/v1/admin/public-site/announcements/")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertTrue(any(b["id"] == banner_id for b in list_res.data["announcements"]))

        # 3. Patch announcement
        patch_res = self.client.patch(
            f"/api/v1/admin/public-site/announcements/{banner_id}/",
            {"badge_text": "MEGA OFFER", "priority": 20},
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data["badge_text"], "MEGA OFFER")
        self.assertEqual(patch_res.data["priority"], 20)

        # 4. Delete announcement
        del_res = self.client.delete(f"/api/v1/admin/public-site/announcements/{banner_id}/")
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)

    def test_public_announcements_anonymous_access_and_filtering(self):
        from subscriptions.models_business_setup import PublicAnnouncementBanner

        active_banner = PublicAnnouncementBanner.objects.create(
            title="Active News",
            message="Store will remain open on Sunday.",
            banner_type="NEWS",
            is_active=True,
            priority=5,
        )
        inactive_banner = PublicAnnouncementBanner.objects.create(
            title="Old Offer",
            message="Expired offer message.",
            banner_type="OFFER",
            is_active=False,
            priority=1,
        )

        self.client.logout()
        res = self.client.get("/api/v1/public/announcements/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [b["id"] for b in res.data["announcements"]]
        self.assertIn(active_banner.id, ids)
        self.assertNotIn(inactive_banner.id, ids)

    def test_announcements_admin_endpoints_forbidden_for_non_admins(self):
        payload = {
            "title": "Unauthorized Banner",
            "message": "Should not be created",
            "banner_type": "ALERT",
        }
        for user in (self.customer, self.partner, self.cashier, self.vendor):
            self.client.force_authenticate(user)
            res = self.client.post("/api/v1/admin/public-site/announcements/", payload, format="json")
            self.assertEqual(
                res.status_code,
                status.HTTP_403_FORBIDDEN,
                f"role={user.role} should be forbidden from posting announcements",
            )
