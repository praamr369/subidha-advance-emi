"""
Pass 7 — Lucky Plan batch/draw coordination (service + guard tests).
"""

import hashlib
from decimal import Decimal
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils.crypto import get_random_string
from django.utils import timezone

from accounts.models import User, UserRole
from subscriptions.models import (
    Batch,
    BatchStatus,
    Commission,
    Customer,
    DrawEligibilitySnapshot,
    EmiStatus,
    FinancialLedger,
    LedgerEntryType,
    LuckyDraw,
    LuckyId,
    LuckyIdStatus,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.batch_draw_coordination_service import (
    commit_batch_draw,
    compute_snapshot_aggregate_hash,
    execute_batch_draw,
    freeze_draw_eligibility_snapshot,
)
from subscriptions.services.lucky_draw_service import reveal_and_execute_draw
from subscriptions.services.payment_service import record_emi_payment
from subscriptions.services.emi_engine import generate_emi_schedule
from subscriptions.services.emi_reconciliation import reconcile_subscription_emis
from subscriptions.services.subscription_service import create_emi_subscription
from tests.helpers import (
    create_batch,
    create_product,
    create_subscription,
    create_finance_account,
)


def _make_user(role=UserRole.ADMIN):
    return User.objects.create_user(
        username=f"u_{get_random_string(8)}",
        password="test",
        role=role,
        phone=f"+91{get_random_string(10, '1234567890')}",
    )


def _make_product():
    return create_product(
        name="Coord Product",
        product_code=f"P-{get_random_string(6)}",
        base_price=Decimal("15000.00"),
    )


def _make_customer():
    u = User.objects.create_user(
        username=f"c_{get_random_string(10)}",
        password="test",
        role=UserRole.CUSTOMER,
        phone=f"98{get_random_string(9, '1234567890')}",
    )
    return Customer.objects.create(
        user=u,
        name=f"Coord {get_random_string(5)}",
        phone=u.phone,
        kyc_status="PENDING",
    )


def _emi_subscription(batch, lucky_number: int, **kwargs):
    product = kwargs.get("product") or _make_product()
    customer = kwargs.get("customer") or _make_customer()
    partner = kwargs.get("partner")
    lk = LuckyId.objects.get(batch=batch, lucky_number=lucky_number)
    sub = create_subscription(
        customer=customer,
        product=product,
        batch=batch,
        lucky_id=lk,
        partner=partner,
    )
    lk.status = LuckyIdStatus.ASSIGNED
    lk.save(update_fields=["status"])
    generate_emi_schedule(sub)
    reconcile_subscription_emis(sub)
    return sub


def _batch_with_eligible_subscriptions(count: int, **sub_kwargs):
    batch = create_batch(
        batch_code=f"PASS7-{get_random_string(5)}",
        status=BatchStatus.OPEN,
    )
    for i in range(count):
        _emi_subscription(batch, i, **sub_kwargs)
    return batch


def _force_lock_batch(batch: Batch):
    """Set LOCKED for tests that do not need full 100-seat lock validation."""
    Batch.objects.filter(pk=batch.pk).update(
        status=BatchStatus.LOCKED,
        locked_at=timezone.now(),
    )
    batch.refresh_from_db()


class LuckyPlanCoordinationTests(TestCase):
    def test_cannot_subscribe_when_batch_locked(self):
        admin = _make_user()
        batch = _batch_with_eligible_subscriptions(3)
        _force_lock_batch(batch)

        with self.assertRaises(ValidationError):
            create_emi_subscription(
                customer=_make_customer(),
                product=_make_product(),
                batch=batch,
                lucky_number=10,
                tenure_months=15,
                performed_by=admin,
            )

    def test_freeze_snapshot_creates_rows_and_aggregate_hash(self):
        admin = _make_user()
        batch = _batch_with_eligible_subscriptions(3)
        meta = freeze_draw_eligibility_snapshot(batch, user=admin)
        self.assertEqual(meta["row_count"], 3)
        self.assertEqual(meta["eligible_count"], 3)
        h = compute_snapshot_aggregate_hash(batch, meta["snapshot_version"])
        self.assertEqual(h, meta["snapshot_hash"])
        self.assertEqual(
            DrawEligibilitySnapshot.objects.filter(
                batch=batch, snapshot_version=meta["snapshot_version"]
            ).count(),
            3,
        )

    def test_eligible_winner_uses_snapshot_order_not_live_filter(self):
        admin = _make_user()
        batch = _batch_with_eligible_subscriptions(3)
        freeze_draw_eligibility_snapshot(batch, user=admin)
        ver = (
            DrawEligibilitySnapshot.objects.filter(batch=batch)
            .order_by("-snapshot_version")
            .values_list("snapshot_version", flat=True)
            .first()
        )
        rows = list(
            DrawEligibilitySnapshot.objects.filter(batch=batch, snapshot_version=ver).order_by(
                "sort_order"
            )
        )
        middle = Subscription.objects.get(pk=rows[1].subscription_id)
        middle.status = SubscriptionStatus.DEFAULTED
        middle.save(update_fields=["status"])

        live_eligible = (
            Subscription.objects.filter(
                batch=batch,
                status=SubscriptionStatus.ACTIVE,
                lucky_id__isnull=False,
                lucky_id__status=LuckyIdStatus.ASSIGNED,
            ).count()
        )
        self.assertEqual(live_eligible, 2)

        _force_lock_batch(batch)

        payload = commit_batch_draw(batch=batch, user=admin)
        secret = payload["admin_seed_store_securely"]
        draw = LuckyDraw.objects.get(pk=payload["lucky_draw_id"])

        selector_index = int(
            hashlib.sha256(
                f"{secret.strip()}::{draw.id}::{draw.draw_month}".encode()
            ).hexdigest(),
            16,
        ) % len(rows)
        expected_id = rows[selector_index].subscription_id

        out = reveal_and_execute_draw(draw.id, secret, performed_by=admin)
        self.assertEqual(out["winner_subscription_id"], expected_id)

    def test_duplicate_draw_execute_idempotent_no_duplicate_waivers(self):
        admin = _make_user()
        batch = _batch_with_eligible_subscriptions(3)
        freeze_draw_eligibility_snapshot(batch, user=admin)
        _force_lock_batch(batch)
        c1 = commit_batch_draw(batch=batch, user=admin)
        secret = c1["admin_seed_store_securely"]
        w1 = execute_batch_draw(
            batch=batch, revealed_seed=secret, performed_by=admin
        )
        w2 = execute_batch_draw(
            batch=batch, revealed_seed=secret, performed_by=admin
        )
        self.assertEqual(w1["winner_subscription_id"], w2["winner_subscription_id"])
        batch.refresh_from_db()
        self.assertEqual(batch.status, BatchStatus.DRAW_COMPLETED)

        waiver_n = FinancialLedger.objects.filter(
            entry_type=LedgerEntryType.EMI_WAIVER,
            allocation_context__draw_id=w1["id"],
        ).count()
        self.assertGreater(waiver_n, 0)
        execute_batch_draw(
            batch=batch, revealed_seed=secret, performed_by=admin
        )
        self.assertEqual(
            waiver_n,
            FinancialLedger.objects.filter(
                entry_type=LedgerEntryType.EMI_WAIVER,
                allocation_context__draw_id=w1["id"],
            ).count(),
        )

    def test_only_future_unpaid_emis_waived_paid_untouched(self):
        admin = _make_user()
        fa = create_finance_account(code=f"TST-{get_random_string(6)}", name="Test Cash")
        batch = _batch_with_eligible_subscriptions(1)
        winner_sub = Subscription.objects.filter(batch=batch).first()
        freeze_draw_eligibility_snapshot(batch, user=admin)
        _force_lock_batch(batch)

        emi1 = winner_sub.emis.filter(month_no=1).first()
        emi2 = winner_sub.emis.filter(month_no=2).first()
        record_emi_payment(
            emi_id=emi1.id,
            amount=emi1.amount,
            collected_by=admin,
            method="CASH",
            finance_account_id=fa.id,
            reference_no=f"PAY-{get_random_string(8)}",
        )
        emi1.refresh_from_db()
        self.assertEqual(emi1.status, EmiStatus.PAID)

        c1 = commit_batch_draw(batch=batch, user=admin)
        secret = c1["admin_seed_store_securely"]
        execute_batch_draw(batch=batch, revealed_seed=secret, performed_by=admin)

        emi1.refresh_from_db()
        emi2.refresh_from_db()
        self.assertEqual(emi1.status, EmiStatus.PAID)
        self.assertEqual(emi2.status, EmiStatus.WAIVED)

    def test_draw_blocked_when_waiver_accounts_missing(self):
        admin = _make_user()
        batch = _batch_with_eligible_subscriptions(3)
        freeze_draw_eligibility_snapshot(batch, user=admin)
        _force_lock_batch(batch)
        c1 = commit_batch_draw(batch=batch, user=admin)
        secret = c1["admin_seed_store_securely"]

        def boom():
            raise ValidationError("missing")

        with patch(
            "subscriptions.services.batch_draw_coordination_service.assert_waiver_finance_ready",
            side_effect=boom,
        ):
            with self.assertRaises(ValidationError):
                execute_batch_draw(
                    batch=batch, revealed_seed=secret, performed_by=admin
                )

    def test_partner_commission_count_unchanged_by_draw(self):
        admin = _make_user()
        partner = _make_user(role=UserRole.PARTNER)
        batch = _batch_with_eligible_subscriptions(3, partner=partner)
        freeze_draw_eligibility_snapshot(batch, user=admin)
        _force_lock_batch(batch)
        before = Commission.objects.filter(partner=partner).count()
        c1 = commit_batch_draw(batch=batch, user=admin)
        execute_batch_draw(
            batch=batch, revealed_seed=c1["admin_seed_store_securely"], performed_by=admin
        )
        after = Commission.objects.filter(partner=partner).count()
        self.assertEqual(before, after)
