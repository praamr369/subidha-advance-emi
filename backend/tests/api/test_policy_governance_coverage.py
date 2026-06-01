from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import JournalEntry
from reconciliation.models import ReconciliationRun
from subscriptions.models import Payment
from subscriptions.models_business_setup import PolicyPage, PolicyStatus
from subscriptions.models_policy_governance import PolicyGovernanceMetadata
from subscriptions.services.policy_governance_service import (
    POLICY_STATUS_APPROVED,
    POLICY_STATUS_DRAFT,
    POLICY_STATUS_PUBLISHED,
    POLICY_STATUS_UNDER_REVIEW,
    accept_internal_policy,
    approve_policy,
    build_policy_coverage_matrix,
    create_draft_from_policy,
    get_public_published_policy,
    list_public_published_policies,
    publish_policy_page,
    reject_policy,
    seed_default_policy_pages,
    submit_policy_for_review,
)
from tests.helpers import create_admin_user, create_customer_user


class PolicyGovernanceCoverageTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="policy_governance_admin", phone="9199000101")
        self.customer = create_customer_user(username="policy_governance_customer", phone="9199000102")

    def test_seed_creates_missing_customer_and_internal_templates_as_draft_with_metadata(self):
        result = seed_default_policy_pages(performed_by=self.admin)
        self.assertGreater(result["created"], 0)

        public_policy = PolicyPage.objects.get(slug="cookie-tracking-consent")
        internal_policy = PolicyPage.objects.get(slug="payment-reversal-void-policy")

        self.assertEqual(public_policy.status, PolicyStatus.DRAFT)
        self.assertEqual(public_policy.category, "PRIVACY")
        self.assertEqual(public_policy.governance_metadata.visibility, "PUBLIC")
        self.assertEqual(public_policy.governance_metadata.coverage_group, "Privacy / Data")

        self.assertEqual(internal_policy.status, PolicyStatus.DRAFT)
        self.assertEqual(internal_policy.category, "PAYMENT")
        self.assertEqual(internal_policy.governance_metadata.visibility, "INTERNAL")
        self.assertTrue(internal_policy.governance_metadata.requires_admin_acceptance)

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

    def test_public_services_exclude_draft_approved_and_internal_policies(self):
        draft = PolicyPage.objects.create(
            slug="terms",
            version=1,
            category="GENERAL",
            title="Terms Draft",
            summary="Draft",
            content="Draft",
            status=PolicyStatus.DRAFT,
        )
        submitted = submit_policy_for_review(draft, performed_by=self.admin)
        approved = approve_policy(submitted, performed_by=self.admin)
        self.assertEqual(approved.status, POLICY_STATUS_APPROVED)

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

    def test_lifecycle_submit_approve_publish_and_reject_paths(self):
        row = PolicyPage.objects.create(slug="custom-lifecycle", version=1, category="GENERAL", title="Custom", summary="S", content="C", status=PolicyStatus.DRAFT)
        submitted = submit_policy_for_review(row, performed_by=self.admin)
        self.assertEqual(submitted.status, POLICY_STATUS_UNDER_REVIEW)
        self.assertIsNotNone(submitted.governance_metadata.submitted_for_review_at)

        rejected = reject_policy(submitted, performed_by=self.admin, reason="Needs correction")
        self.assertEqual(rejected.status, POLICY_STATUS_DRAFT)
        self.assertEqual(rejected.governance_metadata.rejection_reason, "Needs correction")

        submitted_again = submit_policy_for_review(rejected, performed_by=self.admin)
        approved = approve_policy(submitted_again, performed_by=self.admin)
        self.assertEqual(approved.status, POLICY_STATUS_APPROVED)
        self.assertEqual(approved.governance_metadata.approved_by, self.admin)

        published = publish_policy_page(policy=approved, performed_by=self.admin)
        self.assertEqual(published.status, POLICY_STATUS_PUBLISHED)
        self.assertTrue(published.public_visible)

    def test_reject_requires_reason_and_accept_internal_does_not_expose_publicly(self):
        seed_default_policy_pages(performed_by=self.admin)
        internal = PolicyPage.objects.get(slug="payment-reversal-void-policy")
        submitted = submit_policy_for_review(internal, performed_by=self.admin)
        with self.assertRaises(ValueError):
            reject_policy(submitted, performed_by=self.admin, reason="")

        accepted = accept_internal_policy(submitted, performed_by=self.admin)
        self.assertEqual(accepted.status, POLICY_STATUS_APPROVED)
        self.assertTrue(accepted.internal_ready)
        self.assertIsNotNone(accepted.governance_metadata.internal_acceptance_at)
        self.assertIsNone(get_public_published_policy(accepted.slug))

    def test_create_draft_copies_metadata_and_resets_lifecycle(self):
        seed_default_policy_pages(performed_by=self.admin)
        public = PolicyPage.objects.get(slug="cookie-tracking-consent")
        approved = approve_policy(submit_policy_for_review(public, performed_by=self.admin), performed_by=self.admin)
        published = publish_policy_page(policy=approved, performed_by=self.admin)

        draft = create_draft_from_policy(policy=published, performed_by=self.admin)
        self.assertEqual(draft.status, POLICY_STATUS_DRAFT)
        self.assertEqual(draft.governance_metadata.visibility, published.governance_metadata.visibility)
        self.assertIsNone(draft.governance_metadata.approved_at)
        self.assertIsNone(draft.governance_metadata.internal_acceptance_at)

    def test_coverage_matrix_reports_missing_draft_readiness_and_metadata_mismatch(self):
        missing_matrix = build_policy_coverage_matrix()
        self.assertGreater(missing_matrix["summary"]["missing_count"], 0)

        seed_default_policy_pages(performed_by=self.admin)
        row = PolicyPage.objects.get(slug="cookie-tracking-consent")
        metadata = row.governance_metadata
        metadata.visibility = "INTERNAL"
        metadata.save(update_fields=["visibility", "updated_at"])

        matrix = build_policy_coverage_matrix()
        rows = {row["required_policy_key"]: row for row in matrix["results"]}

        self.assertIn("cookie-tracking-consent", rows)
        self.assertIn("payment-reversal-void-policy", rows)
        self.assertEqual(rows["cookie-tracking-consent"]["catalog_visibility"], "PUBLIC")
        self.assertEqual(rows["cookie-tracking-consent"]["visibility"], "INTERNAL")
        self.assertFalse(rows["cookie-tracking-consent"]["metadata_synced"])
        self.assertIn("visibility", rows["cookie-tracking-consent"]["metadata_mismatches"])
        self.assertGreater(matrix["summary"]["metadata_mismatch_count"], 0)
        self.assertEqual(rows["payment-reversal-void-policy"]["visibility"], "INTERNAL")
        self.assertEqual(rows["payment-reversal-void-policy"]["status"], PolicyStatus.DRAFT)
        self.assertFalse(rows["payment-reversal-void-policy"]["internal_ready"])

    def test_admin_lifecycle_endpoints_are_admin_only(self):
        row = PolicyPage.objects.create(slug="endpoint-lifecycle", version=1, category="GENERAL", title="Endpoint", summary="S", content="C", status=PolicyStatus.DRAFT)
        self.client.force_authenticate(user=self.customer)
        denied = self.client.post(f"/api/v1/admin/public-site/policies/{row.id}/submit-review/", {}, format="json")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin)
        submitted = self.client.post(f"/api/v1/admin/public-site/policies/{row.id}/submit-review/", {}, format="json")
        self.assertEqual(submitted.status_code, status.HTTP_200_OK)
        self.assertEqual(submitted.data["status"], POLICY_STATUS_UNDER_REVIEW)

        rejected_without_reason = self.client.post(f"/api/v1/admin/public-site/policies/{row.id}/reject/", {}, format="json")
        self.assertEqual(rejected_without_reason.status_code, status.HTTP_400_BAD_REQUEST)

        approved = self.client.post(f"/api/v1/admin/public-site/policies/{row.id}/approve/", {}, format="json")
        self.assertEqual(approved.status_code, status.HTTP_200_OK)
        self.assertEqual(approved.data["status"], POLICY_STATUS_APPROVED)

    def test_no_financial_records_mutate(self):
        before = {
            "payments": Payment.objects.count(),
            "journals": JournalEntry.objects.count(),
            "reconciliation_runs": ReconciliationRun.objects.count(),
        }
        seed_default_policy_pages(performed_by=self.admin)
        after = {
            "payments": Payment.objects.count(),
            "journals": JournalEntry.objects.count(),
            "reconciliation_runs": ReconciliationRun.objects.count(),
        }
        self.assertEqual(before, after)

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
        self.assertIn("metadata_mismatch_count", response.data["summary"])
        self.assertTrue(any(group["group"] == "Privacy / Data" for group in response.data["groups"]))

    def test_setup_readiness_exposes_policy_governance_blocker(self):
        seed_default_policy_pages(performed_by=self.admin)
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/setup-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        section = next(item for item in response.data["sections"] if item["key"] == "policy_governance")
        self.assertEqual(section["status"], "BLOCKED")
        self.assertGreater(section["metadata"]["public_not_published_count"], 0)
