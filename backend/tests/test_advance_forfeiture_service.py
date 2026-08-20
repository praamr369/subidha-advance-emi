from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from subscriptions.models import CustomerAdvance, CustomerAdvanceStatus
from payments.models import AdvanceForfeiture, AdvanceForfeitureStatus
from payments.services.advance_forfeiture_service import (
    DORMANCY_DAYS,
    MIN_CONTACT_ATTEMPTS,
    forfeit_advance,
    identify_dormant_advances,
    record_contact_attempt,
    reverse_forfeiture,
)
from tests.helpers import create_admin_user, create_customer_profile, create_product, create_batch, create_lucky_id, create_subscription


class AdvanceForfeitureServiceTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="forf_admin", phone="9400100001")
        self.customer = create_customer_profile(name="Dormant Customer", phone="7400100001")
        self.product = create_product(name="Forf Product", product_code="FORF-P1", base_price=Decimal("6000.00"))
        self.batch = create_batch(batch_code="FORFBATCH", duration_months=6, total_slots=50)
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=1)
        self.subscription = create_subscription(
            customer=self.customer, product=self.product, batch=self.batch,
            lucky_id=self.lucky_id, total_amount=Decimal("6000.00"),
            monthly_amount=Decimal("1000.00"), tenure_months=6,
        )
        from accounting.models import FinanceAccount, FinanceAccountKind
        self.finance_account = FinanceAccount.objects.create(
            name="Test Cash Desk Forf", kind=FinanceAccountKind.CASH, is_active=True,
        )

    def _create_dormant_advance(self, *, days_ago=DORMANCY_DAYS + 30, amount=Decimal("500.00")):
        return CustomerAdvance.objects.create(
            customer=self.customer,
            amount=amount,
            unapplied_amount=amount,
            status=CustomerAdvanceStatus.UNAPPLIED,
            method="CASH",
            payment_date=date.today() - timedelta(days=days_ago),
            finance_account=self.finance_account,
            allocation_metadata={
                "collection_mode": "UNAPPLIED_ADVANCE",
                "source_contract_phase": "F19",
                "future_bridge_phase": "F20_CUSTOMER_ADVANCE_RECEIPT",
                "accounting_bridge_posting_deferred": True,
            },
        )

    def test_identify_dormant_advances(self):
        adv = self._create_dormant_advance()
        candidates = identify_dormant_advances()
        ids = [c["advance_id"] for c in candidates]
        self.assertIn(adv.id, ids)

    def test_identify_excludes_recent(self):
        self._create_dormant_advance(days_ago=30)
        candidates = identify_dormant_advances()
        self.assertEqual(len(candidates), 0)

    def test_contact_attempt_creates_forfeiture_record(self):
        adv = self._create_dormant_advance()
        result = record_contact_attempt(
            advance_id=adv.id, method="Phone", outcome="No response", actor=self.admin,
        )
        self.assertEqual(result["attempts"], 1)
        forf = AdvanceForfeiture.objects.get(advance=adv)
        self.assertEqual(forf.status, AdvanceForfeitureStatus.CONTACT_ATTEMPTED)

    def test_forfeit_requires_min_attempts(self):
        adv = self._create_dormant_advance()
        with self.assertRaises(ValueError):
            forfeit_advance(advance_id=adv.id, actor=self.admin)

    def test_forfeit_after_contact_attempts(self):
        adv = self._create_dormant_advance()
        for i in range(MIN_CONTACT_ATTEMPTS):
            record_contact_attempt(
                advance_id=adv.id, method="Phone", outcome=f"Attempt {i+1}", actor=self.admin,
            )
        result = forfeit_advance(advance_id=adv.id, actor=self.admin)
        self.assertEqual(result["status"], "FORFEITED")
        adv.refresh_from_db()
        self.assertEqual(adv.unapplied_amount, Decimal("0.00"))
        self.assertEqual(adv.status, CustomerAdvanceStatus.FULLY_APPLIED)

    def test_forfeit_blocks_non_dormant(self):
        adv = self._create_dormant_advance(days_ago=30)
        for i in range(MIN_CONTACT_ATTEMPTS):
            record_contact_attempt(
                advance_id=adv.id, method="Phone", outcome=f"Attempt {i+1}", actor=self.admin,
            )
        with self.assertRaises(ValueError):
            forfeit_advance(advance_id=adv.id, actor=self.admin)

    def test_reverse_forfeiture(self):
        adv = self._create_dormant_advance()
        for i in range(MIN_CONTACT_ATTEMPTS):
            record_contact_attempt(
                advance_id=adv.id, method="Phone", outcome=f"Attempt {i+1}", actor=self.admin,
            )
        forfeit_advance(advance_id=adv.id, actor=self.admin)
        forf = AdvanceForfeiture.objects.get(advance=adv)
        result = reverse_forfeiture(forfeiture_id=forf.id, reason="Customer returned", actor=self.admin)
        self.assertEqual(result["status"], "REVERSED")
        adv.refresh_from_db()
        self.assertGreater(adv.unapplied_amount, Decimal("0.00"))

    def test_double_forfeit_blocked(self):
        adv = self._create_dormant_advance()
        for i in range(MIN_CONTACT_ATTEMPTS):
            record_contact_attempt(
                advance_id=adv.id, method="Phone", outcome=f"Attempt {i+1}", actor=self.admin,
            )
        forfeit_advance(advance_id=adv.id, actor=self.admin)
        with self.assertRaises(ValueError):
            forfeit_advance(advance_id=adv.id, actor=self.admin)
