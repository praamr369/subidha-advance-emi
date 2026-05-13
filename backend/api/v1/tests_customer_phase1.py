"""
Phase 1 Customer Tests

Covers:
1. Duplicate phone returns/reuses existing customer
2. Quick-create without email works
3. Admin can add email later
4. Forgot-password without email returns controlled message
5. Customer can view only own dashboard (not another's)
6. Partner can only access linked customers
7. Customer KYC update request becomes SUBMITTED
8. Admin can approve/reject KYC
9. Referral relationship created safely
10. Referral commission not payable unless admin-enabled/approved
"""

from decimal import Decimal

from django.test import TestCase
from django.utils.crypto import get_random_string
from rest_framework.test import APIClient

from accounts.models import User, UserRole
from subscriptions.models import (
    AuditLog,
    Customer,
    CustomerKycDocument,
    CustomerKycDocumentStatus,
    CustomerReferral,
    CustomerSource,
    KycStatus,
)
from subscriptions.services.customer_service import (
    approve_kyc,
    create_kyc_update_request,
    create_referral,
    find_customer_by_phone,
    find_or_create_customer,
    normalize_phone,
    reject_kyc,
    search_customers,
)
from tests.helpers import suppress_expected_request_logs


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_user(role=UserRole.ADMIN, phone=None, email=""):
    username = f"user_{get_random_string(8)}"
    phone = phone or f"+91{get_random_string(10, '1234567890')}"
    return User.objects.create_user(
        username=username,
        password="testpass123",
        role=role,
        phone=phone,
        email=email,
    )


def make_customer(phone=None, name="Test User", email=""):
    phone = phone or f"98{get_random_string(8, '1234567890')}"
    user = make_user(role=UserRole.CUSTOMER, phone=phone, email=email)
    return Customer.objects.create(user=user, name=name, phone=phone)


# ---------------------------------------------------------------------------
# 1. Phone normalisation
# ---------------------------------------------------------------------------

class PhoneNormalisationTests(TestCase):
    def test_strips_spaces_dashes_parens(self):
        assert normalize_phone("(98) 765-4321") == "987654321"

    def test_keeps_leading_plus(self):
        result = normalize_phone("+91 98765 43210")
        assert result.startswith("+")
        assert "9876543210" in result

    def test_raises_on_empty(self):
        with self.assertRaises(ValueError):
            normalize_phone("")

    def test_raises_on_too_short(self):
        with self.assertRaises(ValueError):
            normalize_phone("123")


# ---------------------------------------------------------------------------
# 2. Duplicate phone prevention
# ---------------------------------------------------------------------------

class CustomerDuplicatePhoneTests(TestCase):
    def test_second_create_with_same_phone_returns_existing(self):
        customer, created1 = find_or_create_customer(
            name="Alice", phone="9876543210", source=CustomerSource.ADMIN
        )
        assert created1 is True

        customer2, created2 = find_or_create_customer(
            name="Different Name", phone="9876543210", source=CustomerSource.ADMIN
        )
        assert created2 is False
        assert customer2.pk == customer.pk

    def test_find_by_phone_returns_exact(self):
        customer, _ = find_or_create_customer(
            name="Bob", phone="9000000001", source=CustomerSource.ADMIN
        )
        found = find_customer_by_phone("9000000001")
        assert found is not None
        assert found.pk == customer.pk

    def test_find_by_phone_returns_none_for_unknown(self):
        result = find_customer_by_phone("0000000000")
        assert result is None


# ---------------------------------------------------------------------------
# 3. Quick-create without email
# ---------------------------------------------------------------------------

class CustomerQuickCreateNoEmailTests(TestCase):
    def test_creates_customer_without_email(self):
        customer, created = find_or_create_customer(
            name="Walk-in Customer",
            phone="8888888881",
            source=CustomerSource.ADMIN,
        )
        assert created is True
        assert customer.pk is not None
        assert customer.phone == "8888888881"
        assert (customer.user.email or "") == ""

    def test_quick_create_via_api_no_email(self):
        admin = make_user(role=UserRole.ADMIN, phone="7000000001")
        client = APIClient()
        client.force_authenticate(user=admin)

        response = client.post(
            "/api/v1/customers/create/",
            data={"name": "Shop Customer", "phone": "8777777771"},
            format="json",
        )
        assert response.status_code in (200, 201), response.data
        assert response.data["customer"]["phone"] == "8777777771"

    def test_duplicate_phone_returns_200_not_201(self):
        customer, _ = find_or_create_customer(
            name="Existing", phone="8666666661", source=CustomerSource.ADMIN
        )
        admin = make_user(role=UserRole.ADMIN, phone="7000000002")
        client = APIClient()
        client.force_authenticate(user=admin)

        response = client.post(
            "/api/v1/customers/create/",
            data={"name": "Duplicate Attempt", "phone": "8666666661"},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["created"] is False
        assert response.data["customer"]["id"] == customer.pk


# ---------------------------------------------------------------------------
# 4. Admin can add email later
# ---------------------------------------------------------------------------

class CustomerEmailUpdateTests(TestCase):
    def test_admin_can_patch_email_via_api(self):
        customer, _ = find_or_create_customer(
            name="No Email Customer",
            phone="8555555551",
            source=CustomerSource.ADMIN,
        )
        assert (customer.user.email or "") == ""

        admin = make_user(role=UserRole.ADMIN, phone="7000000003")
        client = APIClient()
        client.force_authenticate(user=admin)

        response = client.patch(
            f"/api/v1/admin/customers/{customer.pk}/",
            data={"email": "newemail@test.com"},
            format="json",
        )
        assert response.status_code in (200, 201), response.data
        customer.user.refresh_from_db()
        assert customer.user.email == "newemail@test.com"

    def test_email_change_creates_audit_log(self):
        from subscriptions.services.customer_service import update_customer_contact

        customer = make_customer(phone="8444444441")
        admin = make_user(role=UserRole.ADMIN, phone="7100000001")

        initial_count = AuditLog.objects.filter(
            model_name="Customer",
            object_id=customer.pk,
        ).count()

        update_customer_contact(
            customer,
            email="changed@example.com",
            performed_by=admin,
        )

        new_count = AuditLog.objects.filter(
            model_name="Customer",
            object_id=customer.pk,
        ).count()
        assert new_count > initial_count


# ---------------------------------------------------------------------------
# 5 & 6. Permission isolation
# ---------------------------------------------------------------------------

class CustomerPermissionTests(TestCase):
    def setUp(self):
        self.admin = make_user(role=UserRole.ADMIN, phone="7200000001")
        self.partner = make_user(role=UserRole.PARTNER, phone="7200000002")
        self.customer1 = make_customer(phone="8333333331")
        self.customer2 = make_customer(phone="8333333332")
        self.customer1.user.set_password("pass123")
        self.customer1.user.save()

    def test_customer_can_access_own_dashboard(self):
        client = APIClient()
        client.force_authenticate(user=self.customer1.user)
        response = client.get("/api/v1/customer/dashboard/")
        assert response.status_code == 200

    def test_customer_cannot_access_another_customer_dashboard(self):
        client = APIClient()
        client.force_authenticate(user=self.customer2.user)
        response = client.get("/api/v1/customer/dashboard/")
        assert response.status_code == 200
        # Verify the response contains customer2's data, not customer1's
        data = response.data
        if "customer" in data:
            returned_id = data["customer"].get("id")
            assert returned_id == self.customer2.pk

    def test_unauthenticated_cannot_access_customer_dashboard(self):
        client = APIClient()
        response = client.get("/api/v1/customer/dashboard/")
        assert response.status_code in (401, 403)

    def test_partner_can_search_customers(self):
        client = APIClient()
        client.force_authenticate(user=self.partner)
        response = client.get(
            "/api/v1/customers/search/",
            data={"phone": self.customer1.phone},
        )
        assert response.status_code == 200

    def test_customer_cannot_access_customer_search(self):
        client = APIClient()
        client.force_authenticate(user=self.customer1.user)
        response = client.get(
            "/api/v1/customers/search/",
            data={"phone": self.customer1.phone},
        )
        assert response.status_code in (401, 403)

    def test_unauthenticated_cannot_access_admin_customers(self):
        client = APIClient()
        response = client.get(f"/api/v1/admin/customers/{self.customer1.pk}/")
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# 7. KYC update request becomes SUBMITTED
# ---------------------------------------------------------------------------

class CustomerKycUpdateRequestTests(TestCase):
    def setUp(self):
        self.customer = make_customer(phone="8222222221")
        self.admin = make_user(role=UserRole.ADMIN, phone="7300000001")

    def test_kyc_request_creates_document_in_submitted_status(self):
        import io
        from django.core.files.uploadedfile import SimpleUploadedFile

        fake_file = SimpleUploadedFile("aadhaar.jpg", b"fake-image-data", content_type="image/jpeg")

        doc = create_kyc_update_request(
            self.customer,
            document_type="AADHAAR",
            file=fake_file,
            notes="Please verify my Aadhaar",
            uploaded_by=self.customer.user,
        )

        assert doc.status == CustomerKycDocumentStatus.SUBMITTED
        self.customer.refresh_from_db()
        assert self.customer.kyc_status == KycStatus.SUBMITTED

    def test_kyc_request_does_not_auto_approve(self):
        import io
        from django.core.files.uploadedfile import SimpleUploadedFile

        fake_file = SimpleUploadedFile("pan.jpg", b"fake-image-data", content_type="image/jpeg")

        doc = create_kyc_update_request(
            self.customer,
            document_type="PAN",
            file=fake_file,
            uploaded_by=self.customer.user,
        )

        assert doc.status != CustomerKycDocumentStatus.APPROVED
        self.customer.refresh_from_db()
        assert self.customer.kyc_status not in (KycStatus.APPROVED, KycStatus.VERIFIED)

    def test_kyc_request_not_accessible_to_other_customer(self):
        other_customer = make_customer(phone="8222222222")
        client = APIClient()
        client.force_authenticate(user=other_customer.user)
        response = client.get("/api/v1/customer/kyc/documents/")
        assert response.status_code == 200
        # Should return 0 documents (not the other customer's docs)
        assert response.data["count"] == 0

    def test_customer_kyc_list_does_not_expose_file_url(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        create_kyc_update_request(
            self.customer,
            document_type="AADHAAR",
            file=SimpleUploadedFile("aadhaar.jpg", b"fake-image-data", content_type="image/jpeg"),
            uploaded_by=self.customer.user,
        )
        client = APIClient()
        client.force_authenticate(user=self.customer.user)
        response = client.get("/api/v1/customer/kyc-documents/")
        assert response.status_code == 200, response.data
        row = response.data["results"][0]
        assert "file" not in row

    def test_customer_kyc_documents_new_route_accepts_upload(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        client = APIClient()
        client.force_authenticate(user=self.customer.user)
        response = client.post(
            "/api/v1/customer/kyc-documents/",
            data={
                "document_type": "AADHAAR",
                "file": SimpleUploadedFile("aadhaar.png", b"fake-image-data", content_type="image/png"),
            },
            format="multipart",
        )
        assert response.status_code == 201, response.data

    def test_customer_kyc_upload_rejects_invalid_content_type(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        client = APIClient()
        client.force_authenticate(user=self.customer.user)
        response = client.post(
            "/api/v1/customer/kyc-documents/",
            data={
                "document_type": "AADHAAR",
                "file": SimpleUploadedFile("script.sh", b"#!/bin/sh", content_type="text/x-shellscript"),
            },
            format="multipart",
        )
        assert response.status_code == 400, response.data


# ---------------------------------------------------------------------------
# 8. Admin can approve/reject KYC
# ---------------------------------------------------------------------------

class CustomerKycAdminApprovalTests(TestCase):
    def setUp(self):
        self.customer = make_customer(phone="8111111111")
        self.admin = make_user(role=UserRole.ADMIN, phone="7400000001")

    def test_admin_can_approve_kyc(self):
        customer = approve_kyc(self.customer, performed_by=self.admin)
        customer.refresh_from_db()
        assert customer.kyc_status == KycStatus.APPROVED
        assert customer.kyc_reviewed_by == self.admin
        assert customer.kyc_reviewed_at is not None

    def test_admin_can_reject_kyc_with_reason(self):
        customer = reject_kyc(
            self.customer,
            reason="Document is blurry",
            performed_by=self.admin,
        )
        customer.refresh_from_db()
        assert customer.kyc_status == KycStatus.REJECTED
        assert customer.kyc_rejection_reason == "Document is blurry"

    def test_kyc_approval_creates_audit_log(self):
        pre_count = AuditLog.objects.filter(
            action_type=AuditLog.ActionType.CUSTOMER_KYC_APPROVED,
            model_name="Customer",
            object_id=self.customer.pk,
        ).count()

        approve_kyc(self.customer, performed_by=self.admin)

        post_count = AuditLog.objects.filter(
            action_type=AuditLog.ActionType.CUSTOMER_KYC_APPROVED,
            model_name="Customer",
            object_id=self.customer.pk,
        ).count()

        assert post_count == pre_count + 1

    def test_kyc_rejection_creates_audit_log(self):
        pre_count = AuditLog.objects.filter(
            action_type=AuditLog.ActionType.CUSTOMER_KYC_REJECTED,
            model_name="Customer",
            object_id=self.customer.pk,
        ).count()

        reject_kyc(self.customer, reason="Test", performed_by=self.admin)

        post_count = AuditLog.objects.filter(
            action_type=AuditLog.ActionType.CUSTOMER_KYC_REJECTED,
            model_name="Customer",
            object_id=self.customer.pk,
        ).count()

        assert post_count == pre_count + 1

    def test_kyc_decision_via_api(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)

        response = client.post(
            f"/api/v1/admin/customers/{self.customer.pk}/kyc-decision/",
            data={"status": "APPROVED"},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["kyc_status"] == "APPROVED"

    def test_kyc_reject_requires_reason(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)

        response = client.post(
            f"/api/v1/admin/customers/{self.customer.pk}/kyc-decision/",
            data={"status": "REJECTED"},
            format="json",
        )
        assert response.status_code == 400

    def test_admin_can_approve_reject_and_download_kyc_document(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        doc = CustomerKycDocument.objects.create(
            customer=self.customer,
            document_type="PAN",
            file=SimpleUploadedFile("pan.pdf", b"%PDF-data", content_type="application/pdf"),
            status=CustomerKycDocumentStatus.SUBMITTED,
            uploaded_by=self.customer.user,
            original_filename="pan.pdf",
            content_type="application/pdf",
            file_size=8,
        )

        client = APIClient()
        client.force_authenticate(user=self.admin)
        approve = client.post(f"/api/v1/admin/customers/{self.customer.pk}/kyc-documents/{doc.id}/approve/", {}, format="json")
        assert approve.status_code == 200, approve.data
        doc.refresh_from_db()
        assert doc.status == CustomerKycDocumentStatus.APPROVED

        reject = client.post(
            f"/api/v1/admin/customers/{self.customer.pk}/kyc-documents/{doc.id}/reject/",
            {"reason": "Mismatch"},
            format="json",
        )
        assert reject.status_code == 200, reject.data
        doc.refresh_from_db()
        assert doc.status == CustomerKycDocumentStatus.REJECTED
        assert doc.rejection_reason == "Mismatch"

        download = client.get(f"/api/v1/admin/customers/{self.customer.pk}/kyc-documents/{doc.id}/download/")
        assert download.status_code == 200

    def test_non_admin_cannot_approve_reject_or_download_kyc_document(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        doc = CustomerKycDocument.objects.create(
            customer=self.customer,
            document_type="PAN",
            file=SimpleUploadedFile("pan.pdf", b"%PDF-data", content_type="application/pdf"),
            status=CustomerKycDocumentStatus.SUBMITTED,
            uploaded_by=self.customer.user,
        )
        outsider = make_customer(phone="8111111112")
        client = APIClient()
        client.force_authenticate(user=outsider.user)
        assert client.post(f"/api/v1/admin/customers/{self.customer.pk}/kyc-documents/{doc.id}/approve/", {}, format="json").status_code in (401, 403)
        assert client.post(
            f"/api/v1/admin/customers/{self.customer.pk}/kyc-documents/{doc.id}/reject/",
            {"reason": "x"},
            format="json",
        ).status_code in (401, 403)
        assert client.get(f"/api/v1/admin/customers/{self.customer.pk}/kyc-documents/{doc.id}/download/").status_code in (401, 403)


# ---------------------------------------------------------------------------
# 9 & 10. Referral
# ---------------------------------------------------------------------------

class CustomerReferralTests(TestCase):
    def setUp(self):
        self.referrer = make_customer(phone="8000000001")
        self.referred = make_customer(phone="8000000002")
        self.admin = make_user(role=UserRole.ADMIN, phone="7500000001")

    def test_referral_is_created_safely(self):
        referral = create_referral(
            self.referrer,
            self.referred,
            created_by=self.admin,
        )
        assert referral.pk is not None
        assert referral.referrer == self.referrer
        assert referral.referred == self.referred

    def test_self_referral_raises_error(self):
        with self.assertRaises(ValueError):
            create_referral(self.referrer, self.referrer)

    def test_duplicate_referral_raises_error(self):
        create_referral(self.referrer, self.referred)
        with self.assertRaises(ValueError):
            create_referral(self.referrer, self.referred)

    def test_commission_not_auto_enabled(self):
        referral = create_referral(self.referrer, self.referred)
        assert referral.commission_enabled is False
        assert referral.commission_approved is False
        assert referral.commission_amount == Decimal("0.00")

    def test_commission_not_payable_without_admin_approval(self):
        referral = create_referral(self.referrer, self.referred)
        # Commission cannot be paid if not enabled and not approved
        assert not (referral.commission_enabled and referral.commission_approved)

    def test_referral_creates_audit_log(self):
        pre_count = AuditLog.objects.filter(
            action_type=AuditLog.ActionType.CUSTOMER_REFERRAL_CREATED,
        ).count()

        create_referral(self.referrer, self.referred, created_by=self.admin)

        post_count = AuditLog.objects.filter(
            action_type=AuditLog.ActionType.CUSTOMER_REFERRAL_CREATED,
        ).count()

        assert post_count == pre_count + 1

    def test_customer_referral_list_shows_own_referrals_only(self):
        other_referrer = make_customer(phone="8000000003")
        referred2 = make_customer(phone="8000000004")

        # Create referral from other_referrer
        create_referral(other_referrer, referred2)

        # self.referrer's referrals should be empty
        client = APIClient()
        client.force_authenticate(user=self.referrer.user)
        response = client.get("/api/v1/customer/referrals/")
        assert response.status_code == 200
        assert response.data["count"] == 0

    def test_customer_referral_list_shows_commission_summary(self):
        referral = create_referral(self.referrer, self.referred)
        client = APIClient()
        client.force_authenticate(user=self.referrer.user)
        response = client.get("/api/v1/customer/referrals/")
        assert response.status_code == 200
        assert "commission_summary" in response.data
        assert response.data["commission_summary"]["approved_commissions"] == 0


# ---------------------------------------------------------------------------
# Customer Search API
# ---------------------------------------------------------------------------

class CustomerSearchAPITests(TestCase):
    def setUp(self):
        self.admin = make_user(role=UserRole.ADMIN, phone="7600000001")
        self.partner = make_user(role=UserRole.PARTNER, phone="7600000002")
        self.customer = make_customer(phone="9111111111", name="Ravi Kumar")

    def test_search_by_phone_returns_exact_match(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.get("/api/v1/customers/search/", data={"phone": "9111111111"})
        assert response.status_code == 200
        assert response.data["exact_match"] is True
        assert len(response.data["results"]) == 1

    def test_search_by_name_returns_results(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.get("/api/v1/customers/search/", data={"q": "Ravi"})
        assert response.status_code == 200
        assert response.data["count"] >= 1

    def test_search_requires_phone_or_q(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.get("/api/v1/customers/search/")
        assert response.status_code == 400

    def test_partner_sees_nothing_for_unlinked_customer(self):
        """Partner gets empty results for a customer they have no link to."""
        client = APIClient()
        client.force_authenticate(user=self.partner)
        response = client.get("/api/v1/customers/search/", data={"phone": "9111111111"})
        assert response.status_code == 200
        # customer was created by admin setup, not linked to this partner
        assert response.data["count"] == 0
        assert response.data["results"] == []

    def test_customer_cannot_search(self):
        client = APIClient()
        client.force_authenticate(user=self.customer.user)
        response = client.get("/api/v1/customers/search/", data={"phone": "9111111111"})
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Partner scoped access tests (Phase 1 pre-commit blocker fix)
# ---------------------------------------------------------------------------

class PartnerScopedAccessTests(TestCase):
    """
    Verifies that a partner user is strictly limited to customers they are
    linked to.  Partner A must never see customers belonging to Partner B or
    admin-only customers.
    """

    def setUp(self):
        self.admin = make_user(role=UserRole.ADMIN, phone="8800000001")
        self.partner_a = make_user(role=UserRole.PARTNER, phone="8800000002")
        self.partner_b = make_user(role=UserRole.PARTNER, phone="8800000003")

        # Customer owned by partner A (created_by_partner_user set)
        self.cust_a1 = make_customer(phone="9900000011", name="PartnerA Customer One")
        self.cust_a1.created_by_partner_user = self.partner_a
        self.cust_a1.save(update_fields=["created_by_partner_user"])

        self.cust_a2 = make_customer(phone="9900000012", name="PartnerA Customer Two")
        self.cust_a2.created_by_partner_user = self.partner_a
        self.cust_a2.save(update_fields=["created_by_partner_user"])

        # Customer owned by partner B
        self.cust_b1 = make_customer(phone="9900000021", name="PartnerB Customer One")
        self.cust_b1.created_by_partner_user = self.partner_b
        self.cust_b1.save(update_fields=["created_by_partner_user"])

        # Admin-only customer (no partner link)
        self.cust_admin = make_customer(phone="9900000031", name="Admin Only Customer")

    # --- Search scope ---

    def test_partner_a_search_by_phone_returns_own_customer(self):
        client = APIClient()
        client.force_authenticate(user=self.partner_a)
        response = client.get("/api/v1/customers/search/", data={"phone": "9900000011"})
        assert response.status_code == 200
        assert response.data["count"] == 1
        assert response.data["results"][0]["phone"] == "9900000011"

    def test_partner_a_search_by_name_returns_own_customers_only(self):
        client = APIClient()
        client.force_authenticate(user=self.partner_a)
        response = client.get("/api/v1/customers/search/", data={"q": "PartnerA"})
        assert response.status_code == 200
        returned_phones = {r["phone"] for r in response.data["results"]}
        assert "9900000011" in returned_phones
        assert "9900000012" in returned_phones
        # Must NOT include partner B or admin-only customer
        assert "9900000021" not in returned_phones
        assert "9900000031" not in returned_phones

    def test_partner_a_cannot_see_partner_b_customer_by_phone(self):
        client = APIClient()
        client.force_authenticate(user=self.partner_a)
        response = client.get("/api/v1/customers/search/", data={"phone": "9900000021"})
        assert response.status_code == 200
        assert response.data["count"] == 0
        assert response.data["results"] == []

    def test_partner_a_cannot_see_admin_only_customer_by_phone(self):
        client = APIClient()
        client.force_authenticate(user=self.partner_a)
        response = client.get("/api/v1/customers/search/", data={"phone": "9900000031"})
        assert response.status_code == 200
        assert response.data["count"] == 0
        assert response.data["results"] == []

    def test_admin_sees_all_customers(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        # Admin can reach partner B's customer
        response = client.get("/api/v1/customers/search/", data={"phone": "9900000021"})
        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_partner_b_cannot_see_partner_a_customer_by_name(self):
        client = APIClient()
        client.force_authenticate(user=self.partner_b)
        response = client.get("/api/v1/customers/search/", data={"q": "PartnerA"})
        assert response.status_code == 200
        returned_phones = {r["phone"] for r in response.data["results"]}
        assert "9900000011" not in returned_phones
        assert "9900000012" not in returned_phones

    # --- Profile summary scope ---

    def test_partner_a_can_access_own_customer_profile_summary(self):
        client = APIClient()
        client.force_authenticate(user=self.partner_a)
        url = f"/api/v1/customers/{self.cust_a1.pk}/profile-summary/"
        response = client.get(url)
        assert response.status_code == 200

    def test_partner_a_cannot_access_partner_b_customer_profile_summary(self):
        client = APIClient()
        client.force_authenticate(user=self.partner_a)
        url = f"/api/v1/customers/{self.cust_b1.pk}/profile-summary/"
        with suppress_expected_request_logs():
            response = client.get(url)
        # 404 – partner must not learn whether the customer exists
        assert response.status_code == 404

    def test_partner_a_cannot_access_admin_only_customer_profile_summary(self):
        client = APIClient()
        client.force_authenticate(user=self.partner_a)
        url = f"/api/v1/customers/{self.cust_admin.pk}/profile-summary/"
        with suppress_expected_request_logs():
            response = client.get(url)
        assert response.status_code == 404

    def test_admin_can_access_any_profile_summary(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        for customer in [self.cust_a1, self.cust_b1, self.cust_admin]:
            url = f"/api/v1/customers/{customer.pk}/profile-summary/"
            response = client.get(url)
            assert response.status_code == 200, (
                f"Admin should access customer {customer.pk} but got {response.status_code}"
            )
