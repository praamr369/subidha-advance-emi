from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models_business_setup import PolicyPage, PolicyStatus
from subscriptions.services.policy_governance_service import (
    build_policy_coverage_matrix,
    get_public_published_policy,
    list_public_published_policies,
    seed_default_policy_pages,
)
from tests.helpers import create_admin_user, create_customer_user


class PolicyGovernanceCoverageTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="policy_governance_admin", phone="9199000101")
        self.customer = create_customer_user(username="policy_governance_customer", phone="9199000102")

    def test_seed_creates_missing_customer_and_internal_templates_as_draft(self):
        result = seed_default_policy_pages(performed_by=self.admin)
        self.assertGreater(result["created"], 0)

        public_policy = PolicyPage.objects.get(slug="cookie-tracking-consent")
        internal_policy = PolicyPage.objects.get(slug="payment-reversal-void-policy")

        self.assertEqual(public_policy.status, PolicyStatus.DRAFT)
        self.assertEqual(public_policy.category, "PRIVACY")
        self.assertEqual(internal_policy.status, PolicyStatus.DRAFT)
        self.assertEqual(internal_policy.category, "PAYMENT")

    def test_seed_is_idempotent_and_does_not_overwrite_edited_draft_by_default(self):
        PolicyPage.objects.create(
            slug="cookie-tracking-consent",
            version=1,
            category="PRIVACY",
            title="Edited Cookie Policy",
            summary="Edited summary",
            content="Edited content must stay",
            status=PolicyStatus.DRAFT,
            created_by=self.admin,
            updated_by=self.admin,
        )

        first = seed_default_policy_pages(performed_by=self.admin)
        second = seed_default_policy_pages(performed_by=self.admin)

        self.assertGreaterEqual(first["skipped"], 1)
        self.assertGreater(second["skipped"], 0)
        self.assertEqual(PolicyPage.objects.filter(slug="cookie-tracking-consent").count(), 1)
        row = PolicyPage.objects.get(slug="cookie-tracking-consent")
        self.assertEqual(row.content, "Edited content must stay")

    def test_public_services_exclude_draft_and_internal_policies(self):
        PolicyPage.objects.create(
            slug="terms",
            version=1,
            category="GENERAL",
            title="Terms Draft",
            summary="Draft",
            content="Draft",
            status=PolicyStatus.DRAFT,
        )
        internal = PolicyPage.objects.create(
            slug="payment-reversal-void-policy",
            version=1,
            category="PAYMENT",
            title="Internal Payment Reversal",
            summary="Internal",
            content="Internal",
            status=PolicyStatus.PUBLISHED,
            published_at=timezone.now(),
            effective_date=timezone.localdate(),
        )
        custom_public = PolicyPage.objects.create(
            slug="custom-public-policy",
            version=1,
            category="GENERAL",
            title="Custom Public Policy",
            summary="Public",
            content="Public",
            status=PolicyStatus.PUBLISHED,
            published_at=timezone.now(),
            effective_date=timezone.localdate(),
        )

        self.assertIsNone(get_public_published_policy("terms"))
        self.assertIsNone(get_public_published_policy(internal.slug))
        self.assertIsNotNone(get_public_published_policy(custom_public.slug))

        public_slugs = {row.slug for row in list_public_published_policies()}
        self.assertNotIn("terms", public_slugs)
        self.assertNotIn(internal.slug, public_slugs)
        self.assertIn(custom_public.slug, public_slugs)

    def test_coverage_matrix_reports_missing_draft_and_readiness(self):
        missing_matrix = build_policy_coverage_matrix()
        self.assertGreater(missing_matrix["summary"]["missing_count"], 0)

        seed_default_policy_pages(performed_by=self.admin)
        matrix = build_policy_coverage_matrix()
        rows = {row["required_policy_key"]: row for row in matrix["results"]}

        self.assertIn("cookie-tracking-consent", rows)
        self.assertIn("payment-reversal-void-policy", rows)
        self.assertEqual(rows["cookie-tracking-consent"]["visibility"], "PUBLIC")
        self.assertEqual(rows["cookie-tracking-consent"]["status"], PolicyStatus.DRAFT)
        self.assertFalse(rows["cookie-tracking-consent"]["public_ready"])
        self.assertEqual(rows["payment-reversal-void-policy"]["visibility"], "INTERNAL")
        self.assertEqual(rows["payment-reversal-void-policy"]["status"], PolicyStatus.DRAFT)
        self.assertFalse(rows["payment-reversal-void-policy"]["internal_ready"])

    def test_admin_coverage_endpoint_is_admin_only_and_returns_groups(self):
        self.client.force_authenticate(user=self.customer)
        denied = self.client.get("/api/v1/admin/settings/policies/coverage/")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/settings/policies/coverage/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("summary", response.data)
        self.assertIn("groups", response.data)
        self.assertIn("results", response.data)
        self.assertTrue(any(group["group"] == "Privacy / Data" for group in response.data["groups"]))

    def test_setup_readiness_exposes_policy_governance_blocker(self):
        seed_default_policy_pages(performed_by=self.admin)
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/setup-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        section = next(item for item in response.data["sections"] if item["key"] == "policy_governance")
        self.assertEqual(section["status"], "BLOCKED")
        self.assertGreater(section["metadata"]["public_not_published_count"], 0)
