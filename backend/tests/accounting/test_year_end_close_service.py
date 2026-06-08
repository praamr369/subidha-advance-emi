from __future__ import annotations

from calendar import monthrange
from datetime import date
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from accounting.models import AccountingPeriod, AccountingPeriodStatus, DocumentSequence, FinancialYear, JournalEntry
from accounting.services.accounting_bridge_reconciliation_read_service import BridgeReconciliationFilters, build_accounting_bridge_reconciliation
from accounting.services.year_end_close_service import YearEndCloseCommand, build_year_end_close_readiness, execute_year_end_close
from reconciliation.models import ReconciliationItem, ReconciliationRun, ReconciliationRunStatus
from tests.helpers import create_admin_user, create_customer_user


def _month_starts(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current = current.replace(year=current.year + 1, month=1, day=1) if current.month == 12 else current.replace(month=current.month + 1, day=1)


def _make_financial_year(*, code="FY2026-27", is_active=True, start_date=date(2026, 4, 1), end_date=date(2027, 3, 31)):
    return FinancialYear.objects.create(code=code, name=f"FY {start_date.year}-{str(end_date.year)[-2:]}", start_date=start_date, end_date=end_date, is_active=is_active)


def _make_periods(financial_year: FinancialYear, *, status=AccountingPeriodStatus.LOCKED):
    periods = []
    for current in _month_starts(financial_year.start_date, financial_year.end_date):
        period_end = date(current.year, current.month, monthrange(current.year, current.month)[1])
        periods.append(AccountingPeriod.objects.create(financial_year=financial_year, code=f"{financial_year.code}-{current.year}{current.month:02d}", label=current.strftime("%B %Y"), name=current.strftime("%B %Y"), start_date=current, end_date=min(period_end, financial_year.end_date), status=status, is_locked=status != AccountingPeriodStatus.OPEN))
    return periods


def _make_journal_numbering(financial_year: FinancialYear):
    return DocumentSequence.objects.create(series_code="JOURNAL", document_type="JOURNAL_ENTRY", financial_year=financial_year.code.removeprefix("FY"), financial_year_ref=financial_year, prefix="JE", padding=5, next_number=1, is_active=True)


def _mock_readiness_payload():
    return {
        "events": [
            {"event_key": "emi_payment", "label": "EMI payment", "source_module": "subscriptions", "event_group": "EMI", "source_model": "Payment", "status": "READY", "posting_mode": "AUTO", "blocking_reasons": [], "operator_action": "Preview before posting."},
            {"event_key": "inventory_delivery_out", "label": "Inventory delivery out", "source_module": "inventory", "event_group": "Inventory", "source_model": "StockLedger", "status": "ERROR", "posting_mode": "AUTO", "blocking_reasons": ["Missing COGS expense account"], "operator_action": "Fix mapping."},
            {"event_key": "manufacturing_wastage", "label": "Manufacturing wastage", "source_module": "manufacturing", "event_group": "Manufacturing", "source_model": "ProductionJob", "status": "ERROR", "posting_mode": "AUTO", "blocking_reasons": ["Missing wastage expense account"], "operator_action": "Fix mapping."},
            {"event_key": "staff_advance", "label": "Staff advance", "source_module": "accounting", "event_group": "HR", "source_model": "StaffAdvance", "status": "ERROR", "posting_mode": "UNSUPPORTED", "blocking_reasons": ["Unsupported StaffAdvance source"], "operator_action": "Unsupported source model."},
        ],
        "financial_year_readiness": {"financial_year_ready": True, "accounting_period_ready": True, "journal_numbering_ready": True},
        "accounting_period_readiness": {"financial_year_ready": True, "accounting_period_ready": True, "journal_numbering_ready": True},
    }


class BridgeReconciliationRemediationTests(TestCase):
    @patch("accounting.services.accounting_bridge_reconciliation_read_service.build_accounting_bridge_readiness_with_returns_damage_credit", return_value=_mock_readiness_payload())
    def test_reconciliation_payload_includes_recommended_actions_and_counts(self, _readiness):
        financial_year = _make_financial_year()
        _make_periods(financial_year, status=AccountingPeriodStatus.OPEN)
        _make_journal_numbering(financial_year)
        before_journals = JournalEntry.objects.count()
        before_sequences = DocumentSequence.objects.count()
        payload = build_accounting_bridge_reconciliation(BridgeReconciliationFilters(financial_year=str(financial_year.id)))
        self.assertEqual(payload["summary"]["ready_unposted_count"], 1)
        self.assertEqual(payload["summary"]["blocked_by_mapping_count"], 2)
        self.assertEqual(payload["summary"]["unsupported_source_count"], 1)
        self.assertIn("emi_payment", payload["summary"]["ready_unposted_by_event"])
        self.assertIn("inventory_delivery_out", payload["summary"]["blocked_by_mapping_by_event"])
        blocked = {row["event_key"]: row for row in payload["results"] if row["status"] == "BLOCKED_BY_MAPPING"}
        self.assertTrue(blocked["inventory_delivery_out"]["action_href"])
        self.assertTrue(blocked["manufacturing_wastage"]["action_href"])
        staff_advance = {row["event_key"]: row for row in payload["results"]}["staff_advance"]
        self.assertEqual(staff_advance["status"], "UNSUPPORTED_SOURCE")
        self.assertEqual(staff_advance["blocker_code"], "UNSUPPORTED_SOURCE")
        self.assertFalse(staff_advance["is_postable"])
        self.assertEqual(JournalEntry.objects.count(), before_journals)
        self.assertEqual(DocumentSequence.objects.count(), before_sequences)


class YearEndCloseReadinessTests(TestCase):
    def test_readiness_blocked_when_no_financial_year_exists(self):
        payload = build_year_end_close_readiness()
        self.assertFalse(payload["ready_to_close"])
        self.assertEqual(payload["blocking_items"][0]["code"], "NO_FINANCIAL_YEAR")
        self.assertIn("recommended_action", payload["blocking_items"][0])

    @patch("accounting.services.year_end_close_service._bridge_payload", return_value={"summary": {"unposted_bridge_item_count": 0, "blocked_bridge_item_count": 0}, "results": []})
    def test_readiness_blocked_when_period_is_open(self, _bridge_payload):
        financial_year = _make_financial_year()
        _make_periods(financial_year, status=AccountingPeriodStatus.OPEN)
        _make_journal_numbering(financial_year)
        payload = build_year_end_close_readiness(financial_year.id)
        self.assertFalse(payload["ready_to_close"])
        issue = {item["code"]: item for item in payload["blocking_items"]}["OPEN_PERIODS"]
        self.assertIn("lock eligible", issue["recommended_action"].lower())
        self.assertTrue(issue["action_href"])

    @patch("accounting.services.year_end_close_service._bridge_payload", return_value={"summary": {"unposted_bridge_item_count": 3, "blocked_bridge_item_count": 0}, "results": []})
    def test_readiness_blocked_when_unposted_bridge_items_exist(self, _bridge_payload):
        financial_year = _make_financial_year()
        _make_periods(financial_year, status=AccountingPeriodStatus.LOCKED)
        _make_journal_numbering(financial_year)
        payload = build_year_end_close_readiness(financial_year.id)
        self.assertFalse(payload["ready_to_close"])
        self.assertIn("UNPOSTED_BRIDGE_ITEMS", {item["code"] for item in payload["blocking_items"]})

    @patch("accounting.services.year_end_close_service._bridge_payload", return_value={"summary": {"unposted_bridge_item_count": 0, "blocked_bridge_item_count": 0}, "results": []})
    def test_readiness_passes_when_periods_locked_and_clean(self, _bridge_payload):
        financial_year = _make_financial_year()
        _make_periods(financial_year, status=AccountingPeriodStatus.LOCKED)
        _make_journal_numbering(financial_year)
        payload = build_year_end_close_readiness(financial_year.id)
        self.assertTrue(payload["ready_to_close"])
        self.assertEqual(payload["open_period_count"], 0)
        self.assertEqual(payload["unposted_bridge_item_count"], 0)

    @patch("accounting.services.year_end_close_service._bridge_payload", return_value={"summary": {"unposted_bridge_item_count": 0, "blocked_bridge_item_count": 0}, "results": []})
    def test_readiness_blocked_when_reconciliation_errors_exist(self, _bridge_payload):
        admin = create_admin_user(username="year_close_recon_admin")
        financial_year = _make_financial_year()
        _make_periods(financial_year, status=AccountingPeriodStatus.LOCKED)
        _make_journal_numbering(financial_year)
        run = ReconciliationRun.objects.create(
            run_no=1,
            scope="YEAR_END",
            module="accounting",
            status=ReconciliationRunStatus.COMPLETED,
            started_by=admin,
        )
        ReconciliationItem.objects.create(
            run=run,
            module="accounting",
            source_type="Payment",
            source_id="phase-f-payment",
            status="AMOUNT_MISMATCH",
            exception_code="YEAR_END_AMOUNT_MISMATCH",
            exception_message="Mismatch must block year-end close.",
        )
        payload = build_year_end_close_readiness(financial_year.id)
        self.assertFalse(payload["ready_to_close"])
        self.assertEqual(payload["reconciliation_error_count"], 1)
        self.assertIn("RECONCILIATION_EXCEPTIONS", {item["code"] for item in payload["blocking_items"]})

    @patch("accounting.services.year_end_close_service._bridge_payload", return_value={"summary": {"unposted_bridge_item_count": 0, "blocked_bridge_item_count": 0}, "results": []})
    def test_close_requires_confirmation_text(self, _bridge_payload):
        admin = create_admin_user(username="year_close_admin_confirm")
        financial_year = _make_financial_year()
        _make_periods(financial_year, status=AccountingPeriodStatus.LOCKED)
        _make_journal_numbering(financial_year)
        with self.assertRaises(ValueError):
            execute_year_end_close(YearEndCloseCommand(financial_year=financial_year.id, confirmation_text="WRONG", acknowledge_warnings=True), performed_by=admin)

    @patch("accounting.services.year_end_close_service._bridge_payload", return_value={"summary": {"unposted_bridge_item_count": 0, "blocked_bridge_item_count": 0}, "results": []})
    def test_close_closes_only_selected_financial_year_periods_and_is_idempotent(self, _bridge_payload):
        admin = create_admin_user(username="year_close_admin_execute")
        selected = _make_financial_year(code="FY2026-27", is_active=True, start_date=date(2026, 4, 1), end_date=date(2027, 3, 31))
        other = _make_financial_year(code="FY2027-28", is_active=False, start_date=date(2027, 4, 1), end_date=date(2028, 3, 31))
        _make_periods(selected, status=AccountingPeriodStatus.LOCKED)
        _make_periods(other, status=AccountingPeriodStatus.LOCKED)
        _make_journal_numbering(selected)
        before_journals = JournalEntry.objects.count()
        before_sequences = DocumentSequence.objects.count()
        result = execute_year_end_close(YearEndCloseCommand(financial_year=selected.id, confirmation_text="CLOSE FY2026-27", acknowledge_warnings=True), performed_by=admin)
        self.assertTrue(result["updated"])
        self.assertEqual(AccountingPeriod.objects.filter(financial_year=selected, status=AccountingPeriodStatus.CLOSED).count(), 12)
        self.assertEqual(AccountingPeriod.objects.filter(financial_year=other, status=AccountingPeriodStatus.LOCKED).count(), 12)
        self.assertEqual(JournalEntry.objects.count(), before_journals)
        self.assertEqual(DocumentSequence.objects.count(), before_sequences)
        second = execute_year_end_close(YearEndCloseCommand(financial_year=selected.id, confirmation_text="CLOSE FY2026-27", acknowledge_warnings=True), performed_by=admin)
        self.assertFalse(second["updated"])
        self.assertTrue(second["already_closed"])


class YearEndCloseApiTests(TestCase):
    def test_close_requires_admin_user(self):
        client = APIClient()
        user = create_customer_user(username="year_close_customer")
        client.force_authenticate(user=user)
        response = client.post("/api/v1/accounting/year-end/close/", {"financial_year": "FY2026-27", "confirmation_text": "CLOSE FY2026-27"}, format="json")
        self.assertIn(response.status_code, {401, 403})

    def test_readiness_endpoint_does_not_create_journals_or_document_numbers(self):
        admin = create_admin_user(username="year_close_admin_readonly")
        client = APIClient()
        client.force_authenticate(user=admin)
        before_journals = JournalEntry.objects.count()
        before_sequences = DocumentSequence.objects.count()
        response = client.get("/api/v1/accounting/year-end/readiness/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(JournalEntry.objects.count(), before_journals)
        self.assertEqual(DocumentSequence.objects.count(), before_sequences)

    def test_admin_year_end_endpoint_aliases_are_available(self):
        admin = create_admin_user(username="year_close_admin_alias")
        client = APIClient()
        client.force_authenticate(user=admin)
        response = client.get("/api/v1/admin/accounting/year-end/readiness/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("action_links", response.data)
        blocked = client.post("/api/v1/admin/accounting/year-end/close/", {"financial_year": "FY2026-27", "confirmation_text": "WRONG"}, format="json")
        self.assertEqual(blocked.status_code, 400)
