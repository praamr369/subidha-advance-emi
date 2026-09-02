from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from growth.models import (
    CustomerOfferGrantStatus,
    OfferAudienceType,
    OfferDiscountType,
    OfferPackage,
    OfferPackageLine,
    OfferPackageStatus,
    PlanTemplate,
    PlanTemplateType,
)
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_customer_user,
    create_product,
)


class CustomerOfferApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="offer_api_admin", phone="9364000996")
        self.product = create_product(
            name="API Sofa", product_code="OFFERAPI-001", base_price=Decimal("24000.00")
        )
        self.template = PlanTemplate.objects.create(
            template_code="EMI-API", name="EMI 12", plan_type=PlanTemplateType.EMI,
            tenure_months=12, is_active=True,
        )
        self.package = OfferPackage.objects.create(
            package_code="API-OFFER", name="Festive Offer", plan_template=self.template,
            status=OfferPackageStatus.ACTIVE, audience_type=OfferAudienceType.NEW_CUSTOMER,
            is_public_visible=True,
        )
        OfferPackageLine.objects.create(
            offer_package=self.package, product=self.product,
            discount_type=OfferDiscountType.PERCENT, discount_value=Decimal("20"),
        )

        from crm.services.lead_conversion_service import LeadConversionService

        self.customer, _ = LeadConversionService._find_or_create_customer(
            phone="9822222222", email="apioffer@example.com", name="API Customer", source="ADMIN",
        )
        self.client.force_authenticate(user=self.admin)

    def _grants_url(self):
        return f"/api/v1/admin/growth/customers/{self.customer.id}/offer-grants/"

    # ── access control ───────────────────────────────────────────────────────

    def test_endpoints_require_authentication(self):
        self.client.force_authenticate(user=None)

        for url in (
            self._grants_url(),
            f"/api/v1/admin/growth/customers/{self.customer.id}/offer-candidates/",
            "/api/v1/admin/growth/offer-grants/pending/",
        ):
            response = self.client.get(url)
            self.assertIn(
                response.status_code,
                (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
                url,
            )

    # ── candidates ───────────────────────────────────────────────────────────

    def test_candidates_lists_matching_segment(self):
        response = self.client.get(
            f"/api/v1/admin/growth/customers/{self.customer.id}/offer-candidates/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        codes = {c["package_code"] for c in response.data["candidates"]}
        self.assertIn("API-OFFER", codes)

    # ── grant lifecycle ──────────────────────────────────────────────────────

    def test_request_creates_a_pending_grant(self):
        response = self.client.post(
            self._grants_url(), {"offer_package_id": self.package.id, "note": "loyal"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["status"], CustomerOfferGrantStatus.PENDING)
        self.assertFalse(response.data["is_live"])

    def test_request_without_package_is_a_400(self):
        response = self.client.post(self._grants_url(), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_request_is_a_400_not_a_500(self):
        self.client.post(self._grants_url(), {"offer_package_id": self.package.id}, format="json")

        response = self.client.post(
            self._grants_url(), {"offer_package_id": self.package.id}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

    def test_approval_makes_the_grant_live_and_is_recorded(self):
        created = self.client.post(
            self._grants_url(), {"offer_package_id": self.package.id}, format="json"
        )
        grant_id = created.data["id"]

        response = self.client.post(
            f"/api/v1/admin/growth/offer-grants/{grant_id}/decision/",
            {"approve": True, "decision_note": "approved by manager"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], CustomerOfferGrantStatus.APPROVED)
        self.assertTrue(response.data["is_live"])
        self.assertEqual(response.data["decided_by"], self.admin.username)

    def test_rejection_does_not_make_it_live(self):
        created = self.client.post(
            self._grants_url(), {"offer_package_id": self.package.id}, format="json"
        )

        response = self.client.post(
            f"/api/v1/admin/growth/offer-grants/{created.data['id']}/decision/",
            {"approve": False},
            format="json",
        )

        self.assertEqual(response.data["status"], CustomerOfferGrantStatus.REJECTED)
        self.assertFalse(response.data["is_live"])

    def test_deciding_twice_is_a_400(self):
        created = self.client.post(
            self._grants_url(), {"offer_package_id": self.package.id}, format="json"
        )
        url = f"/api/v1/admin/growth/offer-grants/{created.data['id']}/decision/"
        self.client.post(url, {"approve": True}, format="json")

        response = self.client.post(url, {"approve": True}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_decision_requires_the_approve_flag(self):
        created = self.client.post(
            self._grants_url(), {"offer_package_id": self.package.id}, format="json"
        )

        response = self.client.post(
            f"/api/v1/admin/growth/offer-grants/{created.data['id']}/decision/", {}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_withdraw_pulls_an_approved_grant(self):
        created = self.client.post(
            self._grants_url(), {"offer_package_id": self.package.id}, format="json"
        )
        grant_id = created.data["id"]
        self.client.post(
            f"/api/v1/admin/growth/offer-grants/{grant_id}/decision/", {"approve": True}, format="json"
        )

        response = self.client.post(
            f"/api/v1/admin/growth/offer-grants/{grant_id}/withdraw/", {}, format="json"
        )

        self.assertEqual(response.data["status"], CustomerOfferGrantStatus.WITHDRAWN)
        self.assertFalse(response.data["is_live"])

    # ── approval queue ───────────────────────────────────────────────────────

    def test_pending_queue_shows_only_undecided_grants(self):
        created = self.client.post(
            self._grants_url(), {"offer_package_id": self.package.id}, format="json"
        )

        queue = self.client.get("/api/v1/admin/growth/offer-grants/pending/")
        self.assertEqual(len(queue.data["results"]), 1)

        self.client.post(
            f"/api/v1/admin/growth/offer-grants/{created.data['id']}/decision/",
            {"approve": True}, format="json",
        )

        queue = self.client.get("/api/v1/admin/growth/offer-grants/pending/")
        self.assertEqual(len(queue.data["results"]), 0)


class CustomerSelfOfferApiTests(APITestCase):
    """The signed-in customer sees only what has actually been approved for them."""

    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="self_offer_admin", phone="9364000997")
        self.product = create_product(
            name="Self Sofa", product_code="SELFOFFER-001", base_price=Decimal("24000.00")
        )
        self.product.is_emi_enabled = True
        self.product.save(update_fields=["is_emi_enabled"])
        self.template = PlanTemplate.objects.create(
            template_code="EMI-SELF", name="EMI 12", plan_type=PlanTemplateType.EMI,
            tenure_months=12, is_active=True,
        )
        self.package = OfferPackage.objects.create(
            package_code="SELF-OFFER", name="Loyalty Offer", plan_template=self.template,
            status=OfferPackageStatus.ACTIVE, audience_type=OfferAudienceType.NEW_CUSTOMER,
            is_public_visible=True,
        )
        OfferPackageLine.objects.create(
            offer_package=self.package, product=self.product,
            discount_type=OfferDiscountType.PERCENT, discount_value=Decimal("25"),
        )
        # The customer pricing endpoint mirrors public catalogue visibility, so
        # the product's PIM record has to be published to be quotable.
        from products_pim.models import PimProduct

        PimProduct.objects.filter(source_product=self.product).update(is_published=True)

        self.user = create_customer_user(username="selfoffer_cust", phone="9833333333")
        self.customer = create_customer_profile(
            user=self.user, name="Self Offer Customer", phone="9833333333"
        )
        self.client.force_authenticate(user=self.user)

    def test_my_offers_is_empty_until_a_grant_is_approved(self):
        from growth.services.customer_offer_service import (
            decide_offer_grant,
            request_offer_grant,
        )

        response = self.client.get("/api/v1/customer/offers/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["count"], 0)

        grant = request_offer_grant(customer=self.customer, offer_package=self.package)
        response = self.client.get("/api/v1/customer/offers/")
        self.assertEqual(response.data["count"], 0, "pending grants are not the customer's yet")

        decide_offer_grant(grant=grant, approve=True, decided_by=self.admin)
        response = self.client.get("/api/v1/customer/offers/")
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["offers"][0]["name"], "Loyalty Offer")

    def test_my_offers_does_not_leak_internal_offer_configuration(self):
        from growth.services.customer_offer_service import (
            decide_offer_grant,
            request_offer_grant,
        )

        grant = request_offer_grant(customer=self.customer, offer_package=self.package)
        decide_offer_grant(grant=grant, approve=True, decided_by=self.admin)

        offer = self.client.get("/api/v1/customer/offers/").data["offers"][0]

        self.assertEqual(set(offer.keys()), {"name", "plan_type", "valid_until"})
        for leaked in ("package_code", "audience_type", "discount_value", "discount_type"):
            self.assertNotIn(leaked, offer)

    def test_personalised_pricing_reflects_an_approved_offer(self):
        from growth.services.customer_offer_service import (
            decide_offer_grant,
            request_offer_grant,
        )

        url = f"/api/v1/customer/products/{self.product.product_code}/pricing/"

        before = self.client.get(url)
        self.assertEqual(before.status_code, status.HTTP_200_OK, before.data)
        self.assertEqual(before.data["schemes"]["EMI"]["effective_price"], "24000.00")

        grant = request_offer_grant(customer=self.customer, offer_package=self.package)
        decide_offer_grant(grant=grant, approve=True, decided_by=self.admin)

        after = self.client.get(url)
        self.assertEqual(after.data["schemes"]["EMI"]["effective_price"], "18000.00")

    def test_unknown_product_is_a_404(self):
        response = self.client.get("/api/v1/customer/products/NOPE-999/pricing/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
