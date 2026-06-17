"""P3D tests: Customer Timeline Aggregation.

Covers:
* Empty customer returns customer_created event
* Payment event appears (EMI_PAID)
* Subscription document uploaded event appears
* Subscription document verified event appears
* Subscription document rejected event appears
* Rent/lease deposit collected event appears
* Damage deduction event appears
* Approval (SubscriptionRequest) event appears
* Risk recalculation event appears
* Return inspection event appears
* KYC document upload event appears
* KYC document verified / rejected events appear
* Contract created event appears
* Ordering newest-first (default)
* Ordering oldest-first (?ordering=asc)
* event_type filter works
* source_model filter works
* date_from / date_to filters work
* limit filter works
* Non-admin is blocked (HTTP 403)
* Admin is allowed (HTTP 200)
* No sensitive KYC file URL in event metadata
* source_model and source_id are present on every event
* Events from another customer are not leaked
"""
from __future__ import annotations

import itertools
from datetime import date, timedelta
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from subscriptions.models import (
    AuditLog,
    CustomerKycDocument,
    CustomerKycDocumentStatus,
    CustomerKycDocumentType,
    CustomerRiskBand,
    CustomerRiskProfile,
    DocumentVerificationStatus,
    Emi,
    EmiStatus,
    KycStatus,
    Payment,
    PaymentMethod,
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionStatus,
    RentLeaseDepositTransactionType,
    RentLeaseReturnInspection,
    Subscription,
    SubscriptionDocument,
    SubscriptionDocumentType,
    SubscriptionRequest,
    SubscriptionRequestStatus,
    SubscriptionStatus,
)
from subscriptions.services.customer_timeline_service import get_customer_timeline
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)

_seq = itertools.count(1)


def _uid() -> str:
    return f"p3d{next(_seq):06d}"


def _small_file(name="doc.pdf") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, b"%PDF-1.4 test", content_type="application/pdf")


def _make_customer(*, kyc_status=KycStatus.PENDING):
    uid = _uid()
    user = create_customer_user(username=uid, phone=f"91{uid}"[:15])
    customer = create_customer_profile(user=user, phone=f"91{uid}"[:15])
    if kyc_status != KycStatus.PENDING:
        customer.kyc_status = kyc_status
        customer.kyc_reviewed_at = timezone.now()
        customer.save(update_fields=["kyc_status", "kyc_reviewed_at"])
    return customer


def _make_emi_sub(customer):
    uid = _uid()
    product = create_product(product_code=f"P-{uid}")
    batch = create_batch(batch_code=f"B-{uid}")
    lucky_id = create_lucky_id(batch=batch, lucky_number=1)
    sub = create_subscription(
        customer=customer,
        product=product,
        batch=batch,
        lucky_id=lucky_id,
    )
    return sub, product, batch, lucky_id


def _make_rent_sub(customer):
    """Create a minimal RENT subscription (no batch/lucky_id required)."""
    uid = _uid()
    product = create_product(product_code=f"R-{uid}")
    sub = Subscription.objects.create(
        customer=customer,
        product=product,
        plan_type=PlanType.RENT,
        tenure_months=12,
        start_date=date.today(),
        total_amount=Decimal("12000.00"),
        monthly_amount=Decimal("1000.00"),
        status=SubscriptionStatus.ACTIVE,
        waived_amount=Decimal("0.00"),
    )
    return sub


def _make_payment(customer, sub, emi, amount=Decimal("1000.00")):
    return Payment.objects.create(
        customer=customer,
        subscription=sub,
        emi=emi,
        amount=amount,
        method=PaymentMethod.CASH,
        payment_date=date.today(),
    )


# ---------------------------------------------------------------------------
# Service-level tests
# ---------------------------------------------------------------------------

class CustomerTimelineServiceTest(TestCase):

    def test_empty_customer_has_customer_created_event(self):
        customer = _make_customer()
        result = get_customer_timeline(customer)
        self.assertEqual(result["customer_id"], customer.pk)
        self.assertGreaterEqual(result["count"], 1)
        types = [e["event_type"] for e in result["events"]]
        self.assertIn("CUSTOMER_CREATED", types)

    def test_payment_event_appears(self):
        customer = _make_customer()
        sub, _, _, _ = _make_emi_sub(customer)
        emi = create_emi(subscription=sub, month_no=1, status=EmiStatus.PAID)
        _make_payment(customer, sub, emi)

        result = get_customer_timeline(customer)
        self.assertIn("EMI_PAID", [e["event_type"] for e in result["events"]])

    def test_subscription_document_uploaded_appears(self):
        customer = _make_customer()
        sub, _, _, _ = _make_emi_sub(customer)
        SubscriptionDocument.objects.create(
            subscription=sub,
            document_type=SubscriptionDocumentType.CUSTOMER_KYC_ID,
            file=_small_file("id.pdf"),
        )

        result = get_customer_timeline(customer)
        self.assertIn("SUBSCRIPTION_DOCUMENT_UPLOADED", [e["event_type"] for e in result["events"]])

    def test_subscription_document_verified_appears(self):
        customer = _make_customer()
        sub, _, _, _ = _make_emi_sub(customer)
        doc = SubscriptionDocument.objects.create(
            subscription=sub,
            document_type=SubscriptionDocumentType.CUSTOMER_KYC_ID,
            file=_small_file("id.pdf"),
        )
        SubscriptionDocument.objects.filter(pk=doc.pk).update(
            verified_at=timezone.now(),
            verification_status=DocumentVerificationStatus.VERIFIED,
        )

        result = get_customer_timeline(customer)
        self.assertIn("SUBSCRIPTION_DOCUMENT_VERIFIED", [e["event_type"] for e in result["events"]])

    def test_subscription_document_rejected_appears(self):
        customer = _make_customer()
        sub, _, _, _ = _make_emi_sub(customer)
        doc = SubscriptionDocument.objects.create(
            subscription=sub,
            document_type=SubscriptionDocumentType.CUSTOMER_KYC_ID,
            file=_small_file("id.pdf"),
        )
        SubscriptionDocument.objects.filter(pk=doc.pk).update(
            verified_at=timezone.now(),
            verification_status=DocumentVerificationStatus.REJECTED,
        )

        result = get_customer_timeline(customer)
        self.assertIn("SUBSCRIPTION_DOCUMENT_REJECTED", [e["event_type"] for e in result["events"]])

    def test_rent_lease_deposit_collected_appears(self):
        customer = _make_customer()
        sub = _make_rent_sub(customer)
        demand = RentLeaseBillingDemand.objects.create(
            subscription=sub,
            demand_type=RentLeaseDemandType.SECURITY_DEPOSIT,
            status=RentLeaseDemandStatus.PAID,
            due_date=date.today(),
            amount=Decimal("5000.00"),
            collected_amount=Decimal("5000.00"),
            held_amount=Decimal("5000.00"),
            reference_key=f"DEP-{_uid()}",
        )
        RentLeaseDepositTransaction.objects.create(
            subscription=sub,
            customer=customer,
            demand=demand,
            plan_type=PlanType.RENT,
            transaction_type=RentLeaseDepositTransactionType.COLLECTED,
            amount=Decimal("5000.00"),
            transaction_date=date.today(),
            status=RentLeaseDepositTransactionStatus.ACTIVE,
        )

        result = get_customer_timeline(customer)
        self.assertIn("DEPOSIT_COLLECTED", [e["event_type"] for e in result["events"]])

    def test_damage_deduction_event_appears(self):
        customer = _make_customer()
        sub = _make_rent_sub(customer)
        RentLeaseDepositTransaction.objects.create(
            subscription=sub,
            customer=customer,
            plan_type=PlanType.RENT,
            transaction_type=RentLeaseDepositTransactionType.DEDUCTION,
            amount=Decimal("1500.00"),
            transaction_date=date.today(),
            status=RentLeaseDepositTransactionStatus.ACTIVE,
            reason="Damage to fabric",
        )

        result = get_customer_timeline(customer)
        self.assertIn("DAMAGE_DEDUCTION", [e["event_type"] for e in result["events"]])

    def test_approval_event_appears(self):
        customer = _make_customer()
        uid = _uid()
        product = create_product(product_code=f"P-{uid}")
        batch = create_batch(batch_code=f"B-{uid}")
        admin_user = create_admin_user(username=f"adm-{uid}", phone=f"90{uid}"[:15])

        SubscriptionRequest.objects.create(
            requester=admin_user,
            requester_role_snapshot="ADMIN",
            customer=customer,
            product=product,
            batch=batch,
            preferred_lucky_number=1,
            requested_tenure_months_snapshot=15,
            status=SubscriptionRequestStatus.SUBMITTED,
        )

        result = get_customer_timeline(customer)
        self.assertIn("APPROVAL_REQUESTED", [e["event_type"] for e in result["events"]])

    def test_risk_recalculation_event_appears(self):
        customer = _make_customer()
        CustomerRiskProfile.objects.create(
            customer=customer,
            risk_score=30,
            risk_band=CustomerRiskBand.MEDIUM,
            last_calculated_at=timezone.now(),
        )

        result = get_customer_timeline(customer)
        self.assertIn("RISK_RECALCULATED", [e["event_type"] for e in result["events"]])

    def test_return_inspection_event_appears(self):
        customer = _make_customer()
        sub = _make_rent_sub(customer)
        RentLeaseReturnInspection.objects.create(
            subscription=sub,
            status="PENDING",
        )

        result = get_customer_timeline(customer)
        self.assertIn("RETURN_INSPECTION_CREATED", [e["event_type"] for e in result["events"]])

    def test_kyc_document_upload_event_appears(self):
        customer = _make_customer()
        CustomerKycDocument.objects.create(
            customer=customer,
            document_type=CustomerKycDocumentType.AADHAAR,
            file=_small_file("aadhaar.pdf"),
            status=CustomerKycDocumentStatus.SUBMITTED,
        )

        result = get_customer_timeline(customer)
        self.assertIn("DOCUMENT_UPLOADED", [e["event_type"] for e in result["events"]])

    def test_kyc_document_verified_event_appears(self):
        customer = _make_customer()
        doc = CustomerKycDocument.objects.create(
            customer=customer,
            document_type=CustomerKycDocumentType.PAN,
            file=_small_file("pan.pdf"),
            status=CustomerKycDocumentStatus.SUBMITTED,
        )
        CustomerKycDocument.objects.filter(pk=doc.pk).update(
            reviewed_at=timezone.now(),
            status=CustomerKycDocumentStatus.APPROVED,
        )

        result = get_customer_timeline(customer)
        self.assertIn("DOCUMENT_VERIFIED", [e["event_type"] for e in result["events"]])

    def test_kyc_document_rejected_event_appears(self):
        customer = _make_customer()
        doc = CustomerKycDocument.objects.create(
            customer=customer,
            document_type=CustomerKycDocumentType.PAN,
            file=_small_file("pan.pdf"),
            status=CustomerKycDocumentStatus.SUBMITTED,
        )
        CustomerKycDocument.objects.filter(pk=doc.pk).update(
            reviewed_at=timezone.now(),
            status=CustomerKycDocumentStatus.REJECTED,
        )

        result = get_customer_timeline(customer)
        self.assertIn("DOCUMENT_REJECTED", [e["event_type"] for e in result["events"]])

    def test_contract_created_event_appears(self):
        customer = _make_customer()
        _make_emi_sub(customer)

        result = get_customer_timeline(customer)
        self.assertIn("CONTRACT_CREATED", [e["event_type"] for e in result["events"]])

    def test_ordering_newest_first_by_default(self):
        customer = _make_customer()
        sub, _, _, _ = _make_emi_sub(customer)
        emi = create_emi(subscription=sub, month_no=1, status=EmiStatus.PAID)
        _make_payment(customer, sub, emi)

        result = get_customer_timeline(customer)
        dates = [e["event_date"] for e in result["events"] if e["event_date"]]
        if len(dates) > 1:
            self.assertGreaterEqual(dates[0], dates[-1])

    def test_ordering_asc(self):
        customer = _make_customer()
        sub, _, _, _ = _make_emi_sub(customer)
        emi = create_emi(subscription=sub, month_no=1, status=EmiStatus.PAID)
        _make_payment(customer, sub, emi)

        result = get_customer_timeline(customer, ordering="asc")
        dates = [e["event_date"] for e in result["events"] if e["event_date"]]
        if len(dates) > 1:
            self.assertLessEqual(dates[0], dates[-1])

    def test_event_type_filter(self):
        customer = _make_customer()
        sub, _, _, _ = _make_emi_sub(customer)
        emi = create_emi(subscription=sub, month_no=1, status=EmiStatus.PAID)
        _make_payment(customer, sub, emi)

        result = get_customer_timeline(customer, event_type="EMI_PAID")
        for e in result["events"]:
            self.assertEqual(e["event_type"], "EMI_PAID")
        self.assertGreater(result["count"], 0)

    def test_source_model_filter(self):
        customer = _make_customer()
        _make_emi_sub(customer)

        result = get_customer_timeline(customer, source_model="Subscription")
        for e in result["events"]:
            self.assertEqual(e["source_model"], "Subscription")
        self.assertGreater(result["count"], 0)

    def test_date_from_filter_excludes_past(self):
        customer = _make_customer()
        future = date.today() + timedelta(days=365)
        result = get_customer_timeline(customer, date_from=future)
        self.assertEqual(result["count"], 0)

    def test_date_to_filter_excludes_future(self):
        customer = _make_customer()
        past = date(2000, 1, 1)
        result = get_customer_timeline(customer, date_to=past)
        self.assertEqual(result["count"], 0)

    def test_limit_filter(self):
        customer = _make_customer()
        sub, _, _, _ = _make_emi_sub(customer)
        for i in range(1, 4):
            emi = create_emi(subscription=sub, month_no=i, status=EmiStatus.PAID)
            _make_payment(customer, sub, emi)

        result_all = get_customer_timeline(customer)
        result_limited = get_customer_timeline(customer, limit=2)
        self.assertEqual(result_limited["count"], 2)
        self.assertLessEqual(result_limited["count"], result_all["count"])

    def test_source_model_and_source_id_present_on_every_event(self):
        customer = _make_customer()
        sub, _, _, _ = _make_emi_sub(customer)
        emi = create_emi(subscription=sub, month_no=1, status=EmiStatus.PAID)
        _make_payment(customer, sub, emi)

        result = get_customer_timeline(customer)
        for event in result["events"]:
            self.assertIn("source_model", event, f"Missing source_model: {event['event_type']}")
            self.assertIn("source_id", event, f"Missing source_id: {event['event_type']}")
            self.assertIsNotNone(event["source_model"])
            self.assertIsNotNone(event["source_id"])

    def test_no_sensitive_file_url_in_metadata(self):
        customer = _make_customer()
        # Upload a KYC doc — its storage path should NOT appear in any event metadata
        doc = CustomerKycDocument.objects.create(
            customer=customer,
            document_type=CustomerKycDocumentType.AADHAAR,
            file=_small_file("aadhaar_private.pdf"),
            status=CustomerKycDocumentStatus.SUBMITTED,
        )
        # The stored file.name is a storage path; verify it never leaks into metadata
        stored_path = doc.file.name  # e.g. "customer_kyc/1/2026/aadhaar_private.pdf"

        result = get_customer_timeline(customer)
        for event in result["events"]:
            metadata_str = str(event.get("metadata", {}))
            self.assertNotIn(stored_path, metadata_str)
            # Also confirm no 'file' key exists in metadata
            self.assertNotIn("file", event.get("metadata", {}))

    def test_events_from_other_customer_not_leaked(self):
        customer_a = _make_customer()
        customer_b = _make_customer()
        _make_emi_sub(customer_b)

        result = get_customer_timeline(customer_a)
        for event in result["events"]:
            if event["source_model"] == "Customer":
                self.assertEqual(event["source_id"], customer_a.pk)
            # Subscription events must belong to customer_a's subscriptions
            if event["source_model"] == "Subscription":
                self.assertTrue(
                    Subscription.objects.filter(pk=event["source_id"], customer=customer_a).exists(),
                    f"Subscription {event['source_id']} does not belong to customer_a",
                )


# ---------------------------------------------------------------------------
# API-level tests
# ---------------------------------------------------------------------------

class CustomerTimelineAPITest(TestCase):

    def setUp(self):
        self.client = APIClient()

    def _url(self, pk):
        return f"/api/v1/admin/customers/{pk}/timeline/"

    def test_non_admin_blocked(self):
        customer = _make_customer()
        uid = _uid()
        customer_user = create_customer_user(username=uid, phone=f"88{uid}"[:15])
        self.client.force_authenticate(user=customer_user)
        response = self.client.get(self._url(customer.pk))
        self.assertEqual(response.status_code, 403)

    def test_admin_allowed(self):
        customer = _make_customer()
        uid = _uid()
        admin = create_admin_user(username=f"adm-{uid}", phone=f"77{uid}"[:15])
        self.client.force_authenticate(user=admin)
        response = self.client.get(self._url(customer.pk))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("customer_id", data)
        self.assertIn("count", data)
        self.assertIn("events", data)
        self.assertEqual(data["customer_id"], customer.pk)

    def test_admin_404_for_missing_customer(self):
        uid = _uid()
        admin = create_admin_user(username=f"adm-{uid}", phone=f"76{uid}"[:15])
        self.client.force_authenticate(user=admin)
        response = self.client.get(self._url(999999999))
        self.assertEqual(response.status_code, 404)

    def test_api_ordering_asc_param(self):
        customer = _make_customer()
        uid = _uid()
        admin = create_admin_user(username=f"adm-{uid}", phone=f"75{uid}"[:15])
        sub, _, _, _ = _make_emi_sub(customer)
        emi = create_emi(subscription=sub, month_no=1, status=EmiStatus.PAID)
        _make_payment(customer, sub, emi)

        self.client.force_authenticate(user=admin)
        response = self.client.get(self._url(customer.pk) + "?ordering=asc")
        self.assertEqual(response.status_code, 200)
        events = response.json()["events"]
        dates = [e["event_date"] for e in events if e["event_date"]]
        if len(dates) > 1:
            self.assertLessEqual(dates[0], dates[-1])

    def test_api_event_type_filter(self):
        customer = _make_customer()
        uid = _uid()
        admin = create_admin_user(username=f"adm-{uid}", phone=f"74{uid}"[:15])
        sub, _, _, _ = _make_emi_sub(customer)
        emi = create_emi(subscription=sub, month_no=1, status=EmiStatus.PAID)
        _make_payment(customer, sub, emi)

        self.client.force_authenticate(user=admin)
        response = self.client.get(self._url(customer.pk) + "?event_type=EMI_PAID")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for e in data["events"]:
            self.assertEqual(e["event_type"], "EMI_PAID")
        self.assertGreater(data["count"], 0)

    def test_api_unauthenticated_blocked(self):
        customer = _make_customer()
        response = self.client.get(self._url(customer.pk))
        self.assertIn(response.status_code, [401, 403])
