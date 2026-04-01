from decimal import Decimal
from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.services.commission_payout_service import (
    create_commission_payout_batch,
    finalize_commission_payout_batch,
)
from subscriptions.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class CommissionStatementExportTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_statement_export",
            phone="9113000001",
        )
        self.partner = create_partner_user(
            username="partner_statement_export",
            phone="9113000002",
        )
        self.partner.commission_rate = Decimal("10.00")
        self.partner.save(update_fields=["commission_rate"])
        self.customer = create_customer_profile(
            name="Statement Customer",
            phone="7422000001",
        )
        self.product = create_product(
            name="Statement Product",
            product_code="STAT-001",
            base_price=Decimal("1000.00"),
        )
        self.batch = create_batch(
            batch_code="STATEMENTBATCH01",
            duration_months=10,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        lucky_id = create_lucky_id(batch=self.batch, lucky_number=11)
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            partner=self.partner,
            batch=self.batch,
            lucky_id=lucky_id,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("100.00"),
            tenure_months=10,
        )
        emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("100.00"),
            due_date=date(2026, 3, 10),
        )
        payment = record_emi_payment(
            emi_id=emi.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="STAT-REF-001",
        )["payment"]
        batch = create_commission_payout_batch(
            commission_ids=[payment.commission.id],
            processed_by=self.admin,
            payout_date=date(2026, 3, 20),
        )["batch"]
        finalize_commission_payout_batch(batch_id=batch.id, processed_by=self.admin)

    def test_admin_can_export_statement_csv(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(
            "/api/v1/admin/commissions/statements/export/",
            {"partner": self.partner.id, "export_format": "csv"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "text/csv")
        content = response.content.decode("utf-8")
        self.assertIn(
            "commission_id,payment_id,subscription_id,partner_id,amount,status,payout_batch_id",
            content,
        )
        self.assertIn("partner_statement_export", content)
        self.assertIn("STAT-REF-001", content)
        self.assertIn("commission_statement_partner_{}".format(self.partner.id), response["Content-Disposition"])

    def test_admin_can_export_statement_pdf(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(
            "/api/v1/admin/commissions/statements/export/",
            {"partner": self.partner.id, "export_format": "pdf"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertGreater(len(response.content), 100)

    def test_partner_can_export_self_scoped_statement(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get(
            "/api/v1/partner/earnings/export/",
            {"export_format": "csv"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "text/csv")
        self.assertIn("partner_statement_export", response.content.decode("utf-8"))

    def test_non_partner_cannot_export_partner_statement(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(
            "/api/v1/partner/earnings/export/",
            {"export_format": "csv"},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_export_rejects_invalid_date_range(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(
            "/api/v1/admin/commissions/statements/export/",
            {
                "partner": self.partner.id,
                "date_from": "2026-03-31",
                "date_to": "2026-03-01",
                "export_format": "csv",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("date_to", response.data)
