from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from growth.models import (
    OfferAudienceType,
    OfferDiscountType,
    OfferPackage,
    OfferPackageLine,
    OfferPackageStatus,
    PlanTemplate,
    PlanTemplateType,
)
from growth.services.scheme_pricing_service import (
    CASH,
    EMI,
    LEASE,
    RENT,
    TENURE_MAX,
    TENURE_MIN,
    deposit_percent_for_price,
    quote_product,
    quote_scheme,
    quote_tenure,
)
from tests.helpers import create_admin_user, create_product


class SchemePricingBaseTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="pricing_admin", phone="9364000994")
        self.product = create_product(
            name="Pricing Sofa",
            product_code="PRICE-001",
            base_price=Decimal("24000.00"),
        )
        self.product.is_emi_enabled = True
        self.product.is_rent_enabled = True
        self.product.is_lease_enabled = True
        self.product.save(update_fields=["is_emi_enabled", "is_rent_enabled", "is_lease_enabled"])

        self.emi_12 = PlanTemplate.objects.create(
            template_code="EMI-12", name="EMI 12", plan_type=PlanTemplateType.EMI,
            tenure_months=12, is_active=True,
        )
        self.emi_24 = PlanTemplate.objects.create(
            template_code="EMI-24", name="EMI 24", plan_type=PlanTemplateType.EMI,
            tenure_months=24, is_active=True,
        )
        self.rent_12 = PlanTemplate.objects.create(
            template_code="RENT-12", name="Rent 12", plan_type=PlanTemplateType.RENT,
            tenure_months=12, default_security_deposit_percent=Decimal("25.00"), is_active=True,
        )
        self.lease_24 = PlanTemplate.objects.create(
            template_code="LEASE-24", name="Lease 24", plan_type=PlanTemplateType.LEASE,
            tenure_months=24, default_security_deposit_percent=Decimal("20.00"), is_active=True,
        )

    def _package(self, template, *, code, discount_type=OfferDiscountType.NONE,
                 value=Decimal("0"), override=None, status=OfferPackageStatus.ACTIVE,
                 public=True, start=None, end=None, priority=100, product=None):
        pkg = OfferPackage.objects.create(
            package_code=code, name=code, plan_template=template, status=status,
            audience_type=OfferAudienceType.ALL, is_public_visible=public,
            start_date=start, end_date=end, display_priority=priority,
        )
        OfferPackageLine.objects.create(
            offer_package=pkg, product=product or self.product,
            discount_type=discount_type, discount_value=value, price_override=override,
        )
        return pkg


class SchemePricingCoreTests(SchemePricingBaseTests):
    def test_monthly_is_price_divided_by_tenure_with_no_markup(self):
        """Total payable must equal the cash price; longer tenure only shrinks the instalment."""
        emi = quote_scheme(self.product, EMI)

        self.assertTrue(emi.available)
        self.assertEqual(emi.effective_price, Decimal("24000.00"))
        by_tenure = {t.tenure_months: t for t in emi.tenures}
        self.assertEqual(by_tenure[12].monthly_amount, Decimal("2000.00"))
        self.assertEqual(by_tenure[24].monthly_amount, Decimal("1000.00"))
        # 24 x 1000 == 12 x 2000 == cash price: no scheme markup.
        self.assertEqual(by_tenure[24].monthly_amount * 24, Decimal("24000.00"))

    def test_rent_and_lease_carry_a_security_deposit_emi_and_cash_do_not(self):
        rent = quote_scheme(self.product, RENT).tenures[0]
        self.assertEqual(rent.security_deposit_percent, Decimal("25.00"))
        self.assertEqual(rent.security_deposit_amount, Decimal("6000.00"))  # 25% of 24000
        self.assertEqual(rent.upfront_total, Decimal("8000.00"))  # deposit + first month

        lease = quote_scheme(self.product, LEASE).tenures[0]
        self.assertEqual(lease.security_deposit_percent, Decimal("20.00"))
        self.assertEqual(lease.security_deposit_amount, Decimal("4800.00"))

        for t in quote_scheme(self.product, EMI).tenures:
            self.assertIsNone(t.security_deposit_amount)

        self.assertEqual(quote_scheme(self.product, CASH).tenures, [])

    def test_deposit_percent_is_clamped_to_the_contract_allowed_range(self):
        """The contract model hard-limits 20-30; a stray template must not escape it."""
        self.rent_12.default_security_deposit_percent = Decimal("80.00")
        self.rent_12.save(update_fields=["default_security_deposit_percent"])

        self.assertEqual(
            quote_scheme(self.product, RENT).tenures[0].security_deposit_percent,
            Decimal("30.00"),
        )

        self.rent_12.default_security_deposit_percent = Decimal("5.00")
        self.rent_12.save(update_fields=["default_security_deposit_percent"])
        self.assertEqual(
            quote_scheme(self.product, RENT).tenures[0].security_deposit_percent,
            Decimal("20.00"),
        )

    def test_scheme_is_unavailable_when_product_flag_is_off(self):
        self.product.is_rent_enabled = False
        self.product.save(update_fields=["is_rent_enabled"])

        rent = quote_scheme(self.product, RENT)
        self.assertFalse(rent.available)
        self.assertIn("not enabled", rent.unavailable_reason)

    def test_scheme_stays_available_with_preset_tenures_when_nothing_is_configured(self):
        """
        Production has no PlanTemplates and no batches. An empty config table
        must never blank out the public catalogue.
        """
        PlanTemplate.objects.all().delete()

        emi = quote_scheme(self.product, EMI)
        self.assertTrue(emi.available)
        self.assertEqual([t.tenure_months for t in emi.tenures], [6, 12, 24, 36])
        self.assertEqual({t.monthly_amount for t in emi.tenures if t.tenure_months == 12}, {Decimal("2000.00")})


class DepositBandTests(SchemePricingBaseTests):
    """Cheaper item = lower deposit %: under 20k -> 20%, 20-50k -> 25%, over 50k -> 30%."""

    def test_band_boundaries(self):
        self.assertEqual(deposit_percent_for_price(Decimal("9999.00")), Decimal("20.00"))
        self.assertEqual(deposit_percent_for_price(Decimal("19999.99")), Decimal("20.00"))
        self.assertEqual(deposit_percent_for_price(Decimal("20000.00")), Decimal("25.00"))
        self.assertEqual(deposit_percent_for_price(Decimal("50000.00")), Decimal("25.00"))
        self.assertEqual(deposit_percent_for_price(Decimal("50000.01")), Decimal("30.00"))
        self.assertEqual(deposit_percent_for_price(Decimal("120000.00")), Decimal("30.00"))

    def test_every_band_stays_inside_the_contract_allowed_range(self):
        for price in ("1000", "19999", "20000", "50000", "50001", "999999"):
            pct = deposit_percent_for_price(Decimal(price))
            self.assertGreaterEqual(pct, Decimal("20.00"))
            self.assertLessEqual(pct, Decimal("30.00"))

    def test_deposit_follows_the_band_when_no_template_configures_it(self):
        PlanTemplate.objects.all().delete()

        cheap = create_product(name="Cheap", product_code="BAND-LOW", base_price=Decimal("10000.00"))
        cheap.is_rent_enabled = True
        cheap.save(update_fields=["is_rent_enabled"])
        rent = quote_scheme(cheap, RENT).tenures[0]
        self.assertEqual(rent.security_deposit_percent, Decimal("20.00"))
        self.assertEqual(rent.security_deposit_amount, Decimal("2000.00"))

        pricey = create_product(name="Pricey", product_code="BAND-HIGH", base_price=Decimal("60000.00"))
        pricey.is_rent_enabled = True
        pricey.save(update_fields=["is_rent_enabled"])
        rent = quote_scheme(pricey, RENT).tenures[0]
        self.assertEqual(rent.security_deposit_percent, Decimal("30.00"))
        self.assertEqual(rent.security_deposit_amount, Decimal("18000.00"))


class CustomerTypedTenureTests(SchemePricingBaseTests):
    def test_any_tenure_in_range_can_be_quoted(self):
        q = quote_tenure(EMI, Decimal("24000.00"), 7)
        self.assertEqual(q.tenure_months, 7)
        self.assertEqual(q.monthly_amount, Decimal("3428.57"))

    def test_typed_rent_tenure_gets_the_banded_deposit(self):
        q = quote_tenure(RENT, Decimal("24000.00"), 9)
        self.assertEqual(q.security_deposit_percent, Decimal("25.00"))
        self.assertEqual(q.security_deposit_amount, Decimal("6000.00"))
        self.assertEqual(q.upfront_total, Decimal("8666.67"))  # 6000 + 2666.67

    def test_tenure_outside_the_allowed_range_is_rejected(self):
        for bad in (0, TENURE_MIN - 1, TENURE_MAX + 1, 999):
            with self.assertRaises(ValueError):
                quote_tenure(EMI, Decimal("24000.00"), bad)


class SchemePricingDiscountTests(SchemePricingBaseTests):
    def test_percent_discount_applies_and_flows_into_the_instalment(self):
        self._package(self.emi_12, code="EMI-10PC", discount_type=OfferDiscountType.PERCENT,
                      value=Decimal("10"))

        emi = quote_scheme(self.product, EMI)
        self.assertEqual(emi.effective_price, Decimal("21600.00"))
        self.assertEqual(emi.discount.amount_off, Decimal("2400.00"))
        by_tenure = {t.tenure_months: t for t in emi.tenures}
        self.assertEqual(by_tenure[12].monthly_amount, Decimal("1800.00"))

    def test_flat_discount_and_price_override(self):
        self._package(self.emi_12, code="EMI-FLAT", discount_type=OfferDiscountType.FLAT,
                      value=Decimal("4000"))
        self.assertEqual(quote_scheme(self.product, EMI).effective_price, Decimal("20000.00"))

        OfferPackage.objects.filter(package_code="EMI-FLAT").delete()
        self._package(self.emi_12, code="EMI-OVR", override=Decimal("19999.00"))
        self.assertEqual(quote_scheme(self.product, EMI).effective_price, Decimal("19999.00"))

    def test_discount_is_scoped_to_its_own_scheme(self):
        """A discount on the EMI template must not change rent, lease or cash."""
        self._package(self.emi_12, code="EMI-ONLY", discount_type=OfferDiscountType.PERCENT,
                      value=Decimal("25"))

        self.assertEqual(quote_scheme(self.product, EMI).effective_price, Decimal("18000.00"))
        self.assertEqual(quote_scheme(self.product, RENT).effective_price, Decimal("24000.00"))
        self.assertEqual(quote_scheme(self.product, LEASE).effective_price, Decimal("24000.00"))
        self.assertEqual(quote_scheme(self.product, CASH).effective_price, Decimal("24000.00"))

    def test_discount_is_scoped_to_its_own_product(self):
        other = create_product(name="Other", product_code="PRICE-002", base_price=Decimal("24000.00"))
        other.is_emi_enabled = True
        other.save(update_fields=["is_emi_enabled"])
        self._package(self.emi_12, code="EMI-THISONLY", discount_type=OfferDiscountType.PERCENT,
                      value=Decimal("50"))

        self.assertEqual(quote_scheme(self.product, EMI).effective_price, Decimal("12000.00"))
        self.assertEqual(quote_scheme(other, EMI).effective_price, Decimal("24000.00"))

    def test_best_of_several_competing_offers_wins(self):
        self._package(self.emi_12, code="EMI-5PC", discount_type=OfferDiscountType.PERCENT,
                      value=Decimal("5"), priority=1)
        self._package(self.emi_24, code="EMI-20PC", discount_type=OfferDiscountType.PERCENT,
                      value=Decimal("20"), priority=99)

        emi = quote_scheme(self.product, EMI)
        self.assertEqual(emi.effective_price, Decimal("19200.00"))
        self.assertEqual(emi.discount.package_code, "EMI-20PC")

    def test_discount_can_never_push_the_price_below_zero(self):
        self._package(self.emi_12, code="EMI-HUGE", discount_type=OfferDiscountType.FLAT,
                      value=Decimal("999999"))

        emi = quote_scheme(self.product, EMI)
        self.assertEqual(emi.effective_price, Decimal("0.00"))
        self.assertGreaterEqual(emi.effective_price, Decimal("0"))

    def test_a_discount_that_raises_the_price_is_ignored(self):
        self._package(self.emi_12, code="EMI-BAD", override=Decimal("50000.00"))

        emi = quote_scheme(self.product, EMI)
        self.assertEqual(emi.effective_price, Decimal("24000.00"))
        self.assertIsNone(emi.discount)


class SchemePricingCampaignWindowTests(SchemePricingBaseTests):
    def test_campaign_applies_only_inside_its_date_window(self):
        today = timezone.localdate()
        self._package(self.emi_12, code="EMI-WINDOW", discount_type=OfferDiscountType.PERCENT,
                      value=Decimal("50"), start=today - timedelta(days=1),
                      end=today + timedelta(days=1))
        self.assertEqual(quote_scheme(self.product, EMI).effective_price, Decimal("12000.00"))

    def test_expired_and_future_campaigns_are_ignored(self):
        today = timezone.localdate()
        self._package(self.emi_12, code="EMI-PAST", discount_type=OfferDiscountType.PERCENT,
                      value=Decimal("50"), start=today - timedelta(days=30),
                      end=today - timedelta(days=1))
        self.assertEqual(quote_scheme(self.product, EMI).effective_price, Decimal("24000.00"))

        OfferPackage.objects.filter(package_code="EMI-PAST").delete()
        self._package(self.emi_12, code="EMI-FUTURE", discount_type=OfferDiscountType.PERCENT,
                      value=Decimal("50"), start=today + timedelta(days=5))
        self.assertEqual(quote_scheme(self.product, EMI).effective_price, Decimal("24000.00"))

    def test_non_active_or_non_public_packages_are_ignored(self):
        self._package(self.emi_12, code="EMI-DRAFT", discount_type=OfferDiscountType.PERCENT,
                      value=Decimal("50"), status=OfferPackageStatus.DRAFT)
        self.assertEqual(quote_scheme(self.product, EMI).effective_price, Decimal("24000.00"))

        OfferPackage.objects.filter(package_code="EMI-DRAFT").delete()
        self._package(self.emi_12, code="EMI-HIDDEN", discount_type=OfferDiscountType.PERCENT,
                      value=Decimal("50"), public=False)
        self.assertEqual(quote_scheme(self.product, EMI).effective_price, Decimal("24000.00"))


class QuoteProductPayloadTests(SchemePricingBaseTests):
    def test_payload_lists_every_scheme_and_the_lowest_monthly(self):
        payload = quote_product(self.product)

        self.assertEqual(payload["product_code"], "PRICE-001")
        self.assertEqual(payload["cash_price"], "24000.00")
        self.assertEqual(set(payload["schemes"]), {CASH, EMI, RENT, LEASE})
        self.assertCountEqual(payload["available_schemes"], [CASH, EMI, RENT, LEASE])
        # Cheapest instalment across all schemes: 24-month EMI / lease at 1000.
        self.assertEqual(payload["lowest_monthly"], "1000.00")

    def test_unpriced_product_reports_no_schemes(self):
        blueprint = create_product(name="Blueprint", product_code="PRICE-000", base_price=Decimal("0"))
        payload = quote_product(blueprint)

        self.assertEqual(payload["available_schemes"], [])
        self.assertIsNone(payload["lowest_monthly"])
        self.assertFalse(payload["schemes"][CASH]["available"])

    def test_payload_carries_the_rules_the_page_needs_to_recalculate(self):
        rules = quote_product(self.product)["rules"]

        self.assertEqual(rules["tenure_min"], TENURE_MIN)
        self.assertEqual(rules["tenure_max"], TENURE_MAX)
        self.assertEqual(rules["tenure_presets"], [6, 12, 24, 36])
        self.assertEqual(sorted(rules["deposit_schemes"]), [LEASE, RENT])
        self.assertEqual([b["percent"] for b in rules["deposit_bands"]], ["20.00", "25.00", "30.00"])
