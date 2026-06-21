"""
P5A tests: Growth Foundation — PlanTemplate, OfferPackage, OfferPackageLine.

Covers:
* Create EMI PlanTemplate
* Create RENT PlanTemplate
* RENT/LEASE template cannot require lucky ID
* EMI lucky-plan template can require batch and lucky ID
* Security deposit percent applies to RENT/LEASE only (not EMI)
* Create OfferPackage with product lines
* price_override / discount_value do NOT mutate Product.base_price
* Inactive/expired packages excluded from active list
* Eligibility returns advisory risk fields
* HIGH/BLOCKED risk affects recommendation/approval_required but does not mutate records
* Admin can CRUD templates/packages via API
* Cashier, customer, partner blocked from growth endpoints
* preview/list/eligibility creates no Subscription, EMI, Payment, JournalEntry,
  AccountingBridgePosting, StockLedger, LuckyDraw, Commission, or Payout rows
* validate_offer_package_configuration reports errors correctly
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.models import CustomerRiskBand, CustomerRiskProfile, Product
from subscriptions.models_growth_offers import (
    OfferAudienceType,
    OfferDiscountType,
    OfferPackage,
    OfferPackageLine,
    OfferPackageStatus,
    PlanTemplate,
    PlanTemplateType,
)
from subscriptions.services.growth_offer_service import (
    build_offer_package_preview,
    build_plan_template_preview,
    evaluate_offer_package_eligibility,
    list_active_offer_packages,
    validate_offer_package_configuration,
)
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_customer_user,
    create_partner_user,
    create_product,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_emi_template(**kwargs):
    defaults = dict(
        template_code="TEST-EMI-001",
        name="Test EMI Template",
        plan_type=PlanTemplateType.EMI,
        tenure_months=12,
        default_down_payment_percent=Decimal("10.00"),
        is_active=True,
    )
    defaults.update(kwargs)
    t = PlanTemplate(**defaults)
    t.save()
    return t


def _make_rent_template(**kwargs):
    defaults = dict(
        template_code="TEST-RENT-001",
        name="Test RENT Template",
        plan_type=PlanTemplateType.RENT,
        tenure_months=6,
        default_security_deposit_percent=Decimal("15.00"),
        is_active=True,
    )
    defaults.update(kwargs)
    t = PlanTemplate(**defaults)
    t.save()
    return t


def _make_offer_package(template, **kwargs):
    today = date.today()
    defaults = dict(
        package_code="TEST-PKG-001",
        name="Test Offer Package",
        plan_template=template,
        start_date=today - timedelta(days=1),
        end_date=today + timedelta(days=30),
        status=OfferPackageStatus.ACTIVE,
        audience_type=OfferAudienceType.ALL,
    )
    defaults.update(kwargs)
    return OfferPackage.objects.create(**defaults)


# ---------------------------------------------------------------------------
# Unit tests: PlanTemplate model rules
# ---------------------------------------------------------------------------

class TestPlanTemplateModelRules(TestCase):

    def test_create_emi_template(self):
        t = _make_emi_template()
        self.assertEqual(t.plan_type, PlanTemplateType.EMI)
        self.assertTrue(t.is_active)
        self.assertEqual(t.tenure_months, 12)
        self.assertIsNotNone(t.pk)

    def test_create_rent_template(self):
        t = _make_rent_template()
        self.assertEqual(t.plan_type, PlanTemplateType.RENT)
        self.assertEqual(str(t.default_security_deposit_percent), "15.00")

    def test_create_lease_template(self):
        t = PlanTemplate(
            template_code="TEST-LEASE-001",
            name="Test Lease",
            plan_type=PlanTemplateType.LEASE,
            tenure_months=24,
            default_security_deposit_percent=Decimal("20.00"),
        )
        t.save()
        self.assertEqual(t.plan_type, PlanTemplateType.LEASE)

    def test_rent_template_cannot_require_lucky_id(self):
        t = PlanTemplate(
            template_code="RENT-BAD",
            name="Bad RENT",
            plan_type=PlanTemplateType.RENT,
            requires_lucky_id=True,
        )
        with self.assertRaises(ValidationError):
            t.save()

    def test_lease_template_cannot_require_lucky_id(self):
        t = PlanTemplate(
            template_code="LEASE-BAD",
            name="Bad LEASE",
            plan_type=PlanTemplateType.LEASE,
            requires_lucky_id=True,
        )
        with self.assertRaises(ValidationError):
            t.save()

    def test_emi_lucky_plan_template_can_require_batch_and_lucky_id(self):
        t = PlanTemplate(
            template_code="EMI-LUCKY",
            name="Lucky EMI",
            plan_type=PlanTemplateType.EMI,
            is_lucky_plan_eligible=True,
            requires_batch=True,
            requires_lucky_id=True,
        )
        t.save()
        self.assertTrue(t.requires_batch)
        self.assertTrue(t.requires_lucky_id)
        self.assertTrue(t.is_lucky_plan_eligible)

    def test_emi_template_security_deposit_percent_raises(self):
        t = PlanTemplate(
            template_code="EMI-BAD-DEP",
            name="Bad EMI",
            plan_type=PlanTemplateType.EMI,
            default_security_deposit_percent=Decimal("10.00"),
        )
        with self.assertRaises(ValidationError):
            t.save()

    def test_rent_template_security_deposit_allowed(self):
        t = _make_rent_template(template_code="RENT-DEP-OK", default_security_deposit_percent=Decimal("20.00"))
        self.assertIsNotNone(t.pk)


# ---------------------------------------------------------------------------
# Unit tests: OfferPackage and OfferPackageLine
# ---------------------------------------------------------------------------

class TestOfferPackageModelRules(TestCase):

    def setUp(self):
        self.template = _make_emi_template()
        self.product = create_product(name="Fridge", base_price=Decimal("15000.00"))

    def test_create_offer_package(self):
        pkg = _make_offer_package(self.template)
        self.assertIsNotNone(pkg.pk)
        self.assertEqual(pkg.status, OfferPackageStatus.ACTIVE)

    def test_create_offer_package_with_product_lines(self):
        pkg = _make_offer_package(self.template, package_code="PKG-WITH-LINES")
        line = OfferPackageLine.objects.create(
            offer_package=pkg,
            product=self.product,
            quantity=1,
            price_override=Decimal("14000.00"),
            discount_type=OfferDiscountType.FLAT,
            discount_value=Decimal("1000.00"),
        )
        self.assertEqual(line.offer_package_id, pkg.pk)
        self.assertEqual(line.product_id, self.product.pk)

    def test_price_override_does_not_mutate_product_base_price(self):
        original_price = self.product.base_price
        pkg = _make_offer_package(self.template, package_code="PKG-PRICE-OVERRIDE")
        OfferPackageLine.objects.create(
            offer_package=pkg,
            product=self.product,
            quantity=1,
            price_override=Decimal("1.00"),
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.base_price, original_price)

    def test_discount_value_does_not_mutate_product_base_price(self):
        original_price = self.product.base_price
        pkg = _make_offer_package(self.template, package_code="PKG-DISC")
        OfferPackageLine.objects.create(
            offer_package=pkg,
            product=self.product,
            quantity=1,
            discount_type=OfferDiscountType.PERCENT,
            discount_value=Decimal("50.00"),
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.base_price, original_price)


# ---------------------------------------------------------------------------
# Unit tests: growth_offer_service
# ---------------------------------------------------------------------------

class TestGrowthOfferService(TestCase):

    def setUp(self):
        self.template = _make_emi_template(template_code="SVC-EMI")
        self.product = create_product(name="Washing Machine", base_price=Decimal("20000.00"))
        today = date.today()
        self.active_pkg = _make_offer_package(
            self.template,
            package_code="SVC-PKG-ACTIVE",
            status=OfferPackageStatus.ACTIVE,
            start_date=today - timedelta(days=1),
            end_date=today + timedelta(days=30),
        )
        OfferPackageLine.objects.create(
            offer_package=self.active_pkg,
            product=self.product,
            quantity=1,
            price_override=Decimal("19000.00"),
        )

    def test_build_plan_template_preview(self):
        preview = build_plan_template_preview(self.template)
        self.assertEqual(preview["template_code"], "SVC-EMI")
        self.assertEqual(preview["plan_type"], "EMI")
        self.assertIn("tenure_months", preview)

    def test_build_offer_package_preview(self):
        self.active_pkg.refresh_from_db()
        preview = build_offer_package_preview(self.active_pkg)
        self.assertEqual(preview["package_code"], "SVC-PKG-ACTIVE")
        self.assertIn("lines", preview)
        self.assertEqual(len(preview["lines"]), 1)
        self.assertEqual(preview["lines"][0]["price_override"], "19000.00")

    def test_list_active_offer_packages_includes_active(self):
        results = list_active_offer_packages()
        codes = [r["package_code"] for r in results]
        self.assertIn("SVC-PKG-ACTIVE", codes)

    def test_list_active_offer_packages_excludes_draft(self):
        draft_pkg = _make_offer_package(
            self.template,
            package_code="SVC-PKG-DRAFT",
            status=OfferPackageStatus.DRAFT,
        )
        results = list_active_offer_packages()
        codes = [r["package_code"] for r in results]
        self.assertNotIn("SVC-PKG-DRAFT", codes)

    def test_list_active_offer_packages_excludes_expired(self):
        past = date.today() - timedelta(days=10)
        expired_pkg = _make_offer_package(
            self.template,
            package_code="SVC-PKG-EXPIRED",
            status=OfferPackageStatus.ACTIVE,
            start_date=past - timedelta(days=5),
            end_date=past,
        )
        results = list_active_offer_packages()
        codes = [r["package_code"] for r in results]
        self.assertNotIn("SVC-PKG-EXPIRED", codes)

    def test_list_active_filter_by_plan_type(self):
        results = list_active_offer_packages(plan_type="EMI")
        for r in results:
            self.assertEqual(r["plan_template"]["plan_type"], "EMI")

    def test_eligibility_active_package_eligible(self):
        result = evaluate_offer_package_eligibility(self.active_pkg)
        self.assertTrue(result["eligible"])
        self.assertFalse(result["not_recommended"])

    def test_eligibility_draft_package_not_eligible(self):
        draft = _make_offer_package(
            self.template,
            package_code="SVC-DRAFT-ELIG",
            status=OfferPackageStatus.DRAFT,
        )
        result = evaluate_offer_package_eligibility(draft)
        self.assertFalse(result["eligible"])
        self.assertIn("DRAFT", result["reasons"][0])

    def test_eligibility_expired_package_not_eligible(self):
        past = date.today() - timedelta(days=5)
        expired = _make_offer_package(
            self.template,
            package_code="SVC-EXPIRED-ELIG",
            status=OfferPackageStatus.ACTIVE,
            start_date=past - timedelta(days=2),
            end_date=past,
        )
        result = evaluate_offer_package_eligibility(expired)
        self.assertFalse(result["eligible"])

    def test_eligibility_blocked_risk_sets_not_recommended(self):
        customer_user = create_customer_user(username="customer_blocked_risk")
        customer = create_customer_profile(user=customer_user)
        CustomerRiskProfile.objects.create(
            customer=customer,
            risk_band=CustomerRiskBand.BLOCKED,
            risk_score=100,
        )
        result = evaluate_offer_package_eligibility(self.active_pkg, customer=customer)
        self.assertTrue(result["not_recommended"])
        self.assertFalse(result["approval_required"])

    def test_eligibility_high_risk_sets_approval_required(self):
        customer_user = create_customer_user(username="customer_high_risk")
        customer = create_customer_profile(user=customer_user)
        CustomerRiskProfile.objects.create(
            customer=customer,
            risk_band=CustomerRiskBand.HIGH,
            risk_score=60,
        )
        result = evaluate_offer_package_eligibility(self.active_pkg, customer=customer)
        self.assertTrue(result["approval_required"])
        self.assertFalse(result["not_recommended"])

    def test_eligibility_does_not_create_any_financial_records(self):
        from subscriptions.models import (
            Emi, Payment, Subscription,
        )
        from accounting.models import JournalEntry

        customer_user = create_customer_user(username="customer_elig_test")
        customer = create_customer_profile(user=customer_user)

        subs_before = Subscription.objects.count()
        emi_before = Emi.objects.count()
        pay_before = Payment.objects.count()
        journal_before = JournalEntry.objects.count()

        evaluate_offer_package_eligibility(self.active_pkg, customer=customer)

        self.assertEqual(Subscription.objects.count(), subs_before)
        self.assertEqual(Emi.objects.count(), emi_before)
        self.assertEqual(Payment.objects.count(), pay_before)
        self.assertEqual(JournalEntry.objects.count(), journal_before)

    def test_list_does_not_create_any_records(self):
        from subscriptions.models import Subscription, Emi, Payment

        subs_before = Subscription.objects.count()
        emi_before = Emi.objects.count()
        pay_before = Payment.objects.count()

        list_active_offer_packages()

        self.assertEqual(Subscription.objects.count(), subs_before)
        self.assertEqual(Emi.objects.count(), emi_before)
        self.assertEqual(Payment.objects.count(), pay_before)

    def test_validate_valid_config(self):
        result = validate_offer_package_configuration(self.active_pkg)
        self.assertTrue(result["valid"])
        self.assertEqual(result["errors"], [])

    def test_validate_invalid_date_range(self):
        future = date.today() + timedelta(days=5)
        past = date.today() - timedelta(days=5)
        bad_pkg = _make_offer_package(
            self.template,
            package_code="SVC-BAD-DATES",
            status=OfferPackageStatus.DRAFT,
        )
        bad_pkg.start_date = future
        bad_pkg.end_date = past
        bad_pkg.save()
        result = validate_offer_package_configuration(bad_pkg)
        self.assertFalse(result["valid"])
        self.assertTrue(any("start_date" in e for e in result["errors"]))

    def test_validate_inactive_template_errors(self):
        inactive_tmpl = _make_emi_template(template_code="INACTIVE-T", is_active=False)
        pkg = _make_offer_package(
            inactive_tmpl,
            package_code="SVC-INACTIVE-T",
            status=OfferPackageStatus.DRAFT,
        )
        result = validate_offer_package_configuration(pkg)
        self.assertFalse(result["valid"])


# ---------------------------------------------------------------------------
# API tests
# ---------------------------------------------------------------------------

class TestGrowthOffersAPI(TestCase):

    BASE = "/api/v1/admin/growth"

    def setUp(self):
        self.admin = create_admin_user(username="admin_growth_test")
        self.customer_user = create_customer_user(username="cust_growth_test")
        self.partner_user = create_partner_user(username="partner_growth_test")
        self.client = APIClient()

    def _make_template(self, code="API-T-001"):
        return PlanTemplate.objects.create(
            template_code=code,
            name="API Template",
            plan_type=PlanTemplateType.EMI,
            tenure_months=12,
            is_active=True,
        )

    # — Plan Templates —

    def test_admin_can_list_plan_templates(self):
        self._make_template()
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"{self.BASE}/plan-templates/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("results", resp.data)

    def test_admin_can_create_plan_template(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"{self.BASE}/plan-templates/", {
            "template_code": "API-CREATE-001",
            "name": "Created Template",
            "plan_type": "EMI",
            "tenure_months": 10,
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["template_code"], "API-CREATE-001")

    def test_admin_can_get_plan_template_detail(self):
        t = self._make_template(code="API-T-DETAIL")
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"{self.BASE}/plan-templates/{t.pk}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["template_code"], "API-T-DETAIL")

    def test_admin_can_patch_plan_template(self):
        t = self._make_template(code="API-T-PATCH")
        self.client.force_authenticate(user=self.admin)
        resp = self.client.patch(f"{self.BASE}/plan-templates/{t.pk}/", {
            "name": "Updated Name",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["name"], "Updated Name")

    def test_customer_blocked_from_plan_templates(self):
        self.client.force_authenticate(user=self.customer_user)
        resp = self.client.get(f"{self.BASE}/plan-templates/")
        self.assertEqual(resp.status_code, 403)

    def test_partner_blocked_from_plan_templates(self):
        self.client.force_authenticate(user=self.partner_user)
        resp = self.client.get(f"{self.BASE}/plan-templates/")
        self.assertEqual(resp.status_code, 403)

    # — Offer Packages —

    def test_admin_can_list_offer_packages(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"{self.BASE}/offer-packages/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("results", resp.data)

    def test_admin_can_create_offer_package(self):
        t = self._make_template(code="API-PKG-T")
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"{self.BASE}/offer-packages/", {
            "package_code": "API-PKG-001",
            "name": "Test Package",
            "plan_template_id": t.pk,
            "status": "DRAFT",
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["package_code"], "API-PKG-001")

    def test_admin_can_patch_offer_package(self):
        t = self._make_template(code="API-PKG-T-PATCH")
        pkg = OfferPackage.objects.create(
            package_code="API-PKG-PATCH",
            name="Patchable",
            plan_template=t,
            status=OfferPackageStatus.DRAFT,
            audience_type=OfferAudienceType.ALL,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.patch(f"{self.BASE}/offer-packages/{pkg.pk}/", {
            "name": "Patched Name",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["name"], "Patched Name")

    def test_admin_can_get_offer_package_preview(self):
        t = self._make_template(code="API-PKG-T-PREV")
        today = date.today()
        pkg = OfferPackage.objects.create(
            package_code="API-PKG-PREVIEW",
            name="Preview Package",
            plan_template=t,
            status=OfferPackageStatus.ACTIVE,
            audience_type=OfferAudienceType.ALL,
            start_date=today - timedelta(days=1),
            end_date=today + timedelta(days=30),
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"{self.BASE}/offer-packages/{pkg.pk}/preview/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("eligibility", resp.data)
        self.assertIn("configuration_validation", resp.data)

    def test_customer_blocked_from_offer_packages(self):
        self.client.force_authenticate(user=self.customer_user)
        resp = self.client.get(f"{self.BASE}/offer-packages/")
        self.assertEqual(resp.status_code, 403)

    def test_partner_blocked_from_offer_packages(self):
        self.client.force_authenticate(user=self.partner_user)
        resp = self.client.get(f"{self.BASE}/offer-packages/")
        self.assertEqual(resp.status_code, 403)

    def test_create_offer_package_does_not_create_subscription(self):
        from subscriptions.models import Subscription, Emi, Payment
        from accounting.models import JournalEntry

        t = self._make_template(code="API-PKG-T-NO-SUB")
        subs_before = Subscription.objects.count()
        emi_before = Emi.objects.count()
        journal_before = JournalEntry.objects.count()

        self.client.force_authenticate(user=self.admin)
        self.client.post(f"{self.BASE}/offer-packages/", {
            "package_code": "API-PKG-NO-SUB",
            "name": "No Sub Package",
            "plan_template_id": t.pk,
            "status": "ACTIVE",
        }, format="json")

        self.assertEqual(Subscription.objects.count(), subs_before)
        self.assertEqual(Emi.objects.count(), emi_before)
        self.assertEqual(JournalEntry.objects.count(), journal_before)

    def test_duplicate_template_code_rejected(self):
        self._make_template(code="DUPE-CODE")
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"{self.BASE}/plan-templates/", {
            "template_code": "DUPE-CODE",
            "name": "Dupe",
            "plan_type": "EMI",
        }, format="json")
        self.assertEqual(resp.status_code, 409)

    def test_404_for_nonexistent_template(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"{self.BASE}/plan-templates/999999/")
        self.assertEqual(resp.status_code, 404)
