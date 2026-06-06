from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import DocumentSequence, JournalEntry
from tests.helpers import create_admin_user, create_customer_user


class AccountingPostabilityPhaseE4BTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="phase_e4b_admin", phone="9304000951")
        self.client.force_authenticate(user=self.admin)

    def assert_no_journal_or_sequence_created(self, fn):
        journal_before = JournalEntry.objects.count()
        sequence_before = DocumentSequence.objects.count()
        response = fn()
        self.assertEqual(JournalEntry.objects.count(), journal_before)
        self.assertEqual(DocumentSequence.objects.count(), sequence_before)
        return response

    def test_bridge_readiness_uses_canonical_postability_statuses(self):
        response = self.assert_no_journal_or_sequence_created(
            lambda: self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("canonical_statuses", response.data)
        self.assertIn("POSTABLE", response.data["canonical_statuses"])
        self.assertIn("BLOCKED_BY_MAPPING", response.data["canonical_statuses"])
        self.assertIn("UNSUPPORTED_SOURCE", response.data["canonical_statuses"])
        rows = {row["event_key"]: row for row in response.data["events"]}
        self.assertEqual(rows["staff_advance"]["status"], "UNSUPPORTED_SOURCE")
        self.assertFalse(rows["staff_advance"]["can_post"])

    def test_bridge_reconciliation_uses_canonical_postability_statuses(self):
        response = self.assert_no_journal_or_sequence_created(
            lambda: self.client.get("/api/v1/accounting/bridge-reconciliation/")
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("canonical_statuses", response.data)
        self.assertIn("status_counts_by_event", response.data["summary"])
        statuses = {row["status"] for row in response.data["results"]}
        self.assertTrue(statuses.intersection(set(response.data["canonical_statuses"]) | {"EXCEPTION"}))
        rows = {row["event_key"]: row for row in response.data["results"]}
        self.assertEqual(rows["staff_advance"]["status"], "UNSUPPORTED_SOURCE")
        self.assertFalse(rows["staff_advance"]["can_post"])

    def test_year_end_readiness_returns_action_links_and_is_read_only(self):
        response = self.assert_no_journal_or_sequence_created(
            lambda: self.client.get("/api/v1/accounting/year-end/readiness/")
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        issues = list(response.data.get("blocking_items") or []) + list(response.data.get("warning_items") or [])
        self.assertTrue(all("recommended_action" in item for item in issues))
        self.assertTrue(all("action_href" in item for item in issues))

    def test_non_admin_cannot_call_bridge_readiness(self):
        customer = create_customer_user(username="phase_e4b_customer", phone="9304000952")
        self.client.force_authenticate(user=customer)
        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_bridges_and_reconciliation_agree_on_staff_advance(self):
        bridge = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        reconciliation = self.client.get("/api/v1/accounting/bridge-reconciliation/")
        self.assertEqual(bridge.status_code, status.HTTP_200_OK, bridge.data)
        self.assertEqual(reconciliation.status_code, status.HTTP_200_OK, reconciliation.data)
        bridge_row = {row["event_key"]: row for row in bridge.data["events"]}["staff_advance"]
        recon_row = {row["event_key"]: row for row in reconciliation.data["results"]}["staff_advance"]
        self.assertEqual(bridge_row["status"], recon_row["status"])
        self.assertEqual(recon_row["status"], "UNSUPPORTED_SOURCE")
        self.assertFalse(bridge_row["can_post"])
        self.assertFalse(recon_row["can_post"])
