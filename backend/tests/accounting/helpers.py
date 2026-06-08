from __future__ import annotations

from datetime import date

from accounting.services.setup_defaults_service import apply_accounting_setup_defaults
from tests.helpers import (
    ensure_default_payment_collection_accounts,
    ensure_test_accounting_posting_prerequisites,
    ensure_test_financial_year,
    ensure_test_open_accounting_period,
)


def create_active_financial_year(reference_date: date | None = None, *, performed_by=None):
    return ensure_test_financial_year(reference_date, performed_by=performed_by)


def create_open_accounting_period(reference_date: date | None = None, *, performed_by=None):
    _financial_year, period = ensure_test_open_accounting_period(reference_date, performed_by=performed_by)
    return period


def seed_required_numbering_profiles(reference_date: date | None = None, *, performed_by=None):
    return ensure_test_accounting_posting_prerequisites(reference_date, performed_by=performed_by)["journal_numbering_profile"]


def seed_required_accounting_mappings(*, performed_by=None):
    return apply_accounting_setup_defaults(performed_by=performed_by)


def seed_safe_finance_accounts():
    return ensure_default_payment_collection_accounts()
