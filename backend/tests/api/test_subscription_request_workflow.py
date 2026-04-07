from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import (
    AuditLog,
    Emi,
    LuckyIdStatus,
    Payment,
    Subscription,
    SubscriptionRequest,
    SubscriptionRequestStatus,
)
from subscriptions.services.subscription_request_service import (
    subscription_request_lock_queryset,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class SubscriptionRequestWorkflowApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="subscription_request_admin",
            phone="9500000001",
            email="subscription-admin@example.com",
        )
        self.partner = create_partner_user(
            username="subscription_request_partner",
            phone="9500000002",
            email="subscription-partner@example.com",
        )
        self.partner.commission_rate = Decimal("5.00")
        self.partner.save(update_fields=["commission_rate"])

        self.customer_user = create_customer_user(
            username="subscription_request_customer",
            phone="9500000003",
            email="subscription-customer@example.com",
        )
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Subscription Request Customer",
            phone="9500000003",
        )
        self.customer.address = "Customer Address"
        self.customer.city = "Dhaka"
        self.customer.save(update_fields=["address", "city"])

        self.partner_customer_user = create_customer_user(
            username="subscription_partner_visible_customer",
            phone="9500000004",
            email="partner-visible@example.com",
        )
        self.partner_customer = create_customer_profile(
            user=self.partner_customer_user,
            name="Partner Visible Customer",
            phone="9500000004",
        )

        self.other_customer_user = create_customer_user(
            username="subscription_other_customer",
            phone="9500000005",
            email="other-customer@example.com",
        )
        self.other_customer = create_customer_profile(
            user=self.other_customer_user,
            name="Other Customer",
            phone="9500000005",
        )

        self.product = create_product(
            name="Subscription Request Product",
            product_code="REQ-001",
            base_price=Decimal("12000.00"),
        )
        self.batch = create_batch(
            batch_code="REQBATCH2026",
            duration_months=12,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 4, 1),
        )

        self.lucky_1 = create_lucky_id(batch=self.batch, lucky_number=1)
        self.lucky_2 = create_lucky_id(batch=self.batch, lucky_number=2)
        self.lucky_3 = create_lucky_id(batch=self.batch, lucky_number=3)
        self.lucky_4 = create_lucky_id(batch=self.batch, lucky_number=4)
        self.lucky_5 = create_lucky_id(batch=self.batch, lucky_number=5)
        self.lucky_6 = create_lucky_id(batch=self.batch, lucky_number=6)
        self.partner_visible_lucky = create_lucky_id(batch=self.batch, lucky_number=31)

        self.partner_visible_subscription = create_subscription(
            customer=self.partner_customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.partner_visible_lucky,
            partner=self.partner,
            total_amount=Decimal("12000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=12,
            start_date=date(2026, 4, 1),
        )
        self.partner_visible_lucky.status = LuckyIdStatus.ASSIGNED
        self.partner_visible_lucky.save(update_fields=["status"])

    def test_customer_request_create_list_cancel_keeps_financial_rows_uncreated(self):
        self.client.force_authenticate(user=self.customer_user)

        before_subscription_count = Subscription.objects.count()
        before_emi_count = Emi.objects.count()
        before_payment_count = Payment.objects.count()

        create_response = self.client.post(
            "/api/v1/customer/subscription-requests/",
            {
                "product_id": self.product.id,
                "batch_id": self.batch.id,
                "preferred_lucky_number": 1,
                "notes": "Customer self-service request",
            },
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        request_id = create_response.data["request"]["id"]
        request_obj = SubscriptionRequest.objects.get(pk=request_id)

        self.assertEqual(request_obj.status, SubscriptionRequestStatus.SUBMITTED)
        self.assertEqual(request_obj.customer_id, self.customer.id)
        self.assertEqual(request_obj.requester_id, self.customer_user.id)
        self.assertEqual(Subscription.objects.count(), before_subscription_count)
        self.assertEqual(Emi.objects.count(), before_emi_count)
        self.assertEqual(Payment.objects.count(), before_payment_count)
        self.lucky_1.refresh_from_db()
        self.assertEqual(self.lucky_1.status, LuckyIdStatus.AVAILABLE)

        list_response = self.client.get("/api/v1/customer/subscription-requests/")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK, list_response.data)
        self.assertEqual(list_response.data["count"], 1)
        self.assertEqual(list_response.data["results"][0]["status"], SubscriptionRequestStatus.SUBMITTED)

        cancel_response = self.client.post(
            f"/api/v1/customer/subscription-requests/{request_id}/cancel/",
            {},
            format="json",
        )
        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK, cancel_response.data)
        request_obj.refresh_from_db()
        self.assertEqual(request_obj.status, SubscriptionRequestStatus.CANCELLED)

        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.SUBSCRIPTION_REQUEST_CREATED,
                object_id=request_obj.id,
            ).exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.SUBSCRIPTION_REQUEST_CANCELLED,
                object_id=request_obj.id,
            ).exists()
        )

    def test_subscription_request_lock_queryset_avoids_nullable_outer_joins(self):
        query = str(subscription_request_lock_queryset().filter(pk=1).query).upper()

        self.assertNotIn("LEFT OUTER JOIN", query)

    def test_partner_options_and_existing_customer_request_are_scoped_to_partner_visible_customers(self):
        self.client.force_authenticate(user=self.partner)

        options_response = self.client.get(
            "/api/v1/partner/subscription-request-options/",
            {"batch": self.batch.id},
        )
        self.assertEqual(options_response.status_code, status.HTTP_200_OK, options_response.data)
        self.assertIn(self.product.id, [item["id"] for item in options_response.data["products"]])
        self.assertIn(self.batch.id, [item["id"] for item in options_response.data["batches"]])
        self.assertIn(2, options_response.data["lucky_numbers"])
        self.assertEqual(len(options_response.data["customers"]), 1)
        self.assertEqual(options_response.data["customers"][0]["id"], self.partner_customer.id)

        create_response = self.client.post(
            "/api/v1/partner/subscription-requests/",
            {
                "customer_id": self.partner_customer.id,
                "product_id": self.product.id,
                "batch_id": self.batch.id,
                "preferred_lucky_number": 2,
                "notes": "Partner request for visible customer",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        self.assertEqual(
            create_response.data["request"]["customer_id"],
            self.partner_customer.id,
        )
        self.assertEqual(
            create_response.data["request"]["status"],
            SubscriptionRequestStatus.SUBMITTED,
        )

        denied_response = self.client.post(
            "/api/v1/partner/subscription-requests/",
            {
                "customer_id": self.other_customer.id,
                "product_id": self.product.id,
                "batch_id": self.batch.id,
                "preferred_lucky_number": 3,
            },
            format="json",
        )
        self.assertEqual(denied_response.status_code, status.HTTP_404_NOT_FOUND, denied_response.data)

    def test_admin_can_approve_existing_linked_customer_request_without_creating_new_customer(self):
        self.client.force_authenticate(user=self.customer_user)

        before_customer_count = self.customer.__class__.objects.count()
        before_subscription_count = Subscription.objects.count()
        before_emi_count = Emi.objects.count()
        before_payment_count = Payment.objects.count()

        create_response = self.client.post(
            "/api/v1/customer/subscription-requests/",
            {
                "product_id": self.product.id,
                "batch_id": self.batch.id,
                "preferred_lucky_number": 2,
                "notes": "Approve my linked customer request",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        request_id = create_response.data["request"]["id"]

        self.client.force_authenticate(user=self.admin)
        approve_response = self.client.post(
            f"/api/v1/admin/subscription-requests/{request_id}/approve/",
            {"review_note": "Approved existing customer request"},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK, approve_response.data)

        request_obj = SubscriptionRequest.objects.get(pk=request_id)
        subscription = Subscription.objects.get(pk=request_obj.approved_subscription_id)

        self.assertEqual(request_obj.status, SubscriptionRequestStatus.APPROVED)
        self.assertEqual(request_obj.customer_id, self.customer.id)
        self.assertEqual(subscription.customer_id, self.customer.id)
        self.assertIsNone(subscription.partner_id)
        self.assertEqual(subscription.product_id, self.product.id)
        self.assertEqual(subscription.batch_id, self.batch.id)
        self.assertEqual(subscription.lucky_id.lucky_number, 2)
        self.assertEqual(self.customer.__class__.objects.count(), before_customer_count)
        self.assertEqual(Subscription.objects.count(), before_subscription_count + 1)
        self.assertEqual(
            Emi.objects.count(),
            before_emi_count + self.batch.duration_months,
        )
        self.assertEqual(Payment.objects.count(), before_payment_count)
        self.lucky_2.refresh_from_db()
        self.assertEqual(self.lucky_2.status, LuckyIdStatus.ASSIGNED)

    def test_partner_new_customer_request_requires_admin_approval_before_real_subscription(self):
        self.client.force_authenticate(user=self.partner)

        before_customer_count = self.customer.__class__.objects.count()
        before_subscription_count = Subscription.objects.count()
        before_emi_count = Emi.objects.count()
        before_payment_count = Payment.objects.count()

        create_response = self.client.post(
            "/api/v1/partner/subscription-requests/",
            {
                "requested_customer_name": "Approval Flow Customer",
                "requested_customer_phone": "9500000011",
                "requested_customer_email": "approval-flow@example.com",
                "requested_customer_address": "Approval Road",
                "requested_customer_city": "Khulna",
                "product_id": self.product.id,
                "batch_id": self.batch.id,
                "preferred_lucky_number": 3,
                "notes": "Needs admin approval",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        request_id = create_response.data["request"]["id"]

        self.assertEqual(self.customer.__class__.objects.count(), before_customer_count)
        self.assertEqual(Subscription.objects.count(), before_subscription_count)
        self.assertEqual(Emi.objects.count(), before_emi_count)
        self.assertEqual(Payment.objects.count(), before_payment_count)
        self.lucky_3.refresh_from_db()
        self.assertEqual(self.lucky_3.status, LuckyIdStatus.AVAILABLE)

        self.client.force_authenticate(user=self.admin)
        approve_response = self.client.post(
            f"/api/v1/admin/subscription-requests/{request_id}/approve/",
            {"create_customer": True, "review_note": "Approved by admin"},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK, approve_response.data)

        request_obj = SubscriptionRequest.objects.get(pk=request_id)
        subscription = Subscription.objects.get(pk=request_obj.approved_subscription_id)

        self.assertEqual(request_obj.status, SubscriptionRequestStatus.APPROVED)
        self.assertIsNotNone(request_obj.customer_id)
        self.assertEqual(request_obj.reviewed_by_id, self.admin.id)
        self.assertEqual(subscription.customer_id, request_obj.customer_id)
        self.assertEqual(subscription.partner_id, self.partner.id)
        self.assertEqual(subscription.product_id, self.product.id)
        self.assertEqual(subscription.batch_id, self.batch.id)
        self.assertEqual(subscription.lucky_id.lucky_number, 3)
        self.assertEqual(subscription.status, "ACTIVE")
        self.assertEqual(subscription.emis.count(), self.batch.duration_months)
        self.assertEqual(Payment.objects.count(), before_payment_count)
        self.assertEqual(self.customer.__class__.objects.count(), before_customer_count + 1)

        created_customer = request_obj.customer
        self.assertEqual(created_customer.user.email, "approval-flow@example.com")
        self.lucky_3.refresh_from_db()
        self.assertEqual(self.lucky_3.status, LuckyIdStatus.ASSIGNED)

        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.SUBSCRIPTION_REQUEST_APPROVED,
                object_id=request_obj.id,
            ).exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.USER_CREATED,
                model_name="Customer",
                object_id=created_customer.id,
            ).exists()
        )

    def test_failed_new_customer_approval_rolls_back_customer_creation_and_subscription_side_effects(self):
        self.client.force_authenticate(user=self.partner)

        create_response = self.client.post(
            "/api/v1/partner/subscription-requests/",
            {
                "requested_customer_name": "Rollback Approval Customer",
                "requested_customer_phone": "9500000016",
                "requested_customer_email": "rollback-approval@example.com",
                "requested_customer_address": "Rollback Road",
                "requested_customer_city": "Rajshahi",
                "product_id": self.product.id,
                "batch_id": self.batch.id,
                "preferred_lucky_number": 6,
                "notes": "Fails after customer snapshot validation",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        request_id = create_response.data["request"]["id"]

        self.lucky_6.status = LuckyIdStatus.ASSIGNED
        self.lucky_6.save(update_fields=["status"])

        before_customer_count = self.customer.__class__.objects.count()
        before_user_count = self.customer_user.__class__.objects.count()
        before_subscription_count = Subscription.objects.count()
        before_emi_count = Emi.objects.count()
        before_payment_count = Payment.objects.count()

        self.client.force_authenticate(user=self.admin)
        approve_response = self.client.post(
            f"/api/v1/admin/subscription-requests/{request_id}/approve/",
            {"create_customer": True, "review_note": "Should roll back"},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_400_BAD_REQUEST, approve_response.data)
        self.assertIn("preferred_lucky_number", approve_response.data)

        request_obj = SubscriptionRequest.objects.get(pk=request_id)
        self.assertEqual(request_obj.status, SubscriptionRequestStatus.SUBMITTED)
        self.assertIsNone(request_obj.customer_id)
        self.assertIsNone(request_obj.approved_subscription_id)
        self.assertEqual(self.customer.__class__.objects.count(), before_customer_count)
        self.assertEqual(self.customer_user.__class__.objects.count(), before_user_count)
        self.assertEqual(Subscription.objects.count(), before_subscription_count)
        self.assertEqual(Emi.objects.count(), before_emi_count)
        self.assertEqual(Payment.objects.count(), before_payment_count)
        self.assertFalse(
            self.customer_user.__class__.objects.filter(
                email="rollback-approval@example.com"
            ).exists()
        )
        self.assertFalse(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.SUBSCRIPTION_REQUEST_APPROVED,
                object_id=request_obj.id,
            ).exists()
        )
        self.assertFalse(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.USER_CREATED,
                metadata__username__icontains="rollbackapprovalcustomer",
            ).exists()
        )

    def test_admin_can_override_lucky_number_on_approval_when_preferred_is_unavailable(self):
        self.client.force_authenticate(user=self.customer_user)

        create_response = self.client.post(
            "/api/v1/customer/subscription-requests/",
            {
                "product_id": self.product.id,
                "batch_id": self.batch.id,
                "preferred_lucky_number": 4,
                "notes": "Customer request with fallback lucky number",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        request_id = create_response.data["request"]["id"]

        self.lucky_4.status = LuckyIdStatus.ASSIGNED
        self.lucky_4.save(update_fields=["status"])

        self.client.force_authenticate(user=self.admin)
        approve_response = self.client.post(
            f"/api/v1/admin/subscription-requests/{request_id}/approve/",
            {"lucky_number_override": 5, "review_note": "Override lucky number"},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK, approve_response.data)

        request_obj = SubscriptionRequest.objects.get(pk=request_id)
        subscription = Subscription.objects.get(pk=request_obj.approved_subscription_id)

        self.assertEqual(subscription.customer_id, self.customer.id)
        self.assertEqual(subscription.lucky_id.lucky_number, 5)
        self.assertEqual(request_obj.status, SubscriptionRequestStatus.APPROVED)
        self.lucky_5.refresh_from_db()
        self.assertEqual(self.lucky_5.status, LuckyIdStatus.ASSIGNED)

    def test_admin_can_reject_request_and_rejected_request_cannot_be_approved(self):
        self.client.force_authenticate(user=self.customer_user)

        create_response = self.client.post(
            "/api/v1/customer/subscription-requests/",
            {
                "product_id": self.product.id,
                "batch_id": self.batch.id,
                "preferred_lucky_number": 6,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        request_id = create_response.data["request"]["id"]

        self.client.force_authenticate(user=self.admin)
        reject_response = self.client.post(
            f"/api/v1/admin/subscription-requests/{request_id}/reject/",
            {"reason": "Batch allocation postponed"},
            format="json",
        )
        self.assertEqual(reject_response.status_code, status.HTTP_200_OK, reject_response.data)

        request_obj = SubscriptionRequest.objects.get(pk=request_id)
        self.assertEqual(request_obj.status, SubscriptionRequestStatus.REJECTED)
        self.assertEqual(request_obj.reviewed_by_id, self.admin.id)
        self.assertEqual(request_obj.approved_subscription_id, None)
        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.SUBSCRIPTION_REQUEST_REJECTED,
                object_id=request_obj.id,
            ).exists()
        )

        approve_response = self.client.post(
            f"/api/v1/admin/subscription-requests/{request_id}/approve/",
            {"review_note": "Should not approve"},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_400_BAD_REQUEST, approve_response.data)

    def test_admin_direct_subscription_create_flow_still_works(self):
        direct_lucky = create_lucky_id(batch=self.batch, lucky_number=7)
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/v1/admin/subscriptions/",
            {
                "customer": self.customer.id,
                "product": self.product.id,
                "partner": self.partner.id,
                "batch": self.batch.id,
                "lucky_id": direct_lucky.id,
                "plan_type": "EMI",
                "tenure_months": self.batch.duration_months,
                "start_date": "2026-04-01",
                "status": "ACTIVE",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        created_subscription = Subscription.objects.get(pk=response.data["id"])
        self.assertEqual(created_subscription.customer_id, self.customer.id)
        self.assertEqual(created_subscription.partner_id, self.partner.id)
        self.assertEqual(created_subscription.batch_id, self.batch.id)
        self.assertEqual(created_subscription.lucky_id_id, direct_lucky.id)
        self.assertEqual(created_subscription.emis.count(), self.batch.duration_months)
