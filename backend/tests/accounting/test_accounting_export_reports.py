"""
P4E — Accounting Export Reports tests.

All service functions are read-only: no bridge posting, journal entry, payment,
EMI, stock ledger, CustomerAdvance, RentLeaseDepositTransaction, billing invoice,
or reconciliation rows are mutated or created by the service under test.

Tests verify:
- Export index returns all expected report keys
- Trial balance export uses P4B payload and returns structured rows
- Journal export includes posted journals
- Draft journals excluded by default
- Draft journals included only with include_draft=true
- Voided journals always excluded
- Ledger export groups summary rows by account
- Liability export wraps P4C posture
- Bridge audit export groups rows by purpose
- Receivables export returns safe structure without KYC data
- CSV format returns text/csv content type
- Unsupported format returns 400
- Admin allowed; cashier/customer/partner/unauthenticated blocked
- No JournalEntry/JournalLine/AccountingBridgePosting/Payment/BillingInvoice/
  CustomerAdvance/RentLeaseDepositTransaction records are created or mutated
  during export generation
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounting.models import (
    AccountingBridgePosting,
    ChartOfAccount,
    ChartOfAccountType,
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
    JournalEntryType,
)
from accounting.services.accounting_export_service import (
    build_accounting_export_index,
    build_bridge_audit_export,
    build_journal_export,
    build_ledger_export,
    build_liability_export,
    build_receivables_export,
    build_trial_balance_export,
)
from accounting.services.journal_posting_service import (
    create_journal_entry,
    post_journal_entry,
)
from accounts.models import UserRole
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_user,
    ensure_journal_numbering_profile_for_date,
)
from tests.accounting.helpers import create_open_accounting_period

YEAR = 2026
MONTH = 6
AS_OF = date(2026, 6, 18)
PERIOD = {"year": YEAR, "month": MONTH}

_EXPORT_BASE = "/api/v1/admin/accounting/exports/"


def _admin(suffix="1"):
    return create_admin_user(username=f"p4e_admin_{suffix}", phone=f"918100{suffix.zfill(4)}")


def _cashier(suffix="1"):
    return create_cashier_user(username=f"p4e_cashier_{suffix}", phone=f"918200{suffix.zfill(4)}")


def _customer(suffix="1"):
    return create_user(username=f"p4e_cust_{suffix}", role=UserRole.CUSTOMER, phone=f"918300{suffix.zfill(4)}")


def _partner(suffix="1"):
    return create_user(username=f"p4e_partner_{suffix}", role=UserRole.PARTNER, phone=f"918400{suffix.zfill(4)}")


def _make_accounts(suffix=""):
    asset = ChartOfAccount.objects.create(
        code=f"P4E-ASSET{suffix}",
        name=f"Test Cash {suffix}",
        account_type=ChartOfAccountType.ASSET,
    )
    equity = ChartOfAccount.objects.create(
        code=f"P4E-EQ{suffix}",
        name=f"Test Equity {suffix}",
        account_type=ChartOfAccountType.EQUITY,
    )
    return asset, equity


def _make_posted_journal(asset, equity, admin, amount="1000.00", entry_date=None):
    if entry_date is None:
        entry_date = AS_OF
    ensure_journal_numbering_profile_for_date(entry_date, performed_by=admin)
    je = create_journal_entry(
        entry_date=entry_date,
        entry_type=JournalEntryType.MANUAL,
        memo="P4E test posted journal",
        lines=[
            {
                "chart_account": asset,
                "debit_amount": Decimal(amount),
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": equity,
                "debit_amount": Decimal("0.00"),
                "credit_amount": Decimal(amount),
            },
        ],
    )
    post_journal_entry(journal_entry_id=je.id, posted_by=admin)
    return je


def _make_draft_journal(asset, equity, admin, entry_date=None):
    if entry_date is None:
        entry_date = AS_OF
    ensure_journal_numbering_profile_for_date(entry_date, performed_by=admin)
    je = create_journal_entry(
        entry_date=entry_date,
        entry_type=JournalEntryType.MANUAL,
        memo="P4E test draft journal",
        lines=[
            {
                "chart_account": asset,
                "debit_amount": Decimal("200.00"),
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": equity,
                "debit_amount": Decimal("0.00"),
                "credit_amount": Decimal("200.00"),
            },
        ],
    )
    # Leave in DRAFT status
    return je


# ─────────────────────────────────────────────────────────────────────────────
# build_accounting_export_index
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildAccountingExportIndex(TestCase):

    def test_returns_all_expected_report_keys(self):
        payload = build_accounting_export_index(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertEqual(payload["report_key"], "accounting_export_index")
        self.assertEqual(payload["period"]["year"], YEAR)
        self.assertEqual(payload["period"]["month"], MONTH)
        keys = {r["key"] for r in payload["reports"]}
        self.assertIn("trial_balance_export", keys)
        self.assertIn("journal_export", keys)
        self.assertIn("ledger_export", keys)
        self.assertIn("receivables_export", keys)
        self.assertIn("liability_export", keys)
        self.assertIn("bridge_audit_export", keys)

    def test_each_report_has_required_fields(self):
        payload = build_accounting_export_index(year=YEAR, month=MONTH, as_of=AS_OF)
        for report in payload["reports"]:
            self.assertIn("key", report)
            self.assertIn("title", report)
            self.assertIn("description", report)
            self.assertIn("endpoint", report)
            self.assertIn("formats", report)
            self.assertIn("json", report["formats"])
            self.assertIn("csv", report["formats"])

    def test_metadata_is_read_only(self):
        payload = build_accounting_export_index(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertTrue(payload["metadata"]["read_only"])

    def test_defaults_to_current_period(self):
        payload = build_accounting_export_index()
        today = timezone.localdate()
        self.assertEqual(payload["period"]["year"], today.year)
        self.assertEqual(payload["period"]["month"], today.month)


# ─────────────────────────────────────────────────────────────────────────────
# build_trial_balance_export
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildTrialBalanceExport(TestCase):

    def setUp(self):
        super().setUp()
        self.admin = _admin("tb1")
        create_open_accounting_period(AS_OF, performed_by=self.admin)
        self.asset, self.equity = _make_accounts("tb1")

    def test_returns_correct_envelope_structure(self):
        payload = build_trial_balance_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertEqual(payload["report_key"], "trial_balance_export")
        self.assertEqual(payload["period"]["year"], YEAR)
        self.assertIn("columns", payload)
        self.assertIn("rows", payload)
        self.assertIn("totals", payload)
        self.assertIn("warnings", payload)
        self.assertIn("metadata", payload)

    def test_rows_contain_expected_columns(self):
        _make_posted_journal(self.asset, self.equity, self.admin)
        payload = build_trial_balance_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertGreater(len(payload["rows"]), 0)
        row = payload["rows"][0]
        for col in ("account_code", "account_name", "account_type", "period_debit", "period_credit", "net_balance"):
            self.assertIn(col, row)

    def test_totals_reflect_posted_lines(self):
        _make_posted_journal(self.asset, self.equity, self.admin, amount="500.00")
        payload = build_trial_balance_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertGreaterEqual(Decimal(payload["totals"]["total_debit"]), Decimal("500.00"))

    def test_uses_p4b_source(self):
        payload = build_trial_balance_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertIn("source", payload["metadata"])
        self.assertIn("P4B", payload["metadata"]["source"])

    def test_no_records_mutated(self):
        before_je = JournalEntry.objects.count()
        before_jl = JournalEntryLine.objects.count()
        build_trial_balance_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertEqual(before_je, JournalEntry.objects.count())
        self.assertEqual(before_jl, JournalEntryLine.objects.count())


# ─────────────────────────────────────────────────────────────────────────────
# build_journal_export
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildJournalExport(TestCase):

    def setUp(self):
        super().setUp()
        self.admin = _admin("je1")
        create_open_accounting_period(AS_OF, performed_by=self.admin)
        self.asset, self.equity = _make_accounts("je1")

    def test_includes_posted_journals(self):
        _make_posted_journal(self.asset, self.equity, self.admin)
        payload = build_journal_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertGreater(len(payload["rows"]), 0)
        statuses = {r["journal_status"] for r in payload["rows"]}
        self.assertIn(JournalEntryStatus.POSTED, statuses)

    def test_draft_journals_excluded_by_default(self):
        _make_draft_journal(self.asset, self.equity, self.admin)
        payload = build_journal_export(year=YEAR, month=MONTH, as_of=AS_OF)
        statuses = {r["journal_status"] for r in payload["rows"]}
        self.assertNotIn(JournalEntryStatus.DRAFT, statuses)

    def test_draft_journals_included_with_flag(self):
        _make_draft_journal(self.asset, self.equity, self.admin)
        payload = build_journal_export(
            year=YEAR, month=MONTH, as_of=AS_OF, include_draft=True
        )
        statuses = {r["journal_status"] for r in payload["rows"]}
        self.assertIn(JournalEntryStatus.DRAFT, statuses)

    def test_voided_journals_excluded(self):
        je = _make_posted_journal(self.asset, self.equity, self.admin)
        # Void the journal
        je.status = JournalEntryStatus.VOID
        je.void_reason = "P4E test void"
        je.save(update_fields=["status", "void_reason", "updated_at"])

        payload = build_journal_export(year=YEAR, month=MONTH, as_of=AS_OF)
        statuses = {r["journal_status"] for r in payload["rows"]}
        self.assertNotIn(JournalEntryStatus.VOID, statuses)

    def test_rows_have_expected_columns(self):
        _make_posted_journal(self.asset, self.equity, self.admin)
        payload = build_journal_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertGreater(len(payload["rows"]), 0)
        row = payload["rows"][0]
        for col in (
            "entry_no", "entry_date", "account_code", "account_name",
            "debit_amount", "credit_amount", "journal_status",
        ):
            self.assertIn(col, row)

    def test_draft_include_produces_warning(self):
        _make_draft_journal(self.asset, self.equity, self.admin)
        payload = build_journal_export(
            year=YEAR, month=MONTH, as_of=AS_OF, include_draft=True
        )
        warnings_text = " ".join(payload["warnings"])
        self.assertIn("Draft", warnings_text)

    def test_totals_reflect_posted_debit_credit(self):
        _make_posted_journal(self.asset, self.equity, self.admin, amount="750.00")
        payload = build_journal_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertGreaterEqual(Decimal(payload["totals"]["total_debit"]), Decimal("750.00"))

    def test_no_records_mutated(self):
        before_je = JournalEntry.objects.count()
        build_journal_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertEqual(before_je, JournalEntry.objects.count())


# ─────────────────────────────────────────────────────────────────────────────
# build_ledger_export
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildLedgerExport(TestCase):

    def setUp(self):
        super().setUp()
        self.admin = _admin("le1")
        create_open_accounting_period(AS_OF, performed_by=self.admin)
        self.asset, self.equity = _make_accounts("le1")

    def test_returns_correct_envelope_structure(self):
        payload = build_ledger_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertEqual(payload["report_key"], "ledger_export")
        self.assertIn("columns", payload)
        self.assertIn("rows", payload)
        self.assertIn("totals", payload)

    def test_groups_rows_by_account(self):
        _make_posted_journal(self.asset, self.equity, self.admin)
        payload = build_ledger_export(year=YEAR, month=MONTH, as_of=AS_OF)
        account_codes = [r["account_code"] for r in payload["rows"]]
        # Each account code should appear at most once (summary rows)
        self.assertEqual(len(account_codes), len(set(account_codes)))

    def test_rows_have_expected_columns(self):
        _make_posted_journal(self.asset, self.equity, self.admin)
        payload = build_ledger_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertGreater(len(payload["rows"]), 0)
        row = payload["rows"][0]
        for col in ("account_code", "account_name", "account_type", "period_debit", "period_credit", "closing_balance"):
            self.assertIn(col, row)

    def test_opening_balance_deferred_warning(self):
        payload = build_ledger_export(year=YEAR, month=MONTH, as_of=AS_OF)
        warnings_text = " ".join(payload["warnings"])
        self.assertIn("deferred", warnings_text.lower())

    def test_no_records_mutated(self):
        before_je = JournalEntry.objects.count()
        build_ledger_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertEqual(before_je, JournalEntry.objects.count())


# ─────────────────────────────────────────────────────────────────────────────
# build_receivables_export
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildReceivablesExport(TestCase):

    def test_returns_correct_envelope_structure(self):
        payload = build_receivables_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertEqual(payload["report_key"], "receivables_export")
        self.assertIn("columns", payload)
        self.assertIn("rows", payload)
        self.assertIn("totals", payload)
        self.assertIn("warnings", payload)
        self.assertIn("metadata", payload)

    def test_totals_contain_required_keys(self):
        payload = build_receivables_export(year=YEAR, month=MONTH, as_of=AS_OF)
        totals = payload["totals"]
        self.assertIn("invoice_outstanding", totals)
        self.assertIn("rent_lease_outstanding", totals)
        self.assertIn("total_outstanding", totals)

    def test_privacy_note_present(self):
        payload = build_receivables_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertIn("privacy_note", payload["metadata"])
        self.assertIn("KYC", payload["metadata"]["privacy_note"])

    def test_rows_do_not_contain_customer_phone(self):
        payload = build_receivables_export(year=YEAR, month=MONTH, as_of=AS_OF)
        for row in payload["rows"]:
            self.assertNotIn("customer_phone", row)
            self.assertNotIn("phone", row)
            self.assertNotIn("address", row)

    def test_no_records_mutated(self):
        from billing.models import BillingInvoice
        before = BillingInvoice.objects.count()
        build_receivables_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertEqual(before, BillingInvoice.objects.count())


# ─────────────────────────────────────────────────────────────────────────────
# build_liability_export
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildLiabilityExport(TestCase):

    def test_returns_correct_envelope_structure(self):
        payload = build_liability_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertEqual(payload["report_key"], "liability_export")
        self.assertIn("columns", payload)
        self.assertIn("rows", payload)
        self.assertIn("totals", payload)

    def test_uses_p4c_source(self):
        payload = build_liability_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertIn("source", payload["metadata"])
        self.assertIn("P4C", payload["metadata"]["source"])

    def test_rows_contain_customer_advance_and_security_deposit(self):
        payload = build_liability_export(year=YEAR, month=MONTH, as_of=AS_OF)
        liability_types = {r["liability_type"] for r in payload["rows"]}
        self.assertIn("CUSTOMER_ADVANCE", liability_types)
        self.assertIn("SECURITY_DEPOSIT", liability_types)

    def test_totals_contain_expected_keys(self):
        payload = build_liability_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertIn("customer_advance_expected", payload["totals"])
        self.assertIn("security_deposit_expected", payload["totals"])
        self.assertIn("overall_status", payload["totals"])

    def test_no_records_mutated(self):
        before_bp = AccountingBridgePosting.objects.count()
        build_liability_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertEqual(before_bp, AccountingBridgePosting.objects.count())


# ─────────────────────────────────────────────────────────────────────────────
# build_bridge_audit_export
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildBridgeAuditExport(TestCase):

    def setUp(self):
        super().setUp()
        self.admin = _admin("ba1")
        create_open_accounting_period(AS_OF, performed_by=self.admin)
        self.asset, self.equity = _make_accounts("ba1")

    def _make_bridge_posting(self, purpose="TEST_PURPOSE", suffix="1"):
        from django.utils import timezone as tz

        # Create a POSTED journal entry directly to avoid document sequence conflicts
        # when multiple postings are made in the same test method.
        je = JournalEntry.objects.create(
            entry_date=AS_OF,
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_by=self.admin,
            posted_at=tz.now(),
            source_model="TestModel",
            source_id=f"test-{suffix}",
            memo=f"P4E bridge audit test {suffix}",
        )
        JournalEntryLine.objects.create(
            journal_entry=je,
            chart_account=self.asset,
            debit_amount=Decimal("100.00"),
            credit_amount=Decimal("0.00"),
        )
        JournalEntryLine.objects.create(
            journal_entry=je,
            chart_account=self.equity,
            debit_amount=Decimal("0.00"),
            credit_amount=Decimal("100.00"),
        )
        bp = AccountingBridgePosting.objects.create(
            source_model="TestModel",
            source_id=f"test-{suffix}",
            purpose=purpose,
            source_reference=f"REF-{suffix}",
            source_event_date=AS_OF,
            journal_entry=je,
        )
        return bp

    def test_returns_correct_envelope(self):
        payload = build_bridge_audit_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertEqual(payload["report_key"], "bridge_audit_export")
        self.assertIn("rows", payload)
        self.assertIn("totals", payload)
        self.assertIn("by_purpose", payload["totals"])

    def test_groups_by_purpose(self):
        self._make_bridge_posting("PURPOSE_A", "ba-1")
        self._make_bridge_posting("PURPOSE_A", "ba-2")
        self._make_bridge_posting("PURPOSE_B", "ba-3")
        payload = build_bridge_audit_export(year=YEAR, month=MONTH, as_of=AS_OF)
        by_purpose = payload["totals"]["by_purpose"]
        self.assertGreaterEqual(by_purpose.get("PURPOSE_A", 0), 2)
        self.assertGreaterEqual(by_purpose.get("PURPOSE_B", 0), 1)

    def test_rows_have_expected_columns(self):
        self._make_bridge_posting("PURPOSE_C", "ba-4")
        payload = build_bridge_audit_export(year=YEAR, month=MONTH, as_of=AS_OF)
        row = next(r for r in payload["rows"] if r["purpose"] == "PURPOSE_C")
        for col in (
            "purpose", "source_model", "source_id", "source_reference",
            "source_event_date", "journal_entry_no", "journal_entry_status",
        ):
            self.assertIn(col, row)

    def test_no_bridge_postings_created(self):
        before = AccountingBridgePosting.objects.count()
        build_bridge_audit_export(year=YEAR, month=MONTH, as_of=AS_OF)
        self.assertEqual(before, AccountingBridgePosting.objects.count())


# ─────────────────────────────────────────────────────────────────────────────
# API endpoint — format and permission tests
# ─────────────────────────────────────────────────────────────────────────────

class TestExportApiPermissions(TestCase):

    URLS = [
        _EXPORT_BASE,
        f"{_EXPORT_BASE}trial-balance/",
        f"{_EXPORT_BASE}journals/",
        f"{_EXPORT_BASE}ledgers/",
        f"{_EXPORT_BASE}receivables/",
        f"{_EXPORT_BASE}liabilities/",
        f"{_EXPORT_BASE}bridge-audit/",
    ]

    def setUp(self):
        super().setUp()
        self.client = APIClient()

    def test_admin_allowed_on_all_endpoints(self):
        admin = _admin("perm1")
        self.client.force_authenticate(user=admin)
        for url in self.URLS:
            with self.subTest(url=url):
                resp = self.client.get(url, {"year": YEAR, "month": MONTH})
                self.assertIn(resp.status_code, (200,), msg=f"Expected 200 for {url}")

    def test_cashier_blocked(self):
        cashier = _cashier("perm2")
        self.client.force_authenticate(user=cashier)
        for url in self.URLS:
            with self.subTest(url=url):
                resp = self.client.get(url)
                self.assertIn(resp.status_code, (403,))

    def test_customer_blocked(self):
        customer = _customer("perm3")
        self.client.force_authenticate(user=customer)
        for url in self.URLS:
            with self.subTest(url=url):
                resp = self.client.get(url)
                self.assertIn(resp.status_code, (403,))

    def test_partner_blocked(self):
        partner = _partner("perm4")
        self.client.force_authenticate(user=partner)
        for url in self.URLS:
            with self.subTest(url=url):
                resp = self.client.get(url)
                self.assertIn(resp.status_code, (403,))

    def test_unauthenticated_blocked(self):
        for url in self.URLS:
            with self.subTest(url=url):
                resp = self.client.get(url)
                self.assertIn(resp.status_code, (401, 403))


class TestExportApiFormats(TestCase):

    def setUp(self):
        super().setUp()
        self.admin = _admin("fmt1")
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_json_format_returns_200(self):
        resp = self.client.get(f"{_EXPORT_BASE}trial-balance/", {"year": YEAR, "month": MONTH, "export_format": "json"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("report_key", resp.data)

    def test_csv_format_returns_text_csv(self):
        resp = self.client.get(f"{_EXPORT_BASE}trial-balance/", {"year": YEAR, "month": MONTH, "export_format": "csv"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/csv", resp["Content-Type"])

    def test_unsupported_format_returns_400(self):
        resp = self.client.get(f"{_EXPORT_BASE}trial-balance/", {"year": YEAR, "month": MONTH, "export_format": "xlsx"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("error", resp.data)

    def test_journals_csv_returns_text_csv(self):
        resp = self.client.get(f"{_EXPORT_BASE}journals/", {"year": YEAR, "month": MONTH, "export_format": "csv"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/csv", resp["Content-Type"])

    def test_ledgers_csv_returns_text_csv(self):
        resp = self.client.get(f"{_EXPORT_BASE}ledgers/", {"year": YEAR, "month": MONTH, "export_format": "csv"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/csv", resp["Content-Type"])

    def test_receivables_csv_returns_text_csv(self):
        resp = self.client.get(f"{_EXPORT_BASE}receivables/", {"year": YEAR, "month": MONTH, "export_format": "csv"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/csv", resp["Content-Type"])

    def test_liabilities_csv_returns_text_csv(self):
        resp = self.client.get(f"{_EXPORT_BASE}liabilities/", {"year": YEAR, "month": MONTH, "export_format": "csv"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/csv", resp["Content-Type"])

    def test_bridge_audit_csv_returns_text_csv(self):
        resp = self.client.get(f"{_EXPORT_BASE}bridge-audit/", {"year": YEAR, "month": MONTH, "export_format": "csv"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/csv", resp["Content-Type"])

    def test_invalid_year_returns_400(self):
        resp = self.client.get(f"{_EXPORT_BASE}trial-balance/", {"year": "notanumber"})
        self.assertEqual(resp.status_code, 400)

    def test_invalid_month_returns_400(self):
        resp = self.client.get(f"{_EXPORT_BASE}journals/", {"month": "13"})
        self.assertEqual(resp.status_code, 400)

    def test_invalid_as_of_returns_400(self):
        resp = self.client.get(f"{_EXPORT_BASE}ledgers/", {"as_of": "not-a-date"})
        self.assertEqual(resp.status_code, 400)


class TestExportApiNoMutation(TestCase):
    """Verifies that calling export endpoints does not create or mutate any records."""

    def setUp(self):
        super().setUp()
        self.admin = _admin("nm1")
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        create_open_accounting_period(AS_OF, performed_by=self.admin)
        asset, equity = _make_accounts("nm1")
        ensure_journal_numbering_profile_for_date(AS_OF, performed_by=self.admin)
        je = create_journal_entry(
            entry_date=AS_OF,
            entry_type=JournalEntryType.MANUAL,
            memo="P4E no-mutation baseline",
            lines=[
                {"chart_account": asset, "debit_amount": Decimal("100.00"), "credit_amount": Decimal("0.00")},
                {"chart_account": equity, "debit_amount": Decimal("0.00"), "credit_amount": Decimal("100.00")},
            ],
        )
        post_journal_entry(journal_entry_id=je.id, posted_by=self.admin)

        self.baseline = {
            "je": JournalEntry.objects.count(),
            "jl": JournalEntryLine.objects.count(),
            "bp": AccountingBridgePosting.objects.count(),
        }

    def test_no_records_created_on_index(self):
        self.client.get(_EXPORT_BASE, {"year": YEAR, "month": MONTH})
        self.assertEqual(JournalEntry.objects.count(), self.baseline["je"])
        self.assertEqual(AccountingBridgePosting.objects.count(), self.baseline["bp"])

    def test_no_records_created_on_trial_balance(self):
        self.client.get(f"{_EXPORT_BASE}trial-balance/", {"year": YEAR, "month": MONTH})
        self.assertEqual(JournalEntry.objects.count(), self.baseline["je"])
        self.assertEqual(JournalEntryLine.objects.count(), self.baseline["jl"])

    def test_no_records_created_on_journals(self):
        self.client.get(f"{_EXPORT_BASE}journals/", {"year": YEAR, "month": MONTH})
        self.assertEqual(JournalEntry.objects.count(), self.baseline["je"])

    def test_no_records_created_on_ledgers(self):
        self.client.get(f"{_EXPORT_BASE}ledgers/", {"year": YEAR, "month": MONTH})
        self.assertEqual(JournalEntry.objects.count(), self.baseline["je"])

    def test_no_records_created_on_receivables(self):
        self.client.get(f"{_EXPORT_BASE}receivables/", {"year": YEAR, "month": MONTH})
        self.assertEqual(JournalEntry.objects.count(), self.baseline["je"])

    def test_no_records_created_on_liabilities(self):
        self.client.get(f"{_EXPORT_BASE}liabilities/", {"year": YEAR, "month": MONTH})
        self.assertEqual(AccountingBridgePosting.objects.count(), self.baseline["bp"])

    def test_no_records_created_on_bridge_audit(self):
        self.client.get(f"{_EXPORT_BASE}bridge-audit/", {"year": YEAR, "month": MONTH})
        self.assertEqual(AccountingBridgePosting.objects.count(), self.baseline["bp"])
