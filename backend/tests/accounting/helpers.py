from __future__ import annotations

from datetime import date

from django.utils import timezone

from accounting.models import AccountingPeriodStatus
from accounting.services.document_sequence_service import DocumentType, upsert_numbering_profile
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


def create_locked_accounting_period(reference_date: date | None = None, *, performed_by=None):
    period = create_open_accounting_period(reference_date, performed_by=performed_by)
    period.status = AccountingPeriodStatus.LOCKED
    period.is_locked = True
    period.locked_at = period.locked_at or timezone.now()
    if performed_by is not None:
        period.locked_by = performed_by
    period.save(update_fields=["status", "is_locked", "locked_at", "locked_by", "updated_at"])
    return period


def create_closed_accounting_period(reference_date: date | None = None, *, performed_by=None):
    period = create_open_accounting_period(reference_date, performed_by=performed_by)
    period.status = AccountingPeriodStatus.CLOSED
    period.is_locked = True
    period.locked_at = period.locked_at or timezone.now()
    if performed_by is not None:
        period.locked_by = performed_by
    period.save(update_fields=["status", "is_locked", "locked_at", "locked_by", "updated_at"])
    return period


def seed_journal_entry_numbering_profile(reference_date: date | None = None, *, performed_by=None):
    reference_date = reference_date or timezone.localdate()
    create_open_accounting_period(reference_date, performed_by=performed_by)
    return upsert_numbering_profile(document_type=DocumentType.JOURNAL_ENTRY, reference_date=reference_date, performed_by=performed_by)


def seed_required_numbering_profiles(reference_date: date | None = None, *, performed_by=None):
    return seed_journal_entry_numbering_profile(reference_date, performed_by=performed_by)


def seed_required_accounting_mappings(*, performed_by=None):
    return apply_accounting_setup_defaults(performed_by=performed_by)


def seed_safe_finance_accounts():
    return ensure_default_payment_collection_accounts()


def seed_safe_chart_of_accounts(*, performed_by=None):
    return apply_accounting_setup_defaults(performed_by=performed_by)["canonical_accounts"]


def seed_bridge_ready_environment(reference_date: date | None = None, *, performed_by=None):
    reference_date = reference_date or timezone.localdate()
    prereqs = ensure_test_accounting_posting_prerequisites(reference_date, performed_by=performed_by)
    setup_result = apply_accounting_setup_defaults(performed_by=performed_by)
    finance_accounts = ensure_default_payment_collection_accounts()
    return {**prereqs, "setup_defaults": setup_result, "finance_accounts": finance_accounts, "finance_account": finance_accounts["CASH"]}


def seed_payment_bridge_ready_environment(reference_date: date | None = None, *, performed_by=None):
    return seed_bridge_ready_environment(reference_date, performed_by=performed_by)
