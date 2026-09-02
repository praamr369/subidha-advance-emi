from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from growth.models import (
    CustomerOfferGrant,
    CustomerOfferGrantStatus,
    OfferAudienceType,
    OfferDiscountType,
    OfferPackage,
    OfferPackageLine,
    OfferPackageStatus,
    PlanTemplate,
    PlanTemplateType,
)
from growth.services.customer_offer_service import (
    customer_matches_segment,
    decide_offer_grant,
    list_candidate_offers,
    live_grants_for,
    request_offer_grant,
    withdraw_offer_grant,
)
from growth.services.scheme_pricing_service import EMI, quote_scheme
from tests.helpers import create_admin_user, create_product


class CustomerOfferBase(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="offer_admin", phone="9364000995")
        self.product = create_product(
            name="Offer Sofa", product_code="OFFER-001", base_price=Decimal("24000.00")
        )
        self.product.is_emi_enabled = True
        self.product.save(update_fields=["is_emi_enabled"])

        self.template = PlanTemplate.objects.create(
            template_code="EMI-12-OFFER", name="EMI 12", plan_type=PlanTemplateType.EMI,
            tenure_months=12, is_active=True,
        )
        from crm.services.lead_conversion_service import LeadConversionService

        self.customer, _ = LeadConversionService._find_or_create_customer(
            phone="9811111111", email="offer@example.com", name="Offer Customer", source="ADMIN",
        )

    def _package(self, code, audience=OfferAudienceType.ALL, percent=Decimal("25"),
                 status=OfferPackageStatus.ACTIVE, public=True):
        pkg = OfferPackage.objects.create(
            package_code=code, name=code, plan_template=self.template, status=status,
            audience_type=audience, is_public_visible=public,
        )
        OfferPackageLine.objects.create(
            offer_package=pkg, product=self.product,
            discount_type=OfferDiscountType.PERCENT, discount_value=percent,
        )
        return pkg


class SegmentMatchingTests(CustomerOfferBase):
    """
    The previous implementation returned True on every path, so an offer aimed
    at one segment silently applied to everybody. These pin the real behaviour.
    """

    def test_all_matches_anyone_including_anonymous(self):
        self.assertTrue(customer_matches_segment(self.customer, OfferAudienceType.ALL)[0])
        self.assertTrue(customer_matches_segment(None, OfferAudienceType.ALL)[0])

    def test_targeted_segments_never_match_an_anonymous_visitor(self):
        for audience in (
            OfferAudienceType.NEW_CUSTOMER,
            OfferAudienceType.EXISTING_CUSTOMER,
            OfferAudienceType.PARTNER_REFERRED,
            OfferAudienceType.HIGH_TRUST_CUSTOMER,
        ):
            matches, reason = customer_matches_segment(None, audience)
            self.assertFalse(matches, audience)
            self.assertIn("no customer", reason.lower())

    def test_new_customer_segment(self):
        matches, _ = customer_matches_segment(self.customer, OfferAudienceType.NEW_CUSTOMER)
        self.assertTrue(matches)

    def test_existing_customer_segment_excludes_a_customer_with_no_contracts(self):
        matches, reason = customer_matches_segment(
            self.customer, OfferAudienceType.EXISTING_CUSTOMER
        )
        self.assertFalse(matches)
        self.assertIn("no contracts", reason)

    def test_partner_referred_excludes_a_customer_with_no_referral(self):
        matches, reason = customer_matches_segment(
            self.customer, OfferAudienceType.PARTNER_REFERRED
        )
        self.assertFalse(matches)
        self.assertIn("partner", reason.lower())

    def test_unknown_audience_fails_closed(self):
        matches, reason = customer_matches_segment(self.customer, "SOMETHING_NEW")
        self.assertFalse(matches)
        self.assertIn("Unrecognised", reason)


class GrantLifecycleTests(CustomerOfferBase):
    def test_a_new_grant_starts_pending(self):
        pkg = self._package("OFF-PENDING", audience=OfferAudienceType.NEW_CUSTOMER)

        grant = request_offer_grant(
            customer=self.customer, offer_package=pkg, requested_by=self.admin
        )

        self.assertEqual(grant.status, CustomerOfferGrantStatus.PENDING)
        self.assertIsNone(grant.decided_at)

    def test_approval_records_who_decided(self):
        pkg = self._package("OFF-APPROVE", audience=OfferAudienceType.NEW_CUSTOMER)
        grant = request_offer_grant(customer=self.customer, offer_package=pkg)

        decide_offer_grant(grant=grant, approve=True, decided_by=self.admin, decision_note="ok")

        grant.refresh_from_db()
        self.assertEqual(grant.status, CustomerOfferGrantStatus.APPROVED)
        self.assertEqual(grant.decided_by, self.admin)
        self.assertIsNotNone(grant.decided_at)

    def test_a_decision_must_name_a_decider(self):
        pkg = self._package("OFF-NODECIDER", audience=OfferAudienceType.NEW_CUSTOMER)
        grant = request_offer_grant(customer=self.customer, offer_package=pkg)

        with self.assertRaises(ValidationError):
            decide_offer_grant(grant=grant, approve=True, decided_by=None)

    def test_only_a_pending_grant_can_be_decided(self):
        pkg = self._package("OFF-TWICE", audience=OfferAudienceType.NEW_CUSTOMER)
        grant = request_offer_grant(customer=self.customer, offer_package=pkg)
        decide_offer_grant(grant=grant, approve=True, decided_by=self.admin)

        with self.assertRaises(ValidationError):
            decide_offer_grant(grant=grant, approve=True, decided_by=self.admin)

    def test_duplicate_live_grant_is_refused(self):
        pkg = self._package("OFF-DUP", audience=OfferAudienceType.NEW_CUSTOMER)
        request_offer_grant(customer=self.customer, offer_package=pkg)

        with self.assertRaises(ValidationError):
            request_offer_grant(customer=self.customer, offer_package=pkg)

    def test_withdrawing_frees_the_customer_to_be_granted_again(self):
        pkg = self._package("OFF-WITHDRAW", audience=OfferAudienceType.NEW_CUSTOMER)
        grant = request_offer_grant(customer=self.customer, offer_package=pkg)
        decide_offer_grant(grant=grant, approve=True, decided_by=self.admin)

        withdraw_offer_grant(grant=grant, decided_by=self.admin, decision_note="pulled")

        grant.refresh_from_db()
        self.assertEqual(grant.status, CustomerOfferGrantStatus.WITHDRAWN)
        self.assertEqual(live_grants_for(self.customer), [])
        request_offer_grant(customer=self.customer, offer_package=pkg)  # no longer blocked


class GrantPricingTests(CustomerOfferBase):
    """A price only moves once a person has approved the grant."""

    def _emi_price(self, customer=None) -> Decimal:
        return quote_scheme(self.product, EMI, customer=customer).effective_price

    def test_segment_offer_does_not_apply_before_approval(self):
        pkg = self._package("OFF-GATE", audience=OfferAudienceType.NEW_CUSTOMER)

        self.assertEqual(self._emi_price(self.customer), Decimal("24000.00"))

        request_offer_grant(customer=self.customer, offer_package=pkg)
        self.assertEqual(
            self._emi_price(self.customer), Decimal("24000.00"), "pending must not discount"
        )

    def test_approved_grant_moves_the_price_for_that_customer_only(self):
        pkg = self._package("OFF-APPLIES", audience=OfferAudienceType.NEW_CUSTOMER)
        grant = request_offer_grant(customer=self.customer, offer_package=pkg)
        decide_offer_grant(grant=grant, approve=True, decided_by=self.admin)

        self.assertEqual(self._emi_price(self.customer), Decimal("18000.00"))
        # Anonymous pricing is untouched.
        self.assertEqual(self._emi_price(None), Decimal("24000.00"))

    def test_rejected_and_withdrawn_grants_do_not_discount(self):
        pkg = self._package("OFF-REJECT", audience=OfferAudienceType.NEW_CUSTOMER)
        grant = request_offer_grant(customer=self.customer, offer_package=pkg)
        decide_offer_grant(grant=grant, approve=False, decided_by=self.admin)
        self.assertEqual(self._emi_price(self.customer), Decimal("24000.00"))

        grant2 = request_offer_grant(customer=self.customer, offer_package=pkg)
        decide_offer_grant(grant=grant2, approve=True, decided_by=self.admin)
        withdraw_offer_grant(grant=grant2, decided_by=self.admin)
        self.assertEqual(self._emi_price(self.customer), Decimal("24000.00"))

    def test_expired_grant_stops_applying(self):
        pkg = self._package("OFF-EXPIRES", audience=OfferAudienceType.NEW_CUSTOMER)
        grant = request_offer_grant(
            customer=self.customer,
            offer_package=pkg,
            expires_on=timezone.localdate() - timedelta(days=1),
        )
        decide_offer_grant(grant=grant, approve=True, decided_by=self.admin)

        self.assertEqual(self._emi_price(self.customer), Decimal("24000.00"))
        self.assertEqual(live_grants_for(self.customer), [])

    def test_public_offer_still_applies_to_everyone_without_a_grant(self):
        self._package("OFF-PUBLIC", audience=OfferAudienceType.ALL, percent=Decimal("10"))

        self.assertEqual(self._emi_price(None), Decimal("21600.00"))
        self.assertEqual(self._emi_price(self.customer), Decimal("21600.00"))

    def test_segment_offer_never_leaks_into_anonymous_pricing(self):
        """The regression that mattered: a targeted offer must not discount the public page."""
        self._package("OFF-TARGETED", audience=OfferAudienceType.HIGH_TRUST_CUSTOMER,
                      percent=Decimal("50"))

        self.assertEqual(self._emi_price(None), Decimal("24000.00"))
        self.assertEqual(self._emi_price(self.customer), Decimal("24000.00"))


class CandidateListingTests(CustomerOfferBase):
    def test_lists_only_segments_the_customer_matches(self):
        self._package("CAND-NEW", audience=OfferAudienceType.NEW_CUSTOMER)
        self._package("CAND-EXISTING", audience=OfferAudienceType.EXISTING_CUSTOMER)

        codes = {c["package_code"] for c in list_candidate_offers(self.customer)}

        self.assertIn("CAND-NEW", codes)
        self.assertNotIn("CAND-EXISTING", codes)

    def test_marks_offers_the_customer_already_holds(self):
        pkg = self._package("CAND-HELD", audience=OfferAudienceType.NEW_CUSTOMER)
        request_offer_grant(customer=self.customer, offer_package=pkg)

        entry = next(c for c in list_candidate_offers(self.customer) if c["package_code"] == "CAND-HELD")

        self.assertTrue(entry["already_held"])
        self.assertTrue(entry["requires_approval"])

    def test_draft_and_out_of_window_packages_are_not_candidates(self):
        self._package("CAND-DRAFT", audience=OfferAudienceType.NEW_CUSTOMER,
                      status=OfferPackageStatus.DRAFT)
        expired = self._package("CAND-EXPIRED", audience=OfferAudienceType.NEW_CUSTOMER)
        expired.end_date = timezone.localdate() - timedelta(days=1)
        expired.save(update_fields=["end_date"])

        codes = {c["package_code"] for c in list_candidate_offers(self.customer)}

        self.assertNotIn("CAND-DRAFT", codes)
        self.assertNotIn("CAND-EXPIRED", codes)
