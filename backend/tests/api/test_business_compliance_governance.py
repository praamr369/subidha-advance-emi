from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import JournalEntry
from reconciliation.models import ReconciliationRun
from subscriptions.models import Payment
from subscriptions.models_business_setup import (
    BusinessComplianceDocument,
    BusinessComplianceDocumentType,
    BusinessComplianceDocumentVerificationStatus,
    BusinessComplianceDocumentVisibility,
    BusinessProfile,
)
from subscriptions.services.business_compliance_governance_service import (
    build_business_compliance_readiness,
    is_publicly_downloadable,
    seed_business_compliance_rows,
)
from subscriptions.services.policy_governance_service import get_public_business_compliance_summary
from tests.helpers import create_admin_user, create_customer_user


class BusinessComplianceGovernanceTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="business_compliance_admin", phone="9198000101")
        self.customer = create_customer_user(username="business_compliance_customer", phone="9198000102")

    def test_template_catalog_is_admin_only_and_returns_levels(self):
        self.client.force_authenticate(self.customer)
        denied = self.client.get("/api/v1/admin/settings/business-compliance/templates/")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/settings/business-compliance/templates/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        levels = {row["required_level"] for row in response.data["results"]}
        keys = {row["key"] for row in response.data["results"]}
        self.assertTrue({"REQUIRED", "RECOMMENDED", "OPTIONAL"}.issubset(levels))
        self.assertIn("ownership-proof", keys)
        self.assertIn("gst-certificate", keys)
        self.assertIn("other-compliance-proof", keys)

    def test_seed_rows_is_idempotent_private_pending_and_does_not_overwrite_existing(self):
        existing = BusinessComplianceDocument.objects.create(
            document_type=BusinessComplianceDocumentType.BANK_PROOF,
            title="Bank Proof",
            public_visibility=BusinessComplianceDocumentVisibility.PRIVATE,
            verification_status=BusinessComplianceDocumentVerificationStatus.REJECTED,
            notes="Manual row must not be overwritten.",
            uploaded_by=self.admin,
        )

        first = seed_business_compliance_rows(performed_by=self.admin)
        second = seed_business_compliance_rows(performed_by=self.admin)

        self.assertGreater(first["created_count"], 0)
        self.assertEqual(second["created_count"], 0)
        existing.refresh_from_db()
        self.assertEqual(existing.verification_status, BusinessComplianceDocumentVerificationStatus.REJECTED)
        self.assertEqual(existing.notes, "Manual row must not be overwritten.")

        created_rows = BusinessComplianceDocument.objects.exclude(pk=existing.pk)
        self.assertTrue(created_rows.exists())
        self.assertFalse(created_rows.filter(file__isnull=False).exists())
        self.assertFalse(created_rows.filter(public_visibility=BusinessComplianceDocumentVisibility.PUBLIC_SUMMARY_ONLY).exists())
        self.assertFalse(created_rows.filter(verification_status=BusinessComplianceDocumentVerificationStatus.VERIFIED).exists())

    def test_private_documents_are_not_public_downloadable_by_default(self):
        row = BusinessComplianceDocument.objects.create(
            document_type=BusinessComplianceDocumentType.PAN_OR_TAX_PROOF,
            title="PAN / Tax Proof",
            public_visibility=BusinessComplianceDocumentVisibility.PRIVATE,
            verification_status=BusinessComplianceDocumentVerificationStatus.VERIFIED,
            public_summary="Verified tax identity is held privately.",
            uploaded_by=self.admin,
            reviewed_by=self.admin,
        )
        self.assertFalse(is_publicly_downloadable(row))

    def test_public_summary_only_includes_verified_public_summary_rows(self):
        BusinessComplianceDocument.objects.create(
            document_type=BusinessComplianceDocumentType.GST_CERTIFICATE,
            title="GST Draft",
            public_visibility=BusinessComplianceDocumentVisibility.PUBLIC_SUMMARY_ONLY,
            verification_status=BusinessComplianceDocumentVerificationStatus.PENDING,
            public_summary="This pending GST summary must not be public.",
            uploaded_by=self.admin,
        )
        BusinessComplianceDocument.objects.create(
            document_type=BusinessComplianceDocumentType.UDYAM_CERTIFICATE,
            title="Udyam Verified",
            public_visibility=BusinessComplianceDocumentVisibility.PUBLIC_SUMMARY_ONLY,
            verification_status=BusinessComplianceDocumentVerificationStatus.VERIFIED,
            public_summary="Udyam certificate is verified on internal records.",
            uploaded_by=self.admin,
            reviewed_by=self.admin,
        )

        summary = get_public_business_compliance_summary()
        public_text = [row["public_summary"] for row in summary["public_documents"]]
        self.assertIn("Udyam certificate is verified on internal records.", public_text)
        self.assertNotIn("This pending GST summary must not be public.", public_text)
        self.assertIn("Not provided", summary["gst_status_text"])
        self.assertNotIn("download", " ".join(public_text).lower())

    def test_readiness_blocked_until_required_evidence_verified(self):
        BusinessProfile.objects.create(
            legal_name="Subidha Furniture",
            trade_name="Subidha Furniture",
            primary_phone="9000000000",
            is_active=True,
        )
        seed_business_compliance_rows(performed_by=self.admin)
        readiness = build_business_compliance_readiness()
        self.assertEqual(readiness["status"], "BLOCKED")
        self.assertGreater(readiness["missing_required_count"], 0)
        self.assertGreater(readiness["pending_review_count"], 0)

        for document_type, title in [
            (BusinessComplianceDocumentType.OWNERSHIP_PROOF, "Ownership Proof"),
            (BusinessComplianceDocumentType.SHOP_LICENSE, "Business Address Proof"),
            (BusinessComplianceDocumentType.PAN_OR_TAX_PROOF, "PAN / Tax Proof"),
            (BusinessComplianceDocumentType.BANK_PROOF, "Bank Proof"),
        ]:
            BusinessComplianceDocument.objects.create(
                document_type=document_type,
                title=title,
                public_visibility=BusinessComplianceDocumentVisibility.PRIVATE,
                verification_status=BusinessComplianceDocumentVerificationStatus.VERIFIED,
                uploaded_by=self.admin,
                reviewed_by=self.admin,
            )

        updated = build_business_compliance_readiness()
        self.assertIn(updated["status"], {"READY", "NEEDS_SETUP"})
        self.assertEqual(updated["missing_required_count"], 0)
        self.assertEqual(updated["approved_required_count"], updated["required_count"])

    def test_seed_rows_does_not_mutate_financial_records(self):
        before = {
            "payments": Payment.objects.count(),
            "journals": JournalEntry.objects.count(),
            "reconciliation_runs": ReconciliationRun.objects.count(),
        }
        seed_business_compliance_rows(performed_by=self.admin)
        after = {
            "payments": Payment.objects.count(),
            "journals": JournalEntry.objects.count(),
            "reconciliation_runs": ReconciliationRun.objects.count(),
        }
        self.assertEqual(before, after)

    def test_admin_readiness_endpoint_reports_counts(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/settings/business-compliance/readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("missing_required_count", response.data)
        self.assertIn("pending_review_count", response.data)
        self.assertIn("approved_required_count", response.data)
        self.assertEqual(response.data["route_hint"], "/admin/settings/business-compliance")
