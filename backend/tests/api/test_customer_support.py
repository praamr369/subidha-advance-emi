from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import AuditLog, CustomerSupportRequest
from subscriptions.services.customer_support_service import (
    create_customer_support_request,
    resolve_customer_support_request,
)
from subscriptions.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class CustomerSupportApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="support_admin", phone="9000000901")
        self.cashier = create_cashier_user(
            username="support_cashier",
            phone="9000000904",
        )

        self.customer_user = create_customer_user(
            username="support_customer",
            phone="9000000902",
        )
        self.other_customer_user = create_customer_user(
            username="support_customer_other",
            phone="9000000903",
        )

        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Support Customer",
            phone="9000000902",
        )
        self.other_customer = create_customer_profile(
            user=self.other_customer_user,
            name="Other Customer",
            phone="9000000903",
        )

        self.product = create_product(
            name="Support Product",
            product_code="SUPPORT-001",
            base_price=Decimal("3200.00"),
        )
        self.batch = create_batch(
            batch_code="SUPPORT2026",
            duration_months=12,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.lucky_id_1 = create_lucky_id(batch=self.batch, lucky_number=31)
        self.lucky_id_2 = create_lucky_id(batch=self.batch, lucky_number=32)

        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id_1,
            total_amount=Decimal("3200.00"),
            monthly_amount=Decimal("320.00"),
            tenure_months=12,
        )
        self.other_subscription = create_subscription(
            customer=self.other_customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id_2,
            total_amount=Decimal("3300.00"),
            monthly_amount=Decimal("330.00"),
            tenure_months=12,
        )

        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("320.00"),
            due_date=date(2026, 3, 7),
        )
        self.other_emi = create_emi(
            subscription=self.other_subscription,
            month_no=1,
            amount=Decimal("330.00"),
            due_date=date(2026, 3, 8),
        )

        self.payment = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("320.00"),
            collected_by=self.admin,
            method="UPI",
            reference_no="SUPPORT-PAY-001",
        )["payment"]
        self.other_payment = record_emi_payment(
            emi_id=self.other_emi.id,
            amount=Decimal("330.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="SUPPORT-PAY-002",
        )["payment"]

    def test_customer_can_submit_support_request_from_own_payment(self):
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.post(
            "/api/v1/customer/support-requests/",
            {
                "payment": self.payment.id,
                "subscription": self.subscription.id,
                "category": "PAYMENT_ISSUE",
                "message": "Payment is recorded but I need receipt clarification.",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            msg=f"Unexpected customer support submission response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["request"]["payment"], self.payment.id)
        self.assertEqual(
            response.data["request"]["subscription"],
            self.subscription.id,
        )
        self.assertEqual(response.data["request"]["status"], "SUBMITTED")
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="CustomerSupportRequest",
                object_id=response.data["request"]["id"],
                action_type=AuditLog.ActionType.SUPPORT_REQUEST_CREATED,
            ).exists()
        )

    def test_customer_cannot_submit_support_request_for_other_payment(self):
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.post(
            "/api/v1/customer/support-requests/",
            {
                "payment": self.other_payment.id,
                "category": "PAYMENT_ISSUE",
                "message": "This should be blocked.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("payment", response.data)

    def test_customer_support_request_list_is_self_scoped(self):
        create_customer_support_request(
            customer=self.customer,
            category="PAYMENT_ISSUE",
            message="Own support request.",
            payment=self.payment,
            performed_by=self.customer_user,
        )
        create_customer_support_request(
            customer=self.other_customer,
            category="OTHER",
            message="Other customer support request.",
            payment=self.other_payment,
            performed_by=self.other_customer_user,
        )

        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get("/api/v1/customer/support-requests/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["customer"], self.customer.id)

    def test_admin_can_view_support_request_register(self):
        support_request = create_customer_support_request(
            customer=self.customer,
            category="RECEIPT_ISSUE",
            message="Receipt copy is unclear.",
            payment=self.payment,
            performed_by=self.customer_user,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/support-requests/?q=SUPPORT-PAY-001")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected admin support list response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["summary"]["submitted"], 1)
        self.assertEqual(response.data["results"][0]["id"], support_request.id)
        self.assertEqual(
            response.data["results"][0]["payment_reference_no"],
            "SUPPORT-PAY-001",
        )

    def test_admin_can_view_support_request_detail(self):
        support_request = create_customer_support_request(
            customer=self.customer,
            category="PAYMENT_ISSUE",
            message="Please verify this payment.",
            payment=self.payment,
            performed_by=self.customer_user,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            f"/api/v1/admin/support-requests/{support_request.id}/"
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected admin support detail response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["id"], support_request.id)
        self.assertEqual(response.data["customer"], self.customer.id)
        self.assertEqual(response.data["payment"], self.payment.id)
        self.assertEqual(response.data["status"], "SUBMITTED")

    def test_customer_can_view_own_support_request_detail_with_resolution_summary(self):
        support_request = create_customer_support_request(
            customer=self.customer,
            category="RECEIPT_ISSUE",
            message="Need receipt clarification.",
            payment=self.payment,
            performed_by=self.customer_user,
        )
        resolve_customer_support_request(
            support_request=support_request,
            resolution_summary="Receipt issue reviewed and the corrected explanation was shared.",
            performed_by=self.admin,
        )

        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get(
            f"/api/v1/customer/support-requests/{support_request.id}/"
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected customer support detail response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["id"], support_request.id)
        self.assertEqual(response.data["status"], "CLOSED")
        self.assertIn("corrected explanation", response.data["resolution_summary"])
        self.assertNotIn("internal_notes", response.data)
        self.assertNotIn("assigned_to_id", response.data)

    def test_customer_cannot_view_other_customer_support_request_detail(self):
        support_request = create_customer_support_request(
            customer=self.other_customer,
            category="OTHER",
            message="Other customer request.",
            payment=self.other_payment,
            performed_by=self.other_customer_user,
        )

        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get(
            f"/api/v1/customer/support-requests/{support_request.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_can_update_support_request_status_assignment_and_notes(self):
        support_request = create_customer_support_request(
            customer=self.customer,
            category="PAYMENT_ISSUE",
            message="Need payment clarification.",
            payment=self.payment,
            performed_by=self.customer_user,
        )

        self.client.force_authenticate(user=self.admin)

        status_response = self.client.post(
            f"/api/v1/admin/support-requests/{support_request.id}/status/",
            {"status": "UNDER_REVIEW"},
            format="json",
        )
        self.assertEqual(
            status_response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected status update response: {status_response.status_code} {status_response.data}",
        )
        self.assertEqual(status_response.data["status"], "UNDER_REVIEW")

        assign_response = self.client.post(
            f"/api/v1/admin/support-requests/{support_request.id}/assign/",
            {"assigned_to": self.cashier.id},
            format="json",
        )
        self.assertEqual(
            assign_response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected assignment update response: {assign_response.status_code} {assign_response.data}",
        )
        self.assertEqual(assign_response.data["assigned_to_id"], self.cashier.id)

        notes_response = self.client.post(
            f"/api/v1/admin/support-requests/{support_request.id}/notes/",
            {"mode": "append", "note": "Customer called branch and requested callback."},
            format="json",
        )
        self.assertEqual(
            notes_response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected note update response: {notes_response.status_code} {notes_response.data}",
        )
        self.assertIn("requested callback", notes_response.data["internal_notes"])

        support_request.refresh_from_db()
        self.assertEqual(support_request.status, "UNDER_REVIEW")
        self.assertEqual(support_request.assigned_to_id, self.cashier.id)
        self.assertIn("requested callback", support_request.internal_notes)

        self.assertTrue(
            AuditLog.objects.filter(
                model_name="CustomerSupportRequest",
                object_id=support_request.id,
                action_type=AuditLog.ActionType.SUPPORT_REQUEST_STATUS_UPDATED,
            ).exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="CustomerSupportRequest",
                object_id=support_request.id,
                action_type=AuditLog.ActionType.SUPPORT_REQUEST_ASSIGNED,
            ).exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="CustomerSupportRequest",
                object_id=support_request.id,
                action_type=AuditLog.ActionType.SUPPORT_REQUEST_NOTE_UPDATED,
            ).exists()
        )

    def test_admin_cannot_close_support_request_without_resolution_action(self):
        support_request = create_customer_support_request(
            customer=self.customer,
            category="PAYMENT_ISSUE",
            message="Need explicit closure metadata.",
            payment=self.payment,
            performed_by=self.customer_user,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/v1/admin/support-requests/{support_request.id}/status/",
            {"status": "CLOSED"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        support_request.refresh_from_db()
        self.assertEqual(support_request.status, "SUBMITTED")
        self.assertIsNone(support_request.resolved_at)
        self.assertEqual(support_request.resolution_summary, "")

    def test_admin_can_resolve_support_request_with_required_summary(self):
        support_request = create_customer_support_request(
            customer=self.customer,
            category="RECEIPT_ISSUE",
            message="Receipt still not matching branch copy.",
            payment=self.payment,
            performed_by=self.customer_user,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/v1/admin/support-requests/{support_request.id}/resolve/",
            {"resolution_summary": "Receipt issue explained and corrected copy shared with the customer."},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected resolve response: {response.status_code} {response.data}",
        )

        support_request.refresh_from_db()
        self.assertEqual(support_request.status, "CLOSED")
        self.assertEqual(support_request.resolved_by_id, self.admin.id)
        self.assertIsNotNone(support_request.resolved_at)
        self.assertIn("corrected copy", support_request.resolution_summary)
        self.assertEqual(response.data["status"], "CLOSED")
        self.assertEqual(response.data["resolved_by_id"], self.admin.id)
        self.assertIn("corrected copy", response.data["resolution_summary"])

        self.assertTrue(
            AuditLog.objects.filter(
                model_name="CustomerSupportRequest",
                object_id=support_request.id,
                action_type=AuditLog.ActionType.SUPPORT_REQUEST_RESOLVED,
            ).exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="CustomerSupportRequest",
                object_id=support_request.id,
                action_type=AuditLog.ActionType.SUPPORT_REQUEST_RESOLUTION_RECORDED,
            ).exists()
        )
