"""
Tests for Emi model immutability guard and _refresh_emi_status safety.

PAID and WAIVED EMIs must not have their status directly reverted to PENDING
at the ORM level. Reversals must go through the service layer so the payment
audit trail (ReceiptDocument, FinancialSourceLifecycleEvent) remains intact.

WAIVED EMIs must never be touched by _refresh_emi_status — the lucky draw
waiver workflow is the sole owner of WAIVED status and no approved reversal
path exists within payment recalculation.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from subscriptions.models import Emi, EmiStatus, FinancialLedger, LedgerDirection, LedgerEntryType
from subscriptions.services.payment_service import _refresh_emi_status
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class EmiImmutabilityTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="emi_guard_admin", phone="9360000001")
        self.customer = create_customer_profile(
            user=self.admin, name="EMI Guard Customer", phone="9360000002"
        )
        product = create_product(product_code="EG-PROD-001")
        batch = create_batch(batch_code="EGBATCH2026")
        lucky_id = create_lucky_id(batch=batch, lucky_number=1)
        self.subscription = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
        )

    def test_pending_emi_can_be_set_to_paid(self):
        """Normal transition PENDING → PAID is allowed (done by service layer)."""
        emi = create_emi(subscription=self.subscription, month_no=1)
        self.assertEqual(emi.status, EmiStatus.PENDING)

        emi.status = EmiStatus.PAID
        emi.save()  # must not raise

        emi.refresh_from_db()
        self.assertEqual(emi.status, EmiStatus.PAID)

    def test_paid_emi_cannot_revert_to_pending(self):
        """A PAID EMI must not be reverted to PENDING through a direct ORM save."""
        emi = create_emi(subscription=self.subscription, month_no=2, status=EmiStatus.PAID)
        self.assertEqual(emi.status, EmiStatus.PAID)

        emi.status = EmiStatus.PENDING
        with self.assertRaises(ValidationError) as ctx:
            emi.save()

        self.assertIn("PAID", str(ctx.exception))
        emi.refresh_from_db()
        self.assertEqual(emi.status, EmiStatus.PAID)

    def test_waived_emi_cannot_revert_to_pending(self):
        """A WAIVED EMI must not be reverted to PENDING through a direct ORM save."""
        emi = create_emi(
            subscription=self.subscription, month_no=3, status=EmiStatus.WAIVED
        )
        self.assertEqual(emi.status, EmiStatus.WAIVED)

        emi.status = EmiStatus.PENDING
        with self.assertRaises(ValidationError) as ctx:
            emi.save()

        self.assertIn("WAIVED", str(ctx.exception))
        emi.refresh_from_db()
        self.assertEqual(emi.status, EmiStatus.WAIVED)

    def test_paid_emi_status_unchanged_save_is_allowed(self):
        """Saving a PAID EMI without changing its status (e.g., internal refresh) is allowed."""
        emi = create_emi(
            subscription=self.subscription, month_no=4, status=EmiStatus.PAID
        )
        emi.save()  # same status — must not raise

        emi.refresh_from_db()
        self.assertEqual(emi.status, EmiStatus.PAID)

    def test_waived_emi_cannot_revert_to_cancelled(self):
        """A WAIVED EMI's terminal status is also protected from arbitrary transitions."""
        emi = create_emi(
            subscription=self.subscription, month_no=5, status=EmiStatus.WAIVED
        )
        emi.status = EmiStatus.CANCELLED
        with self.assertRaises(ValidationError):
            emi.save()

        emi.refresh_from_db()
        self.assertEqual(emi.status, EmiStatus.WAIVED)


class RefreshEmiStatusSafetyTests(TestCase):
    """
    Regression tests for _refresh_emi_status bypass safety.

    The bypass (queryset update) must only fire for PAID → PENDING/PARTIAL.
    WAIVED EMIs must never be touched regardless of net paid or in-memory state.
    """

    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="refresh_guard_admin", phone="9360000010")
        self.customer = create_customer_profile(
            user=self.admin, name="Refresh Guard Customer", phone="9360000011"
        )
        product = create_product(product_code="RG-PROD-001")
        batch = create_batch(batch_code="RGBATCH2026")
        lucky_id = create_lucky_id(batch=batch, lucky_number=2)
        self.subscription = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
        )

    def _add_ledger(self, emi, amount, entry_type=LedgerEntryType.EMI_PAYMENT):
        FinancialLedger.objects.create(
            emi=emi,
            amount=amount,
            entry_type=entry_type,
            entry_direction=LedgerDirection.CREDIT,
        )

    def test_waived_emi_stays_waived_with_zero_net_paid(self):
        """WAIVED EMI must remain WAIVED when net paid is 0 (no ledger entries)."""
        emi = create_emi(
            subscription=self.subscription, month_no=6, status=EmiStatus.WAIVED
        )
        _refresh_emi_status(emi)
        emi.refresh_from_db()
        self.assertEqual(emi.status, EmiStatus.WAIVED)

    def test_waived_emi_stays_waived_with_stale_in_memory_status(self):
        """
        WAIVED EMI must remain WAIVED even when the in-memory emi.status is stale
        (e.g. set to PENDING by the caller before passing to _refresh_emi_status).
        The function must consult the DB row, not trust the in-memory object.
        """
        emi = create_emi(
            subscription=self.subscription, month_no=7, status=EmiStatus.WAIVED
        )
        # Simulate a stale in-memory object: DB is WAIVED but caller's local copy says PENDING.
        Emi.objects.filter(pk=emi.pk).update(status=EmiStatus.WAIVED)
        emi.status = EmiStatus.PENDING  # stale in-memory state

        _refresh_emi_status(emi)

        emi.refresh_from_db()
        self.assertEqual(emi.status, EmiStatus.WAIVED)

    def test_paid_emi_corrects_to_pending_after_payment_reversal(self):
        """
        PAID EMI can be corrected to PENDING through _refresh_emi_status when
        net paid drops to 0 after a payment reversal (the approved service path).
        """
        emi = create_emi(
            subscription=self.subscription, month_no=8, status=EmiStatus.PAID,
            amount=Decimal("800.00"),
        )
        # Record a payment then a full reversal so net_paid == 0.
        self._add_ledger(emi, Decimal("800.00"), LedgerEntryType.EMI_PAYMENT)
        self._add_ledger(emi, Decimal("800.00"), LedgerEntryType.PAYMENT_REVERSAL)

        _refresh_emi_status(emi)

        emi.refresh_from_db()
        self.assertEqual(emi.status, EmiStatus.PENDING)

    def test_pending_emi_becomes_paid_normally(self):
        """PENDING EMI transitions to PAID when net paid >= EMI amount."""
        emi = create_emi(
            subscription=self.subscription, month_no=9,
            amount=Decimal("800.00"),
        )
        self.assertEqual(emi.status, EmiStatus.PENDING)
        self._add_ledger(emi, Decimal("800.00"), LedgerEntryType.EMI_PAYMENT)

        _refresh_emi_status(emi)

        emi.refresh_from_db()
        self.assertEqual(emi.status, EmiStatus.PAID)
