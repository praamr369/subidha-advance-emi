"""The staff side of three customer-facing queues.

Warranty service visits, consumer defect/return handling and lucky-draw
authorisation were built as customer-facing surfaces with no back office. A
customer could file a warranty claim or a return and there was no endpoint —
and so no screen — for anyone to answer it.

These three queues share a shape: list what is waiting, then act on one item.
The tests below concentrate on the parts where the *act* half carries a rule
worth breaking a build over — attribution, statutory windows, and the
two-person control on draws — rather than re-testing that a list returns rows.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from deliveries.models import ConsumerReturnRequest, DefectClaim
from lucky_plan.models import DrawAuthorisation
from service_desk.models import ServiceDeskCase, WarrantyClaim
from subscriptions.enums import (
    DefectSeverity,
    DrawAuthorisationStatus,
    ReturnRequestStatus,
)
from subscriptions.models import AuditLog
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_lucky_id,
    create_product,
    create_subscription,
)


class QueueTestCase(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="queue_admin", phone="9000008001")
        self.other_admin = create_admin_user(
            username="queue_admin_2", phone="9000008004"
        )
        self.customer_user = create_customer_user(
            username="queue_cust", phone="9000008002"
        )
        self.customer = create_customer_profile(
            user=self.customer_user, name="Queue Customer", phone="9000008002"
        )
        self.product = create_product(name="Queue Sofa", product_code="TP-QUEUE")
        self.batch = create_batch()
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=create_lucky_id(batch=self.batch, lucky_number=7),
        )
        self.client.force_authenticate(user=self.admin)


class WarrantyScheduleTests(QueueTestCase):
    def setUp(self):
        super().setUp()
        case = ServiceDeskCase.objects.create(
            subscription=self.subscription,
            product=self.product,
            # There is no WARRANTY case type; a warranty claim is raised
            # against a SERVICE case, with WarrantyClaim carrying the warranty
            # specifics.
            case_type="SERVICE",
            issue_summary="Frame cracked",
        )
        self.claim = WarrantyClaim.objects.create(
            service_case=case,
            product=self.product,
            subscription=self.subscription,
            warranty_start_date=date.today() - timedelta(days=30),
            warranty_end_date=date.today() + timedelta(days=335),
            defect_description="Frame cracked at the joint",
            defect_date_discovered=date.today() - timedelta(days=2),
            claim_status="APPROVED",
        )

    def test_the_board_shows_approved_claims_that_are_not_yet_scheduled(self):
        """An unscheduled approved claim is the one that needs attention.

        A board showing only booked visits would hide exactly the claims
        nobody has acted on — which is the failure this whole surface exists
        to prevent.
        """
        response = self.client.get(reverse("warranty-service-schedule"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        row = response.data[0]
        self.assertEqual(row["claim_id"], self.claim.pk)
        self.assertEqual(row["status"], "AWAITING_SCHEDULE")
        self.assertEqual(row["customer_name"], "Queue Customer")

    def test_scheduling_records_the_date_and_technician(self):
        visit = date.today() + timedelta(days=3)

        response = self.client.post(
            reverse("warranty-claim-schedule", kwargs={"claim_id": self.claim.pk}),
            {"scheduled_date": visit.isoformat(), "technician_name": "R. Das"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "SCHEDULED")
        self.claim.refresh_from_db()
        self.assertEqual(self.claim.scheduled_date, visit)
        self.assertEqual(self.claim.technician_name, "R. Das")

    def test_an_unapproved_claim_cannot_be_scheduled(self):
        """Committing an engineer's day to a claim that may be rejected."""
        self.claim.claim_status = "SUBMITTED"
        self.claim.save(update_fields=["claim_status"])

        response = self.client.post(
            reverse("warranty-claim-schedule", kwargs={"claim_id": self.claim.pk}),
            {"scheduled_date": date.today().isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.claim.refresh_from_db()
        self.assertIsNone(self.claim.scheduled_date)

    def test_completing_a_visit_does_not_resolve_the_claim(self):
        """The visit happening and the defect being fixed are different facts.

        Conflating them would let a completed visit silently close a claim the
        customer is still unhappy with — resolution goes through the existing
        /admin/warranty-claims/<id>/resolve/ endpoint.
        """
        self.claim.scheduled_date = date.today()
        self.claim.save(update_fields=["scheduled_date"])

        response = self.client.post(
            reverse(
                "warranty-service-call-complete", kwargs={"claim_id": self.claim.pk}
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.claim.refresh_from_db()
        self.assertIsNotNone(self.claim.service_completed_at)
        self.assertEqual(
            self.claim.claim_status, "APPROVED", "completing a visit must not resolve"
        )

    def test_completing_an_unscheduled_visit_is_refused(self):
        response = self.client.post(
            reverse(
                "warranty-service-call-complete", kwargs={"claim_id": self.claim.pk}
            )
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_customer_cannot_read_the_schedule_board(self):
        """It lists every customer's name, phone and home address."""
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.get(reverse("warranty-service-schedule"))

        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


class ConsumerReturnTests(QueueTestCase):
    def _make_return(self, *, delivered_days_ago: int):
        return ConsumerReturnRequest.objects.create(
            subscription=self.subscription,
            requested_by=self.customer_user,
            reason="Wrong colour delivered",
            delivery_date=date.today() - timedelta(days=delivered_days_ago),
        )

    def test_a_return_inside_the_window_can_be_approved(self):
        return_request = self._make_return(delivered_days_ago=2)

        response = self.client.post(
            reverse(
                "admin-consumer-return-action",
                kwargs={"request_id": return_request.pk, "action": "approve"},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return_request.refresh_from_db()
        self.assertEqual(return_request.status, ReturnRequestStatus.APPROVED)
        # clean() requires an approving officer on an approved return, so this
        # also proves the view is setting one rather than saving around it.
        self.assertEqual(return_request.approved_by, self.admin)

    def test_a_late_return_cannot_be_approved_without_an_override(self):
        """Approving late is allowed; doing it untraceably is not.

        The CPA lets a trader accept a late return. What must not happen is
        that acceptance leaving no record of who decided, because that is
        precisely what a consumer forum asks about.
        """
        return_request = self._make_return(delivered_days_ago=90)

        response = self.client.post(
            reverse(
                "admin-consumer-return-action",
                kwargs={"request_id": return_request.pk, "action": "approve"},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        return_request.refresh_from_db()
        self.assertNotEqual(return_request.status, ReturnRequestStatus.APPROVED)

    def test_an_override_is_attributable_and_then_approval_works(self):
        return_request = self._make_return(delivered_days_ago=90)

        override = self.client.post(
            reverse(
                "admin-consumer-return-cpa-override",
                kwargs={"request_id": return_request.pk},
            ),
            {"reason": "Goodwill: delivery was delayed by us."},
            format="json",
        )
        self.assertEqual(override.status_code, status.HTTP_200_OK)

        entry = AuditLog.objects.filter(
            action_type="CONSUMER_RETURN_CPA_OVERRIDE",
            object_id=str(return_request.pk),
        ).first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.performed_by, self.admin)
        # The override exists to acknowledge lateness, so the record must say
        # it was late rather than leaving that to be re-derived later.
        self.assertFalse(entry.metadata["was_within_window"])

        approved = self.client.post(
            reverse(
                "admin-consumer-return-action",
                kwargs={"request_id": return_request.pk, "action": "approve"},
            )
        )
        self.assertEqual(approved.status_code, status.HTTP_200_OK)

    def test_an_override_without_a_reason_is_refused(self):
        return_request = self._make_return(delivered_days_ago=90)

        response = self.client.post(
            reverse(
                "admin-consumer-return-cpa-override",
                kwargs={"request_id": return_request.pk},
            ),
            {"reason": "   "},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cpa_override_is_not_swallowed_by_the_generic_action_route(self):
        """Route ordering regression guard.

        `cpa-override` and `<str:action>` both match the same URL shape. If the
        generic route is ever registered first it wins, and the override
        becomes an "unknown action" 400 — with the page still showing a button
        that silently stops working.
        """
        return_request = self._make_return(delivered_days_ago=90)

        response = self.client.post(
            reverse(
                "admin-consumer-return-cpa-override",
                kwargs={"request_id": return_request.pk},
            ),
            {"reason": "Ordering check."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return_request.refresh_from_db()
        self.assertEqual(return_request.status, ReturnRequestStatus.CPA_OVERRIDE)

    def test_rejecting_requires_a_reason(self):
        return_request = self._make_return(delivered_days_ago=2)

        response = self.client.post(
            reverse(
                "admin-consumer-return-action",
                kwargs={"request_id": return_request.pk, "action": "reject"},
            ),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class DefectClaimTests(QueueTestCase):
    def setUp(self):
        super().setUp()
        self.claim = DefectClaim.objects.create(
            subscription=self.subscription,
            reported_by=self.customer_user,
            severity=DefectSeverity.MAJOR,
            description="Leg snapped under normal use",
        )

    def test_accepting_a_claim_records_who_and_when(self):
        response = self.client.post(
            reverse(
                "admin-consumer-defect-claim-action",
                kwargs={"claim_id": self.claim.pk, "action": "accept"},
            ),
            {"resolution_notes": "Replacement authorised."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.claim.refresh_from_db()
        self.assertEqual(self.claim.status, "ACCEPTED")
        self.assertEqual(self.claim.resolved_by, self.admin)
        self.assertIsNotNone(self.claim.resolved_at)

    def test_an_unknown_action_is_refused_with_the_allowed_list(self):
        response = self.client.post(
            reverse(
                "admin-consumer-defect-claim-action",
                kwargs={"claim_id": self.claim.pk, "action": "obliterate"},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("accept", response.data["allowed"])


class DrawAuthorisationTests(QueueTestCase):
    def setUp(self):
        super().setUp()
        self.authorisation = DrawAuthorisation.objects.create(
            batch=self.batch,
            draw_month=1,
            requested_by=self.admin,
        )

    def _act(self, action, payload=None, user=None):
        self.client.force_authenticate(user=user or self.other_admin)
        return self.client.post(
            reverse(
                "admin-lucky-draw-authorisation-action",
                kwargs={
                    "authorisation_id": self.authorisation.pk,
                    "action": action,
                },
            ),
            payload or {},
            format="json",
        )

    def test_a_second_person_can_authorise(self):
        response = self._act("authorise")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.authorisation.refresh_from_db()
        self.assertEqual(self.authorisation.status, DrawAuthorisationStatus.AUTHORISED)
        self.assertEqual(self.authorisation.authorised_by, self.other_admin)
        self.assertIsNotNone(self.authorisation.authorised_at)

    def test_the_requester_cannot_authorise_their_own_draw(self):
        """The whole purpose of this model.

        A draw is where the business gives money away. If one employee can
        both request and authorise it, the two-person control is decorative —
        and enforcing it only in the UI amounts to the same thing.
        """
        response = self._act("authorise", user=self.admin)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.authorisation.refresh_from_db()
        self.assertEqual(self.authorisation.status, DrawAuthorisationStatus.PENDING)
        self.assertIsNone(self.authorisation.authorised_by)

    def test_the_american_spelling_reaches_the_same_action(self):
        """The frontend is inconsistent about this; both must work."""
        response = self._act("authorize")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.authorisation.refresh_from_db()
        self.assertEqual(self.authorisation.status, DrawAuthorisationStatus.AUTHORISED)

    def test_an_already_authorised_draw_cannot_be_authorised_again(self):
        self._act("authorise")

        response = self._act("authorise")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_revoking_requires_a_reason(self):
        """Revocation is the most consequential action on this queue."""
        self._act("authorise")

        response = self._act("revoke", {})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.authorisation.refresh_from_db()
        self.assertEqual(self.authorisation.status, DrawAuthorisationStatus.AUTHORISED)

    def test_rejecting_requires_a_reason(self):
        response = self._act("reject", {})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_authorisation_is_audited_with_both_parties(self):
        self._act("authorise")

        entry = AuditLog.objects.filter(
            action_type="LUCKY_DRAW_AUTHORISATION_AUTHORISED",
            object_id=str(self.authorisation.pk),
        ).first()

        self.assertIsNotNone(entry)
        self.assertEqual(entry.performed_by, self.other_admin)
        self.assertEqual(entry.metadata["requested_by"], self.admin.id)

    def test_a_customer_cannot_authorise_a_draw(self):
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.post(
            reverse(
                "admin-lucky-draw-authorisation-action",
                kwargs={
                    "authorisation_id": self.authorisation.pk,
                    "action": "authorise",
                },
            )
        )

        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
