"""
Regression tests for P4-RC-B: seed_playwright_smoke must create the
collection-purpose COA mapping so payment posting readiness passes.
"""
from __future__ import annotations

from django.test import TestCase

from accounting.models import FinanceAccountCoaMapping, FinanceAccountMappingPurpose
from accounting.services.finance_account_readiness import (
    FinanceAccountPostingReadinessError,
    finance_account_readiness,
    raise_if_finance_account_not_ready,
)
from subscriptions.management.commands.seed_playwright_smoke import Command as SeedCommand


class PlaywrightSeedFinanceMappingTests(TestCase):
    """_ensure_smoke_finance_account must yield a collection-ready finance account."""

    def _ensure(self):
        return SeedCommand()._ensure_smoke_finance_account()

    def test_creates_active_cash_collection_mapping(self):
        fa = self._ensure()
        exists = FinanceAccountCoaMapping.objects.filter(
            finance_account=fa,
            purpose=FinanceAccountMappingPurpose.CASH_COLLECTION,
            is_active=True,
        ).exists()
        self.assertTrue(exists, "Expected an active CASH_COLLECTION mapping after seed.")

    def test_finance_account_readiness_is_collection_ready(self):
        fa = self._ensure()
        readiness = finance_account_readiness(fa)
        self.assertTrue(
            readiness.collection_ready,
            msg=f"Expected collection_ready=True. Blocker: {readiness.collection_blocker_reason}",
        )
        self.assertTrue(readiness.selectable_for_collection)

    def test_raise_if_not_ready_does_not_raise_after_seed(self):
        fa = self._ensure()
        try:
            raise_if_finance_account_not_ready(fa)
        except FinanceAccountPostingReadinessError as exc:
            self.fail(f"raise_if_finance_account_not_ready raised unexpectedly: {exc}")

    def test_duplicate_seed_does_not_create_duplicate_active_mappings(self):
        fa = self._ensure()
        self._ensure()  # second run — must be idempotent
        count = FinanceAccountCoaMapping.objects.filter(
            finance_account=fa,
            purpose=FinanceAccountMappingPurpose.CASH_COLLECTION,
            is_active=True,
        ).count()
        self.assertEqual(
            count,
            1,
            msg="Duplicate seed run must not create more than one active CASH_COLLECTION mapping.",
        )
