from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import Commission, CommissionPayoutBatch, Emi, LuckyDraw, Payment
from subscriptions.models_business_setup import (
    BusinessComplianceDocument,
    BusinessComplianceDocumentType,
    BusinessComplianceDocumentVerificationStatus,
    BusinessComplianceDocumentVisibility,
    PolicyPage,
    PolicyStatus,
)
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_partner_user,
    create_product,
    create_user,
)


class PolicyGovernanceApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="policy_admin", phone="9400000001")
        self.customer = create_user(
            username="policy_customer",
            password="CustomerPass123!",
            role="CUSTOMER",
            phone="9400000002",
            first_name="Policy",
        )
        self.partner = create_partner_user(username="policy_partner", phone="9400000003")
        self.cashier = create_cashier_user(username="policy_cashier", phone="9400000004")
        self.vendor = create_user(
            username="policy_vendor",
            password="VendorPass123!",
            role="VENDOR",
            phone="9400000005",
            first_name="Vendor",
        )

    def _create_published_policy(self, slug: str, title: str):
        return PolicyPage.objects.create(
            slug=slug,
            version=1,
            category="GENERAL",
            title=title,
            summary=f"Summary for {title}",
            content=f"# {title}\n\nPublished body",
            status=PolicyStatus.PUBLISHED,
            effective_date=date.today(),
            published_at=timezone.now(),
            published_by=self.admin,
            created_by=self.admin,
            updated_by=self.admin,
        )

    def test_published_policy_pages_are_publicly_readable(self):
        self._create_published_policy("terms", "Terms and Conditions")
        self._create_published_policy("privacy", "Privacy Policy")

        terms = self.client.get("/api/v1/public/policies/terms/")
        self.assertEqual(terms.status_code, status.HTTP_200_OK, terms.data)
        self.assertEqual(terms.data["policy"]["slug"], "terms")

        privacy = self.client.get("/api/v1/public/policies/privacy/")
        self.assertEqual(privacy.status_code, status.HTTP_200_OK, privacy.data)
        self.assertEqual(privacy.data["policy"]["slug"], "privacy")

    def test_draft_policy_page_is_not_publicly_readable(self):
        PolicyPage.objects.create(
            slug="privacy",
            version=1,
            category="PRIVACY",
            title="Privacy Draft",
            summary="Draft",
            content="# Privacy",
            status=PolicyStatus.DRAFT,
            created_by=self.admin,
            updated_by=self.admin,
        )

        response = self.client.get("/api/v1/public/policies/privacy/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_can_create_update_publish_archive_policy(self):
        self.client.force_authenticate(self.admin)

        create_response = self.client.post(
            "/api/v1/admin/public-site/policies/",
            {
                "slug": "delivery-policy",
                "category": "DELIVERY",
                "title": "Delivery Policy",
                "summary": "Delivery terms",
                "content": "# Delivery Policy",
                "status": "DRAFT",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        policy_id = create_response.data["id"]

        update_response = self.client.patch(
            f"/api/v1/admin/public-site/policies/{policy_id}/",
            {
                "summary": "Updated delivery terms",
                "content": "# Delivery Policy\n\nUpdated",
            },
            format="json",
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK, update_response.data)

        publish_response = self.client.post(
            f"/api/v1/admin/public-site/policies/{policy_id}/publish/",
            {"effective_date": str(date.today())},
            format="json",
        )
        self.assertEqual(publish_response.status_code, status.HTTP_200_OK, publish_response.data)
        self.assertEqual(publish_response.data["status"], "PUBLISHED")

        public_response = self.client.get("/api/v1/public/policies/delivery-policy/")
        self.assertEqual(public_response.status_code, status.HTTP_200_OK, public_response.data)

        archive_response = self.client.post(
            f"/api/v1/admin/public-site/policies/{policy_id}/archive/",
            {},
            format="json",
        )
        self.assertEqual(archive_response.status_code, status.HTTP_200_OK, archive_response.data)
        self.assertEqual(archive_response.data["status"], "ARCHIVED")

        hidden_response = self.client.get("/api/v1/public/policies/delivery-policy/")
        self.assertEqual(hidden_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_partner_vendor_cashier_cannot_access_admin_policy_controls(self):
        for user in (self.customer, self.partner, self.vendor, self.cashier):
            self.client.force_authenticate(user)
            response = self.client.get("/api/v1/admin/public-site/policies/")
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, f"role={user.role}")

    def test_public_compliance_summary_excludes_private_document_fields(self):
        BusinessComplianceDocument.objects.create(
            document_type=BusinessComplianceDocumentType.OWNERSHIP_PROOF,
            title="Shop ownership proof",
            public_visibility=BusinessComplianceDocumentVisibility.PRIVATE,
            verification_status=BusinessComplianceDocumentVerificationStatus.VERIFIED,
            public_summary="Should never be public",
            notes="private note",
            uploaded_by=self.admin,
            reviewed_by=self.admin,
        )
        BusinessComplianceDocument.objects.create(
            document_type=BusinessComplianceDocumentType.UDYAM_CERTIFICATE,
            title="Udyam internal verification",
            public_visibility=BusinessComplianceDocumentVisibility.PUBLIC_SUMMARY_ONLY,
            verification_status=BusinessComplianceDocumentVerificationStatus.VERIFIED,
            public_summary="Verified internally. Number not shown publicly.",
            notes="internal",
            uploaded_by=self.admin,
            reviewed_by=self.admin,
        )

        response = self.client.get("/api/v1/public/business-compliance/summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        docs = response.data["public_documents"]
        self.assertEqual(len(docs), 1)
        row = docs[0]
        self.assertEqual(row["document_type"], "UDYAM_CERTIFICATE")
        self.assertNotIn("file", row)
        self.assertNotIn("notes", row)

    def test_admin_compliance_document_endpoint_is_admin_only(self):
        for user in (self.customer, self.partner, self.vendor, self.cashier):
            self.client.force_authenticate(user)
            response = self.client.get("/api/v1/admin/public-site/business-compliance/documents/")
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, f"role={user.role}")

    def test_policy_updates_do_not_mutate_financial_or_inventory_truth(self):
        product = create_product(
            name="Policy Isolation Product",
            product_code="POL-ISO-001",
            base_price=Decimal("17890.00"),
        )

        baseline = {
            "payment_count": Payment.objects.count(),
            "emi_count": Emi.objects.count(),
            "lucky_draw_count": LuckyDraw.objects.count(),
            "commission_count": Commission.objects.count(),
            "payout_batch_count": CommissionPayoutBatch.objects.count(),
        }

        self.client.force_authenticate(self.admin)
        create_response = self.client.post(
            "/api/v1/admin/public-site/policies/",
            {
                "slug": "payment-policy",
                "category": "PAYMENT",
                "title": "Payment Policy",
                "summary": "Payment terms",
                "content": "# Payment Policy",
                "status": "DRAFT",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)

        policy_id = create_response.data["id"]
        publish_response = self.client.post(
            f"/api/v1/admin/public-site/policies/{policy_id}/publish/",
            {"effective_date": str(date.today())},
            format="json",
        )
        self.assertEqual(publish_response.status_code, status.HTTP_200_OK, publish_response.data)

        product.refresh_from_db()
        self.assertEqual(product.base_price, Decimal("17890.00"))

        self.assertEqual(Payment.objects.count(), baseline["payment_count"])
        self.assertEqual(Emi.objects.count(), baseline["emi_count"])
        self.assertEqual(LuckyDraw.objects.count(), baseline["lucky_draw_count"])
        self.assertEqual(Commission.objects.count(), baseline["commission_count"])
        self.assertEqual(CommissionPayoutBatch.objects.count(), baseline["payout_batch_count"])

    def test_business_compliance_summary_uses_safe_placeholder_when_registration_absent(self):
        response = self.client.get("/api/v1/public/business-compliance/summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        self.assertIn("Not provided", response.data["gst_status_text"])
        self.assertIn("Not provided", response.data["udyam_status_text"])
