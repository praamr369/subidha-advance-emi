from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import CustomerSupportRequest
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
from subscriptions.models import Subscription, Emi


class CustomerOperationalSummaryApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="ops_summary_admin", phone="9381110001")
        self.cashier = create_cashier_user(
            username="ops_summary_cashier", phone="9381110002"
        )
        self.customer = create_customer_profile(
            name="Ops Summary Customer", phone="7381110001"
        )
        product = create_product(
            name="Ops Summary Product",
            product_code="OPS-SUM-001",
            base_price=Decimal("1200.00"),
        )
        batch = create_batch(
            batch_code="OPSSUM0426",
            duration_months=12,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 4, 1),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=12)
        subscription = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("1200.00"),
            monthly_amount=Decimal("100.00"),
            tenure_months=12,
        )
        paid_emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("100.00"),
            due_date=date(2026, 4, 10),
        )
        create_emi(
            subscription=subscription,
            month_no=2,
            amount=Decimal("100.00"),
            due_date=date(2026, 4, 20),
        )
        record_emi_payment(
            emi_id=paid_emi.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="OPS-SUM-PMT-001",
            payment_date=date(2026, 4, 10),
        )

    def test_admin_can_read_operational_summary(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            f"/api/v1/admin/customers/{self.customer.id}/operational-summary/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["customer"]["id"], self.customer.id)
        self.assertEqual(response.data["summary"]["active_subscriptions"], 1)
        self.assertEqual(response.data["summary"]["overdue_emi_count"], 1)
        self.assertEqual(response.data["summary"]["risk_status"], "OVERDUE")

    def test_operational_summary_exposes_active_vs_historical_finance_fields(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            f"/api/v1/admin/customers/{self.customer.id}/operational-summary/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("active_contract_value", response.data["summary"])
        self.assertIn("historical_contract_value", response.data["summary"])
        self.assertIn("active_payment_count", response.data["summary"])
        self.assertIn("reversed_payment_count", response.data["summary"])

    def test_cashier_can_read_operational_summary(self):
        self.client.force_authenticate(user=self.cashier)
        response = self.client.get(
            f"/api/v1/cashier/customers/{self.customer.id}/operational-summary/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["customer"]["id"], self.customer.id)

    def test_partner_is_forbidden(self):
        from tests.helpers import create_partner_user

        partner = create_partner_user(username="ops_summary_partner", phone="9381110003")
        self.client.force_authenticate(user=partner)
        response = self.client.get(
            f"/api/v1/admin/customers/{self.customer.id}/operational-summary/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_operational_summary_support_ticket_payload_uses_safe_subject_fallback(self):
        CustomerSupportRequest.objects.create(
            customer=self.customer,
            category="PAYMENT_ISSUE",
            message="Need correction for duplicate receipt entry in April cycle.",
            status="SUBMITTED",
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            f"/api/v1/admin/customers/{self.customer.id}/operational-summary/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(response.data["service_tickets"]), 1)
        ticket = response.data["service_tickets"][0]
        self.assertEqual(ticket["category"], "PAYMENT_ISSUE")
        self.assertEqual(
            ticket["subject"],
            "Payment Issue",
        )
        self.assertEqual(
            ticket["title"],
            "Payment Issue",
        )
        self.assertIn("duplicate receipt", ticket["message"])

    def test_cancelled_only_subscription_is_history_and_not_active_overdue(self):
        customer = create_customer_profile(
            user=create_customer_user(
                username="cancelled_summary_customer",
                phone="7381110999",
            ),
            name="Cancelled Summary Customer", phone="7381110999"
        )
        product = create_product(
            name="Cancelled Summary Product",
            product_code="OPS-SUM-CANCEL-001",
            base_price=Decimal("67500.00"),
        )
        batch = create_batch(
            batch_code="OPSSUMCANCEL0426",
            duration_months=15,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 4, 1),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=45)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("67500.00"),
            monthly_amount=Decimal("4500.00"),
            tenure_months=15,
            status="CANCELLED",
        )
        for month_no in range(1, 16):
            create_emi(
                subscription=subscription,
                month_no=month_no,
                amount=Decimal("4500.00"),
                due_date=date(2026, 1, 1),
            )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            f"/api/v1/admin/customers/{customer.id}/operational-summary/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        summary = response.data["summary"]
        self.assertEqual(summary["active_subscriptions"], 0)
        self.assertEqual(summary["active_contract_value"], "0.00")
        self.assertEqual(summary["historical_contract_value"], "67500.00")
        self.assertEqual(summary["active_overdue_emi_count"], 0)
        self.assertEqual(summary["overdue_emi_count"], 0)
        self.assertEqual(summary["active_subscription_due"], "0.00")
        self.assertEqual(summary["subscription_outstanding"], "0.00")
        self.assertEqual(summary["cancelled_subscription_count"], 1)
        self.assertEqual(summary["risk_status"], "CANCELLED")
        self.assertIn("CANCELLED", summary["history_badges"])
        self.assertIn("HISTORY", summary["history_badges"])
        self.assertTrue(
            Subscription.objects.filter(pk=subscription.pk, status="CANCELLED").exists()
        )
        self.assertEqual(Emi.objects.filter(subscription=subscription).count(), 15)
