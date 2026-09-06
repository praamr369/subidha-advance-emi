"""Guards against double-collection on a single EMI.

The August audit proposed a unique constraint on (emi_id, intent). That
constraint existed and was deliberately removed (CTRL-LP-8 note,
payments/models.py) because it blocked split-tender collection — part CASH plus
part UPI against one EMI month is legitimate and common.

What actually closes the race is in record_emi_payment:

    @transaction.atomic
    def record_emi_payment(...):
        emi = Emi.objects.select_for_update().get(id=emi_id)   # row lock
        outstanding_before = _emi_outstanding_amount(emi)      # read under lock
        if amount > outstanding_before: raise                  # check under lock

The read-modify-write sits inside the lock, so on PostgreSQL a second
concurrent request blocks until the first commits, then re-reads the reduced
outstanding balance and is rejected.

TESTING LIMITATION, stated plainly: this suite runs on SQLite, where Django
sets has_select_for_update = False and silently ignores the lock. No test here
can demonstrate the concurrent behaviour — that property holds on PostgreSQL
and is verified by reasoning about the code, not by execution.

So these tests cover the two things SQLite *can* prove:
  * the business rule — over-collection is rejected, and split tender is not
  * the structure — the lock and the transaction are still present

The structural test matters precisely because the behavioural one is
impossible. If someone removes select_for_update or the atomic decorator, no
functional test would fail and production would start double-collecting under
load.
"""
import inspect
from decimal import Decimal

from django.test import TestCase

from payments.services import payment_service
from payments.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_payment_collection_finance_account,
    create_product,
    create_subscription,
    ensure_test_accounting_posting_prerequisites,
)


class PaymentRaceGuardStructureTests(TestCase):
    """Pins the mechanism, because SQLite cannot exercise it."""

    def test_record_emi_payment_is_atomic(self):
        """The lock is only held to commit if the whole call is one transaction."""
        source = inspect.getsource(record_emi_payment)
        wrapped = getattr(record_emi_payment, "__wrapped__", None)

        self.assertTrue(
            wrapped is not None or "atomic" in source,
            "record_emi_payment must run inside a transaction; without it the "
            "row lock is released before the payment is written.",
        )

    def test_the_emi_row_is_locked_before_the_balance_is_read(self):
        """Order matters: reading before locking leaves the race wide open."""
        source = inspect.getsource(
            getattr(record_emi_payment, "__wrapped__", record_emi_payment)
        )

        lock_at = source.find("select_for_update()")
        read_at = source.find("_emi_outstanding_amount(emi)")

        self.assertNotEqual(lock_at, -1, "the EMI row lock has been removed")
        self.assertNotEqual(read_at, -1, "the outstanding-balance read has moved")
        self.assertLess(
            lock_at,
            read_at,
            "the outstanding balance must be read AFTER the EMI row is locked, "
            "otherwise two concurrent collections both see the pre-payment "
            "balance and both succeed.",
        )

    def test_the_removed_constraint_stays_removed(self):
        """Re-adding it would break split tender — see CTRL-LP-8."""
        from payments.models import Payment

        constraint_names = {c.name for c in Payment._meta.constraints}

        self.assertNotIn("uq_payment_per_emi", constraint_names)


class OverCollectionRejectedTests(TestCase):
    """The business rule the lock protects."""

    def setUp(self):
        self.admin = create_admin_user(username="race_admin", phone="9000011001")
        ensure_test_accounting_posting_prerequisites(performed_by=self.admin)
        self.finance_account = create_payment_collection_finance_account()
        self.product = create_product(
            name="Race Sofa", product_code="TP-RACE", base_price=Decimal("15000.00")
        )
        self.batch = create_batch()
        customer = create_customer_profile(
            user=create_customer_user(username="race_cust", phone="9000011002"),
            name="Race Customer",
            phone="9000011002",
        )
        self.subscription = create_subscription(
            customer=customer,
            product=self.product,
            batch=self.batch,
            lucky_id=create_lucky_id(batch=self.batch, lucky_number=1),
        )
        self.emi = create_emi(
            subscription=self.subscription, month_no=1, amount=Decimal("1000.00")
        )

    def _collect(self, amount, key):
        return record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal(amount),
            collected_by=self.admin,
            finance_account_id=self.finance_account.id,
            idempotency_key=key,
        )

    def test_a_fully_paid_emi_cannot_be_collected_against_again(self):
        """The sequential form of the race the lock prevents concurrently.

        Note which guard fires: paying the EMI in full completes the
        subscription, so _assert_payment_write_allowed rejects the second
        attempt before the outstanding-balance check is reached. Both refuse
        the double collection; asserting one specific message would pin the
        wrong thing, since which guard wins depends on whether the payment
        happens to close the contract.
        """
        self._collect("1000.00", "race-full")

        with self.assertRaises(ValueError) as caught:
            self._collect("1000.00", "race-second")

        message = str(caught.exception).lower()
        self.assertTrue(
            "outstanding" in message or "completed" in message,
            f"second collection must be refused, got: {caught.exception}",
        )

    def test_split_tender_is_still_allowed(self):
        """The reason the unique constraint was removed.

        Part CASH plus part UPI against one EMI month must keep working; a
        guard that blocked this would be worse than the race.
        """
        self._collect("400.00", "race-part-1")
        self._collect("600.00", "race-part-2")

        from payments.models import Payment

        self.assertEqual(Payment.objects.filter(emi=self.emi).count(), 2)

    def test_overpaying_the_remainder_is_rejected(self):
        self._collect("400.00", "race-part-a")

        with self.assertRaises(ValueError):
            self._collect("700.00", "race-part-b")
