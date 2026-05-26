from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.models import (
    Batch,
    BatchStatus,
    ContractAmendment,
    Customer,
    LuckyId,
    Payment,
    PlanType,
    Product,
    Subscription,
    SubscriptionStatus,
)


class ContractAmendmentPhase1ApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username="amend_admin", password="pass1234", role="ADMIN", phone="9800000100")
        self.cashier = User.objects.create_user(username="amend_cashier", password="pass1234", role="CASHIER", phone="9800000101")
        self.vendor = User.objects.create_user(username="amend_vendor", password="pass1234", role="VENDOR", phone="9800000102")
        self.customer_user = User.objects.create_user(username="amend_customer", password="pass1234", role="CUSTOMER", phone="9800000103")
        self.other_customer_user = User.objects.create_user(username="amend_other_customer", password="pass1234", role="CUSTOMER", phone="9800000104")
        self.partner_user = User.objects.create_user(username="amend_partner", password="pass1234", role="PARTNER", phone="9800000105")
        self.other_partner_user = User.objects.create_user(username="amend_other_partner", password="pass1234", role="PARTNER", phone="9800000106")

        self.customer = Customer.objects.create(user=self.customer_user, name="Amend Customer", phone="9800000103", address="Old Address")
        self.other_customer = Customer.objects.create(user=self.other_customer_user, name="Other Customer", phone="9800000104")
        self.product = Product.objects.create(product_code="AMD-PROD-1", name="Amend Product", base_price=Decimal("20000.00"), is_active=True)
        self.batch = Batch.objects.create(batch_code="AMD-BATCH-1", total_slots=100, duration_months=10, draw_day=5, start_date=date(2026, 1, 1), status=BatchStatus.OPEN)
        self.lucky_id = LuckyId.objects.filter(batch=self.batch, lucky_number=1).first()
        if self.lucky_id is None:
            self.lucky_id = LuckyId.objects.create(batch=self.batch, lucky_number=1)
        self.other_lucky_id = LuckyId.objects.filter(batch=self.batch, lucky_number=2).first()
        if self.other_lucky_id is None:
            self.other_lucky_id = LuckyId.objects.create(batch=self.batch, lucky_number=2)
        self.subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            partner=self.partner_user,
            batch=self.batch,
            lucky_id=self.lucky_id,
            plan_type=PlanType.EMI,
            tenure_months=10,
            start_date=date(2026, 1, 1),
            total_amount=Decimal("20000.00"),
            monthly_amount=Decimal("2000.00"),
            status=SubscriptionStatus.ACTIVE,
        )
        self.other_subscription = Subscription.objects.create(
            customer=self.other_customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.other_lucky_id,
            plan_type=PlanType.EMI,
            tenure_months=10,
            start_date=date(2026, 1, 1),
            total_amount=Decimal("20000.00"),
            monthly_amount=Decimal("2000.00"),
            status=SubscriptionStatus.ACTIVE,
        )
        self.rent_subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            partner=self.partner_user,
            plan_type=PlanType.RENT,
            tenure_months=6,
            start_date=date(2026, 2, 1),
            total_amount=Decimal("6000.00"),
            monthly_amount=Decimal("1000.00"),
            status=SubscriptionStatus.ACTIVE,
        )

    def test_customer_can_request_own_emi_amendment_without_mutating_contract(self):
        original_address = self.customer.address
        original_total = self.subscription.total_amount
        original_payment_count = Payment.objects.count()
        self.client.force_authenticate(self.customer_user)
        response = self.client.post(
            "/api/v1/customer/contract-amendments/",
            {
                "contract_type": "EMI_SUBSCRIPTION",
                "subscription": self.subscription.id,
                "amendment_type": "ADDRESS_CHANGE",
                "requested_values": {"address": "New Address"},
                "reason": "Customer shifted house.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["status"], "REQUESTED")
        self.assertEqual(response.data["requested_role"], "CUSTOMER")
        self.assertEqual(response.data["contract_type"], "EMI_SUBSCRIPTION")
        self.customer.refresh_from_db()
        self.subscription.refresh_from_db()
        self.assertEqual(self.customer.address, original_address)
        self.assertEqual(self.subscription.total_amount, original_total)
        self.assertEqual(Payment.objects.count(), original_payment_count)

    def test_customer_can_request_own_rent_lease_amendment(self):
        self.client.force_authenticate(self.customer_user)
        response = self.client.post(
            "/api/v1/customer/contract-amendments/",
            {
                "contract_type": "RENT_LEASE",
                "rent_lease_contract": self.rent_subscription.id,
                "amendment_type": "CONTACT_CORRECTION",
                "requested_values": {"phone": "9800000999"},
                "reason": "Phone correction.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["contract_type"], "RENT_LEASE")
        self.assertEqual(response.data["rent_lease_contract"], self.rent_subscription.id)

    def test_customer_cannot_access_another_customer_amendment(self):
        amendment = ContractAmendment.objects.create(
            subscription=self.other_subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.other_customer,
            requested_by=self.other_customer_user,
            requested_role="CUSTOMER",
            amendment_type="ADDRESS_CHANGE",
            reason="Other customer request.",
        )
        self.client.force_authenticate(self.customer_user)
        response = self.client.get(f"/api/v1/customer/contract-amendments/{amendment.id}/")
        self.assertEqual(response.status_code, 404)

    def test_partner_can_request_linked_amendment_and_unlinked_partner_cannot_access(self):
        self.client.force_authenticate(self.partner_user)
        response = self.client.post(
            "/api/v1/partner/contract-amendments/",
            {
                "contract_type": "EMI_SUBSCRIPTION",
                "subscription": self.subscription.id,
                "amendment_type": "LEGAL_DOCUMENT_CORRECTION",
                "requested_values": {"document_name": "Corrected ID"},
                "reason": "Document spelling correction.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        amendment_id = response.data["id"]
        self.client.force_authenticate(self.other_partner_user)
        denied = self.client.get(f"/api/v1/partner/contract-amendments/{amendment_id}/")
        self.assertEqual(denied.status_code, 404)

    def test_admin_can_review_approve_and_reject_with_reason_required(self):
        amendment = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            partner=self.partner_user,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="ADDRESS_CHANGE",
            reason="Address review.",
        )
        self.client.force_authenticate(self.admin)
        review = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/review/", {"admin_note": "Checking."}, format="json")
        self.assertEqual(review.status_code, 200, review.data)
        self.assertEqual(review.data["status"], "UNDER_REVIEW")
        approve = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/approve/", {"approved_values": {"address": "Approved"}}, format="json")
        self.assertEqual(approve.status_code, 200, approve.data)
        self.assertEqual(approve.data["status"], "APPROVED")
        self.assertEqual(approve.data["implemented_values"], {})

        reject_target = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="OTHER",
            reason="Rejectable request.",
        )
        missing_reason = self.client.post(f"/api/v1/admin/contract-amendments/{reject_target.id}/reject/", {}, format="json")
        self.assertEqual(missing_reason.status_code, 400)
        rejected = self.client.post(f"/api/v1/admin/contract-amendments/{reject_target.id}/reject/", {"rejection_reason": "Not enough proof."}, format="json")
        self.assertEqual(rejected.status_code, 200, rejected.data)
        self.assertEqual(rejected.data["status"], "REJECTED")

    def test_direct_sale_impossible_and_cashier_vendor_denied(self):
        self.client.force_authenticate(self.customer_user)
        direct_sale_attempt = self.client.post(
            "/api/v1/customer/contract-amendments/",
            {
                "contract_type": "DIRECT_SALE",
                "subscription": self.subscription.id,
                "amendment_type": "ADDRESS_CHANGE",
                "requested_values": {},
                "reason": "Should fail.",
            },
            format="json",
        )
        self.assertEqual(direct_sale_attempt.status_code, 400)

        self.client.force_authenticate(self.cashier)
        cashier_response = self.client.get("/api/v1/admin/contract-amendments/")
        self.assertEqual(cashier_response.status_code, 403)
        self.client.force_authenticate(self.vendor)
        vendor_response = self.client.get("/api/v1/admin/contract-amendments/")
        self.assertEqual(vendor_response.status_code, 403)
