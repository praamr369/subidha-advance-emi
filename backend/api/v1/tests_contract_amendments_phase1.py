from datetime import date
from decimal import Decimal

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.models import (
    AuditLog,
    Batch,
    BatchStatus,
    ContractAmendment,
    Emi,
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

    def test_admin_can_implement_approved_safe_customer_contact_correction(self):
        original_address = self.customer.address
        original_city = self.customer.city
        original_total = self.subscription.total_amount
        original_monthly = self.subscription.monthly_amount
        payment_count = Payment.objects.count()
        emi_count = Emi.objects.count()
        receipt_model = apps.get_model("billing", "ReceiptDocument", require_ready=False)
        receipt_count = receipt_model.objects.count()

        amendment = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            partner=self.partner_user,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="CONTACT_CORRECTION",
            status="APPROVED",
            requested_values={"phone": "9800000999"},
            approved_values={"phone": "9800000999"},
            reason="Customer phone digit correction.",
            approved_by=self.admin,
        )

        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "IMPLEMENTED")
        self.assertEqual(response.data["implemented_by"], self.admin.id)
        self.assertTrue(response.data["implemented_at"])
        self.assertEqual(response.data["implemented_values"]["fields"]["phone"]["before"], "9800000103")
        self.assertEqual(response.data["implemented_values"]["fields"]["phone"]["after"], "9800000999")

        self.customer.refresh_from_db()
        self.subscription.refresh_from_db()
        self.assertEqual(self.customer.phone, "9800000999")
        self.assertEqual(self.customer.address, original_address)
        self.assertEqual(self.customer.city, original_city)
        self.assertEqual(self.subscription.total_amount, original_total)
        self.assertEqual(self.subscription.monthly_amount, original_monthly)
        self.assertEqual(Payment.objects.count(), payment_count)
        self.assertEqual(Emi.objects.count(), emi_count)
        self.assertEqual(receipt_model.objects.count(), receipt_count)
        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_IMPLEMENTED,
                object_id=self.subscription.id,
                metadata__amendment_id=amendment.id,
            ).exists()
        )

    def test_admin_can_implement_approved_safe_customer_address_correction(self):
        amendment = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            partner=self.partner_user,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="ADDRESS_CHANGE",
            status="APPROVED",
            requested_values={"address": "Corrected Address", "city": "Kathmandu"},
            approved_values={"address": "Corrected Address", "city": "Kathmandu"},
            reason="Customer address correction.",
            approved_by=self.admin,
        )

        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.address, "Corrected Address")
        self.assertEqual(self.customer.city, "Kathmandu")

    def test_second_implementation_attempt_is_rejected(self):
        amendment = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="CONTACT_CORRECTION",
            status="APPROVED",
            approved_values={"phone": "9800000888"},
            reason="Phone correction.",
            approved_by=self.admin,
        )

        self.client.force_authenticate(self.admin)
        first = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")
        second = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")

        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 400)
        self.assertIn("already implemented", str(second.data).lower())

    def test_non_approved_amendments_cannot_be_implemented(self):
        for blocked_status in ["REQUESTED", "UNDER_REVIEW", "REJECTED", "CANCELLED"]:
            with self.subTest(status=blocked_status):
                amendment = ContractAmendment.objects.create(
                    subscription=self.subscription,
                    contract_type="EMI_SUBSCRIPTION",
                    customer=self.customer,
                    requested_by=self.customer_user,
                    requested_role="CUSTOMER",
                    amendment_type="CONTACT_CORRECTION",
                    status=blocked_status,
                    approved_values={"phone": "9800000777"},
                    rejection_reason="Rejected." if blocked_status == "REJECTED" else "",
                    reason=f"{blocked_status} phone correction.",
                )
                self.client.force_authenticate(self.admin)
                response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")
                self.assertEqual(response.status_code, 400, response.data)

    def test_unsupported_and_financial_amendment_types_are_rejected_for_implementation(self):
        blocked_types = [
            "PRODUCT_CHANGE",
            "LUCKY_ID_CHANGE",
            "BATCH_CHANGE",
            "EMI_AMOUNT_CHANGE",
            "TENURE_CHANGE",
            "CONTRACT_PRICE_CHANGE",
            "PAYMENT_ADJUSTMENT",
            "WAIVER_CHANGE",
            "RENT_AMOUNT_CHANGE",
            "LEASE_AMOUNT_CHANGE",
            "SECURITY_DEPOSIT_CHANGE",
            "ACCOUNTING_CHANGE",
        ]

        for amendment_type in blocked_types:
            with self.subTest(amendment_type=amendment_type):
                amendment = ContractAmendment.objects.create(
                    subscription=self.subscription,
                    contract_type="EMI_SUBSCRIPTION",
                    customer=self.customer,
                    requested_by=self.customer_user,
                    requested_role="CUSTOMER",
                    amendment_type="OTHER",
                    status="APPROVED",
                    approved_values={"amount": "1.00"},
                    reason=f"Blocked {amendment_type}.",
                    approved_by=self.admin,
                )
                ContractAmendment.objects.filter(pk=amendment.pk).update(amendment_type=amendment_type)
                self.client.force_authenticate(self.admin)
                response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn("blocked", str(response.data).lower())

    def test_non_admin_roles_cannot_call_implement_endpoint(self):
        amendment = ContractAmendment.objects.create(
            subscription=self.subscription,
            contract_type="EMI_SUBSCRIPTION",
            customer=self.customer,
            requested_by=self.customer_user,
            requested_role="CUSTOMER",
            amendment_type="CONTACT_CORRECTION",
            status="APPROVED",
            approved_values={"phone": "9800000666"},
            reason="Phone correction.",
            approved_by=self.admin,
        )
        for user in [self.customer_user, self.partner_user, self.cashier, self.vendor]:
            with self.subTest(role=user.role):
                self.client.force_authenticate(user)
                response = self.client.post(f"/api/v1/admin/contract-amendments/{amendment.id}/implement/", {}, format="json")
                self.assertEqual(response.status_code, 403)
