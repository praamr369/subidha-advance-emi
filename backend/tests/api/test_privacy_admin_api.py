"""The staff half of the DPDP surface: the DPO queue and breach response.

The customer half shipped first, which left the system able to accept a
grievance and unable to answer one — a customer could file, and no screen or
endpoint existed for staff to respond. These endpoints are that other half.

Two things are worth more than the happy paths here, and both are covered
below:

  * access control, because this queue is every customer's grievance in one
    list and the permission class is the entire thing standing between that and
    any authenticated user; and
  * the statutory timestamps, because DPDP 2023 gives deadlines and the value
    of an audit trail is precisely that it cannot be quietly rewritten later.
"""
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from datetime import timedelta

from privacy.models import BreachSeverity, BreachStatus, DataBreachLog, DPOGrievance
from subscriptions.models import AuditLog
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_customer_user,
)


class PrivacyAdminTestCase(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="dpo_admin", phone="9000007001")
        self.customer_user = create_customer_user(
            username="dpo_cust", phone="9000007002"
        )
        self.customer = create_customer_profile(
            user=self.customer_user, name="Grievance Customer", phone="9000007002"
        )
        now = timezone.now()
        self.grievance = DPOGrievance.objects.create(
            customer=self.customer,
            grievance_type="DATA_ACCESS",
            title="Cannot download my data",
            description="The export never arrives.",
            stage_1_due=now + timedelta(days=30),
            stage_2_due=now + timedelta(days=44),
        )
        self.client.force_authenticate(user=self.admin)


class GrievanceQueueTests(PrivacyAdminTestCase):
    def test_queue_lists_grievances_with_the_customer_attached(self):
        """A queue you cannot attribute is not a queue.

        The customer-facing serializer omits the customer deliberately; this
        one must not, or staff cannot tell whose complaint they are reading.
        """
        response = self.client.get(reverse("admin-privacy-grievances"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["customer_name"], "Grievance Customer")
        self.assertEqual(response.data[0]["status"], "FILED")

    def test_a_customer_cannot_read_the_queue(self):
        """The whole queue is every customer's complaints in one response."""
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.get(reverse("admin-privacy-grievances"))

        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_a_customer_cannot_resolve_their_own_grievance(self):
        """Otherwise the redressal record is written by the complainant."""
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.post(
            reverse(
                "admin-privacy-grievance-resolve",
                kwargs={"grievance_id": self.grievance.pk},
            ),
            {"resolution_notes": "I say it is fine"},
            format="json",
        )

        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
        self.grievance.refresh_from_db()
        self.assertEqual(self.grievance.status, "FILED")


class GrievanceResolveTests(PrivacyAdminTestCase):
    def _resolve(self, notes="Export re-sent and confirmed received."):
        return self.client.post(
            reverse(
                "admin-privacy-grievance-resolve",
                kwargs={"grievance_id": self.grievance.pk},
            ),
            {"resolution_notes": notes},
            format="json",
        )

    def test_resolving_records_notes_time_and_owner(self):
        response = self._resolve()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.grievance.refresh_from_db()
        self.assertEqual(self.grievance.status, "RESOLVED")
        self.assertEqual(
            self.grievance.resolution_notes, "Export re-sent and confirmed received."
        )
        self.assertIsNotNone(self.grievance.resolved_at)
        # Unassigned grievances are claimed by whoever resolves them, so the
        # record always names someone accountable.
        self.assertEqual(self.grievance.assigned_to_dpo, self.admin)

    def test_resolution_notes_are_required(self):
        """A grievance closed with no stated reason evidences nothing."""
        response = self.client.post(
            reverse(
                "admin-privacy-grievance-resolve",
                kwargs={"grievance_id": self.grievance.pk},
            ),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.grievance.refresh_from_db()
        self.assertEqual(self.grievance.status, "FILED")

    def test_resolving_twice_does_not_overwrite_the_first_resolution(self):
        """The first resolution is the one with statutory meaning.

        A second call must not move resolved_at — that timestamp is what shows
        whether the 30-day deadline was met, and letting a later edit push it
        forward would destroy the only evidence that it was.
        """
        self._resolve("First answer.")
        self.grievance.refresh_from_db()
        original_notes = self.grievance.resolution_notes
        original_time = self.grievance.resolved_at

        response = self._resolve("Second, different answer.")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.grievance.refresh_from_db()
        self.assertEqual(self.grievance.resolution_notes, original_notes)
        self.assertEqual(self.grievance.resolved_at, original_time)

    def test_resolution_is_audited_with_whether_the_deadline_was_met(self):
        self._resolve()

        entry = AuditLog.objects.filter(
            action_type="PRIVACY_GRIEVANCE_RESOLVED",
            object_id=str(self.grievance.pk),
        ).first()

        self.assertIsNotNone(entry, "resolving a grievance must leave an audit row")
        self.assertTrue(entry.metadata["within_stage_1_deadline"])

    def test_an_overdue_grievance_is_audited_as_late(self):
        """The deadline check has to actually compare against the due date.

        Without this, a guard that always reported success would pass every
        other test on this page.
        """
        self.grievance.stage_1_due = timezone.now() - timedelta(days=1)
        self.grievance.save(update_fields=["stage_1_due"])

        self._resolve()

        entry = AuditLog.objects.filter(
            action_type="PRIVACY_GRIEVANCE_RESOLVED",
            object_id=str(self.grievance.pk),
        ).first()
        self.assertFalse(entry.metadata["within_stage_1_deadline"])

    def test_overdue_flag_clears_once_resolved(self):
        """Lateness is a fact about the response, not a permanent state."""
        self.grievance.stage_1_due = timezone.now() - timedelta(days=1)
        self.grievance.save(update_fields=["stage_1_due"])

        overdue = self.client.get(reverse("admin-privacy-grievances")).data[0]
        self.assertTrue(overdue["is_overdue"])

        self._resolve()

        resolved = self.client.get(reverse("admin-privacy-grievances")).data[0]
        self.assertFalse(resolved["is_overdue"])


class BreachTests(PrivacyAdminTestCase):
    def _create(self, **overrides):
        payload = {
            "title": "Vendor export left unsecured",
            "severity": BreachSeverity.CRITICAL,
            "description": "A CSV of contact details was reachable without auth.",
            "affected_records": 240,
        }
        payload.update(overrides)
        return self.client.post(
            reverse("admin-privacy-breach-notifications"), payload, format="json"
        )

    def test_reporting_a_breach_starts_it_in_reported(self):
        response = self._create()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        breach = DataBreachLog.objects.get(pk=response.data["id"])
        self.assertEqual(breach.status, BreachStatus.REPORTED)
        self.assertEqual(breach.severity, BreachSeverity.CRITICAL)
        self.assertEqual(breach.affected_customer_count, 240)
        # The statutory clock runs from discovery, so it must never be null.
        self.assertIsNotNone(breach.discovered_at)

    def test_severity_is_required(self):
        """Defaulting it would silently downgrade a critical breach."""
        response = self.client.post(
            reverse("admin-privacy-breach-notifications"),
            {
                "title": "Something happened",
                "description": "Unclear.",
                "affected_records": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_board_and_principal_notifications_are_tracked_separately(self):
        """DPDP 2023 s.8(6) is two obligations, not one.

        Collapsing them into a single "notified" flag would make it impossible
        to show the Board was told while principal notices were still going
        out — which is the normal case for a large breach.
        """
        breach_id = self._create().data["id"]

        board = self.client.post(
            reverse(
                "admin-privacy-breach-notification-action",
                kwargs={"breach_id": breach_id, "action": "notify-board"},
            )
        )
        self.assertEqual(board.status_code, status.HTTP_200_OK)

        breach = DataBreachLog.objects.get(pk=breach_id)
        self.assertIsNotNone(breach.board_notified_at)
        self.assertTrue(breach.authority_notified)
        self.assertIsNone(
            breach.notified_at, "principals must not be marked notified yet"
        )

        self.client.post(
            reverse(
                "admin-privacy-breach-notification-action",
                kwargs={"breach_id": breach_id, "action": "notify-principals"},
            )
        )
        breach.refresh_from_db()
        self.assertIsNotNone(breach.notified_at)
        self.assertEqual(breach.status, BreachStatus.NOTIFIED_PRINCIPALS)

    def test_a_notification_timestamp_is_never_moved_by_a_repeat_action(self):
        """First notification is the one the deadline is measured against."""
        breach_id = self._create().data["id"]
        url = reverse(
            "admin-privacy-breach-notification-action",
            kwargs={"breach_id": breach_id, "action": "notify-board"},
        )

        self.client.post(url)
        first = DataBreachLog.objects.get(pk=breach_id).board_notified_at

        self.client.post(url)

        self.assertEqual(DataBreachLog.objects.get(pk=breach_id).board_notified_at, first)

    def test_an_unknown_action_is_rejected_with_the_allowed_list(self):
        """The URL takes a free-form segment, so the view is the only guard."""
        breach_id = self._create().data["id"]

        response = self.client.post(
            reverse(
                "admin-privacy-breach-notification-action",
                kwargs={"breach_id": breach_id, "action": "delete-everything"},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("notify-board", response.data["allowed"])
        self.assertEqual(
            DataBreachLog.objects.get(pk=breach_id).status, BreachStatus.REPORTED
        )

    def test_a_customer_cannot_report_or_read_breaches(self):
        self.client.force_authenticate(user=self.customer_user)

        listed = self.client.get(reverse("admin-privacy-breach-notifications"))

        self.assertIn(
            listed.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


class LegacyPathTests(PrivacyAdminTestCase):
    """Two admin pages exist per concept, on different URL conventions.

    Both 404'd, so neither is established by use. Each concept is implemented
    once and mounted at both paths; these tests pin that the older paths reach
    the same implementation, so the duplicate cannot silently drift into a
    second implementation later.
    """

    def test_the_legacy_grievance_queue_path_resolves_to_the_same_view(self):
        response = self.client.get(reverse("privacy-admin-grievances"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["customer_name"], "Grievance Customer")

    def test_the_legacy_notify_path_means_notify_principals(self):
        """That page predates the board/principal split.

        It has one "notify" button and no way to express which obligation it
        means, so the mapping is a decision, not a detail: it marks the
        principals notified and leaves the Board notification unclaimed, since
        claiming the stronger of the two on a guess would fabricate evidence.
        """
        breach = DataBreachLog.objects.create(
            title="Legacy path breach",
            breach_description="x",
            data_types_affected=[],
            affected_customer_count=3,
            discovered_at=timezone.now(),
        )

        response = self.client.post(
            reverse("privacy-data-breach-notify", kwargs={"breach_id": breach.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        breach.refresh_from_db()
        self.assertIsNotNone(breach.notified_at)
        self.assertIsNone(breach.board_notified_at)
        self.assertFalse(breach.authority_notified)
