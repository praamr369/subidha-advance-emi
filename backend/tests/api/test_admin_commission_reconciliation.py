from decimal import Decimal
from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import Commission, Payment
from subscriptions.services.payment_service import (
    record_emi_payment,
    reverse_payment_for_admin,
)
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


class AdminCommissionReconciliationTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_comm_recon",
            phone="9112000001",
        )
        self.partner = create_partner_user(
            username="partner_comm_recon",
            phone="9112000002",
        )
        self.partner.commission_rate = Decimal("10.00")
        self.partner.save(update_fields=["commission_rate"])
        self.other_admin = create_admin_user(
            username="admin_as_partner_inconsistent",
            phone="9112000003",
        )

        self.customer = create_customer_profile(
            name="Recon Customer",
            phone="7421000001",
        )
        self.product = create_product(
            name="Recon Product",
            product_code="RECON-001",
            base_price=Decimal("1000.00"),
        )
        self.batch = create_batch(
            batch_code="COMRECON01",
            duration_months=10,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        self._create_payment_without_commission(lucky_number=91, reference_no="RECON-PAY-001")
        self._create_valid_commission(lucky_number=95, reference_no="RECON-PAY-003")
        self._create_commission_without_payment(lucky_number=92)
        self._create_reversed_commission(lucky_number=93, reference_no="RECON-PAY-002")
        self._create_non_partner_commission()

        self.url = "/api/v1/admin/commissions/reconciliation/"

    def _create_subscription_and_emi(self, *, lucky_number: int, partner=None):
        lucky_id = create_lucky_id(batch=self.batch, lucky_number=lucky_number)
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            partner=partner or self.partner,
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
        return subscription, emi

    def _create_payment_without_commission(self, *, lucky_number: int, reference_no: str):
        _, emi = self._create_subscription_and_emi(lucky_number=lucky_number)
        payment = record_emi_payment(
            emi_id=emi.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no=reference_no,
        )["payment"]
        Commission.objects.filter(payment=payment).delete()

    def _create_valid_commission(self, *, lucky_number: int, reference_no: str):
        subscription, emi = self._create_subscription_and_emi(lucky_number=lucky_number)
        record_emi_payment(
            emi_id=emi.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no=reference_no,
        )

    def _create_commission_without_payment(self, *, lucky_number: int):
        subscription, emi = self._create_subscription_and_emi(lucky_number=lucky_number)
        Commission.objects.create(
            partner=self.partner,
            subscription=subscription,
            payment=None,
            emi=emi,
            commission_rate=Decimal("10.00"),
            commission_amount=Decimal("10.00"),
            status="PENDING",
            metadata={},
        )

    def _create_reversed_commission(self, *, lucky_number: int, reference_no: str):
        subscription, emi = self._create_subscription_and_emi(lucky_number=lucky_number)
        payment = record_emi_payment(
            emi_id=emi.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no=reference_no,
        )["payment"]
        reverse_payment_for_admin(
            payment_id=payment.id,
            reversed_by=self.admin,
            reason="reconciliation reverse",
        )

    def _create_non_partner_commission(self):
        subscription, emi = self._create_subscription_and_emi(
            lucky_number=94,
            partner=self.other_admin,
        )
        Commission.objects.create(
            partner=self.other_admin,
            subscription=subscription,
            payment=None,
            emi=emi,
            commission_rate=Decimal("0.00"),
            commission_amount=Decimal("5.00"),
            status="PENDING",
            metadata={},
        )

    def test_admin_can_view_commission_reconciliation_snapshot(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        warnings = response.data["warnings"]
        self.assertEqual(warnings["payments_missing_commission"]["count"], 1)
        self.assertEqual(warnings["commissions_without_valid_payment"]["count"], 2)
        self.assertEqual(warnings["commissions_on_reversed_payments"]["count"], 1)
        self.assertEqual(warnings["commissions_zero_rate_or_non_partner"]["count"], 1)

    def test_partner_filter_is_honored(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url, {"partner": self.partner.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        warnings = response.data["warnings"]
        self.assertEqual(warnings["payments_missing_commission"]["count"], 1)
        self.assertEqual(warnings["commissions_without_valid_payment"]["count"], 1)
        self.assertEqual(warnings["commissions_zero_rate_or_non_partner"]["count"], 0)
        partner_row = response.data["partner_breakdown"][0]
        self.assertEqual(partner_row["expected_commission_total"], "20.00")
        self.assertEqual(partner_row["actual_commission_total"], "20.00")
        self.assertFalse(partner_row["has_mismatch"])

    def test_reconciliation_returns_expected_vs_actual_mismatch(self):
        self.client.force_authenticate(user=self.admin)

        self._create_payment_without_commission(
            lucky_number=96,
            reference_no="RECON-PAY-004",
        )

        response = self.client.get(self.url, {"partner": self.partner.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        overview = response.data["overview"]
        self.assertEqual(overview["expected_commission_total"], "30.00")
        self.assertEqual(overview["actual_commission_total"], "20.00")
        self.assertEqual(overview["partner_mismatch_count"], 1)

        partner_row = response.data["partner_breakdown"][0]
        self.assertTrue(partner_row["has_mismatch"])
        self.assertEqual(partner_row["mismatch_amount"], "10.00")
        self.assertEqual(partner_row["missing_commission_count"], 2)
