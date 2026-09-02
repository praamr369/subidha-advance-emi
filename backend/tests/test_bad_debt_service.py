from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from payments.models import RecoveryCase
from subscriptions.models import RecoveryStage
from payments.services.bad_debt_service import (
    NPA_THRESHOLD_DAYS,
    WRITE_OFF_MIN_AGING_DAYS,
    aging_report,
    classify_npa,
    list_bad_debt_cases,
    record_legal_notice,
    write_off,
)
from tests.helpers import create_admin_user, create_customer_profile, create_product, create_batch, create_lucky_id, create_subscription


class BadDebtServiceTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="bd_admin", phone="9400200001")
        self.customer = create_customer_profile(name="Default Customer", phone="7400200001")
        self.product = create_product(name="BD Product", product_code="BD-P1", base_price=Decimal("12000.00"))
        self.batch = create_batch(batch_code="BDBATCH", duration_months=12, total_slots=100)
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=2)
        self.subscription = create_subscription(
            customer=self.customer, product=self.product, batch=self.batch,
            lucky_id=self.lucky_id, total_amount=Decimal("12000.00"),
            monthly_amount=Decimal("1000.00"), tenure_months=12,
        )

    def _create_recovery_case(self, *, overdue_days=NPA_THRESHOLD_DAYS + 10):
        return RecoveryCase.objects.create(
            subscription=self.subscription,
            stage=RecoveryStage.IDENTIFIED,
            overdue_amount=Decimal("3000.00"),
            overdue_emis=3,
            first_overdue_date=date.today() - timedelta(days=overdue_days),
        )

    def test_list_bad_debt_cases(self):
        rc = self._create_recovery_case()
        cases = list_bad_debt_cases()
        ids = [c["id"] for c in cases]
        self.assertIn(rc.id, ids)

    def test_aging_report(self):
        self._create_recovery_case()
        report = aging_report()
        self.assertIn("total_overdue", report)
        self.assertGreater(Decimal(report["total_overdue"]), Decimal("0"))

    def test_classify_npa(self):
        rc = self._create_recovery_case()
        result = classify_npa(recovery_case_id=rc.id, actor=self.admin)
        self.assertIsNotNone(result["npa_classified_at"])
        rc.refresh_from_db()
        self.assertIsNotNone(rc.npa_classified_at)
        self.assertGreater(rc.provisioning_percent, Decimal("0"))

    def test_classify_npa_blocks_under_threshold(self):
        rc = self._create_recovery_case(overdue_days=30)
        with self.assertRaises(ValueError):
            classify_npa(recovery_case_id=rc.id, actor=self.admin)

    def test_classify_npa_blocks_duplicate(self):
        rc = self._create_recovery_case()
        classify_npa(recovery_case_id=rc.id, actor=self.admin)
        with self.assertRaises(ValueError):
            classify_npa(recovery_case_id=rc.id, actor=self.admin)

    def test_record_legal_notice(self):
        rc = self._create_recovery_case()
        result = record_legal_notice(
            recovery_case_id=rc.id, notice_date=date.today(),
            notice_ref="LN-2026-001", actor=self.admin,
        )
        self.assertEqual(result["stage"], RecoveryStage.LEGAL)

    def test_write_off_requires_all_conditions(self):
        rc = self._create_recovery_case(overdue_days=WRITE_OFF_MIN_AGING_DAYS + 10)
        # No NPA, no notice — should fail
        with self.assertRaises(ValueError):
            write_off(recovery_case_id=rc.id, actor=self.admin)

    def test_write_off_full_workflow(self):
        rc = self._create_recovery_case(overdue_days=WRITE_OFF_MIN_AGING_DAYS + 10)
        classify_npa(recovery_case_id=rc.id, actor=self.admin)
        record_legal_notice(
            recovery_case_id=rc.id, notice_date=date.today(),
            notice_ref="LN-2026-002", actor=self.admin,
        )
        result = write_off(recovery_case_id=rc.id, actor=self.admin)
        self.assertEqual(result["stage"], RecoveryStage.WRITTEN_OFF)
        rc.refresh_from_db()
        self.assertEqual(rc.written_off_amount, Decimal("3000.00"))
        self.assertEqual(rc.provisioning_percent, Decimal("100.00"))
