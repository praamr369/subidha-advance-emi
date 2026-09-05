"""Customer-facing DPDP 2023 privacy endpoints.

These existed as models and frontend pages from 2026-07-10/11 but were never
routed, so the whole customer privacy surface returned 404 in production until
2026-09-05. These tests cover the contract the portal calls.

The isolation tests matter most: an endpoint that leaked one customer's consent
record or grievance to another would be precisely the harm this module exists
to prevent.
"""
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from privacy.models import (
    ConsentStatus,
    ConsentType,
    CookieConsent,
    CustomerConsent,
    DataAccessRequest,
    DataRequestStatus,
    DPOGrievance,
    PrivacyPreference,
)
from tests.helpers import create_customer_profile, create_customer_user


class PrivacyApiTestCase(APITestCase):
    def setUp(self):
        self.user = create_customer_user(username="priv_user", phone="9000006001")
        self.customer = create_customer_profile(
            user=self.user, name="Priv Customer", phone="9000006001"
        )
        self.other_user = create_customer_user(username="priv_other", phone="9000006002")
        self.other_customer = create_customer_profile(
            user=self.other_user, name="Other Customer", phone="9000006002"
        )
        self.client.force_authenticate(user=self.user)


class ConsentTests(PrivacyApiTestCase):
    def test_grant_creates_an_active_consent(self):
        response = self.client.post(
            reverse("privacy-consent-grant"),
            {"consent_type": ConsentType.MARKETING, "purpose_text": "Offers"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["is_active"])
        consent = CustomerConsent.objects.get(customer=self.customer)
        self.assertEqual(consent.status, ConsentStatus.GIVEN)
        self.assertEqual(consent.given_via, "CUSTOMER_PORTAL")

    def test_regranting_updates_the_single_row_the_schema_allows(self):
        """CustomerConsent is unique_together (customer, consent_type).

        The schema stores only the current decision, so re-granting updates one
        row rather than appending. Pinned here because it is a compliance-
        relevant limitation, not a preference: DPDP normally expects consent
        history to be provable, and that would need an append-only event table.
        """
        url = reverse("privacy-consent-grant")
        self.client.post(url, {"consent_type": ConsentType.EMAIL}, format="json")
        self.client.post(url, {"consent_type": ConsentType.EMAIL}, format="json")

        rows = CustomerConsent.objects.filter(
            customer=self.customer, consent_type=ConsentType.EMAIL
        )
        self.assertEqual(rows.count(), 1)
        self.assertEqual(rows.first().status, ConsentStatus.GIVEN)

    def test_regranting_after_withdrawal_clears_the_withdrawal(self):
        url = reverse("privacy-consent-grant")
        self.client.post(url, {"consent_type": ConsentType.EMAIL}, format="json")
        self.client.post(
            reverse("privacy-consent-withdraw"),
            {"consent_type": ConsentType.EMAIL},
            format="json",
        )

        self.client.post(url, {"consent_type": ConsentType.EMAIL}, format="json")

        consent = CustomerConsent.objects.get(
            customer=self.customer, consent_type=ConsentType.EMAIL
        )
        self.assertEqual(consent.status, ConsentStatus.GIVEN)
        self.assertIsNone(consent.withdrawn_at)

    def test_withdraw_by_type(self):
        self.client.post(
            reverse("privacy-consent-grant"),
            {"consent_type": ConsentType.SMS},
            format="json",
        )

        response = self.client.post(
            reverse("privacy-consent-withdraw"),
            {"consent_type": ConsentType.SMS},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["withdrawn"], 1)
        self.assertFalse(
            CustomerConsent.objects.filter(
                customer=self.customer, status=ConsentStatus.GIVEN
            ).exists()
        )

    def test_withdrawing_something_never_granted_is_not_an_error(self):
        """The customer asked for an end state; they are already in it."""
        response = self.client.post(
            reverse("privacy-consent-withdraw"),
            {"consent_type": ConsentType.PROFILING},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["withdrawn"], 0)

    def test_withdraw_by_id_rejects_another_customers_consent(self):
        theirs = CustomerConsent.objects.create(
            customer=self.other_customer,
            consent_type=ConsentType.MARKETING,
            status=ConsentStatus.GIVEN,
            purpose_text="theirs",
        )

        response = self.client.post(
            reverse("privacy-consent-withdraw-by-id", args=[theirs.id])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        theirs.refresh_from_db()
        self.assertEqual(theirs.status, ConsentStatus.GIVEN)

    def test_list_returns_only_my_consents(self):
        CustomerConsent.objects.create(
            customer=self.other_customer,
            consent_type=ConsentType.MARKETING,
            status=ConsentStatus.GIVEN,
            purpose_text="theirs",
        )
        self.client.post(
            reverse("privacy-consent-grant"),
            {"consent_type": ConsentType.ANALYTICS},
            format="json",
        )

        response = self.client.get(reverse("privacy-consents"))

        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["consent_type"], ConsentType.ANALYTICS)

    def test_invalid_consent_type_is_rejected(self):
        response = self.client.post(
            reverse("privacy-consent-grant"),
            {"consent_type": "NOT_A_REAL_TYPE"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class CookieConsentTests(PrivacyApiTestCase):
    def test_defaults_to_essential_only_when_nothing_stored(self):
        """No stored preference must not imply agreement."""
        response = self.client.get(reverse("privacy-cookie-consent"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["essential_allowed"])
        self.assertFalse(response.data["analytics_allowed"])
        self.assertFalse(response.data["marketing_allowed"])
        self.assertFalse(response.data["third_party_allowed"])

    def test_saving_preferences_records_them(self):
        response = self.client.post(
            reverse("privacy-cookie-consent"),
            {"analytics_allowed": True, "marketing_allowed": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["analytics_allowed"])
        self.assertFalse(response.data["marketing_allowed"])

    def test_essential_cannot_be_switched_off(self):
        """Essential cookies are not consent-based; a toggle would be a lie."""
        self.client.post(
            reverse("privacy-cookie-consent"),
            {"essential_allowed": False, "analytics_allowed": False},
            format="json",
        )

        record = CookieConsent.objects.get(customer=self.customer)
        self.assertTrue(record.essential_allowed)

    def test_changing_preferences_updates_the_session_row(self):
        """CookieConsent.session_id is unique, so a session has one row.

        Two customers with no session key must not collide on an empty string,
        which is why the view falls back to a per-customer identifier.
        """
        url = reverse("privacy-cookie-consent")
        self.client.post(url, {"analytics_allowed": True}, format="json")
        self.client.post(url, {"analytics_allowed": False}, format="json")

        response = self.client.get(url)

        self.assertFalse(response.data["analytics_allowed"])
        self.assertEqual(CookieConsent.objects.filter(customer=self.customer).count(), 1)

    def test_two_customers_without_sessions_do_not_collide(self):
        url = reverse("privacy-cookie-consent")
        self.client.post(url, {"analytics_allowed": True}, format="json")

        self.client.force_authenticate(user=self.other_user)
        response = self.client.post(url, {"analytics_allowed": False}, format="json")

        self.assertIn(
            response.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED)
        )
        self.assertEqual(CookieConsent.objects.count(), 2)


class DataAccessRequestTests(PrivacyApiTestCase):
    def test_request_starts_the_statutory_clock(self):
        response = self.client.post(
            reverse("privacy-data-access-request"),
            {"request_type": "INFORMATION", "description": "Send me my data"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        record = DataAccessRequest.objects.get(customer=self.customer)
        self.assertEqual(record.status, DataRequestStatus.RECEIVED)
        self.assertEqual((record.due_date - record.requested_at).days, 30)

    def test_export_records_a_request_rather_than_claiming_to_deliver(self):
        response = self.client.post(
            reverse("privacy-data-export"), {"format": "JSON"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(DataAccessRequest.objects.filter(customer=self.customer).count(), 1)

    def test_list_excludes_other_customers_requests(self):
        DataAccessRequest.objects.create(
            customer=self.other_customer,
            request_type="INFORMATION",
            description="theirs",
            status=DataRequestStatus.RECEIVED,
            due_date="2027-01-01T00:00:00Z",
        )

        response = self.client.get(reverse("privacy-data-access-request"))

        self.assertEqual(len(response.data), 0)


class GrievanceTests(PrivacyApiTestCase):
    def test_filing_sets_both_statutory_stages(self):
        response = self.client.post(
            reverse("privacy-grievance"),
            {
                "grievance_type": "PRIVACY_VIOLATION",
                "title": "Unwanted marketing",
                "description": "Still receiving SMS after withdrawal.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        record = DPOGrievance.objects.get(customer=self.customer)
        self.assertEqual((record.stage_1_due - record.filed_at).days, 30)
        self.assertEqual((record.stage_2_due - record.stage_1_due).days, 14)

    def test_list_excludes_other_customers_grievances(self):
        DPOGrievance.objects.create(
            customer=self.other_customer,
            grievance_type="OTHER",
            title="theirs",
            description="theirs",
            stage_1_due="2027-01-01T00:00:00Z",
            stage_2_due="2027-01-15T00:00:00Z",
        )

        response = self.client.get(reverse("privacy-grievance"))

        self.assertEqual(len(response.data), 0)


class CommunicationPreferenceTests(PrivacyApiTestCase):
    def test_get_creates_defaults_on_first_read(self):
        response = self.client.get(reverse("privacy-communication-preferences"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("email_marketing", response.data)
        self.assertTrue(PrivacyPreference.objects.filter(customer=self.customer).exists())

    def test_partial_update_changes_only_what_was_sent(self):
        self.client.get(reverse("privacy-communication-preferences"))
        prefs = PrivacyPreference.objects.get(customer=self.customer)
        prefs.sms_marketing = True
        prefs.save()

        response = self.client.patch(
            reverse("privacy-communication-preferences"),
            {"email_marketing": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        prefs.refresh_from_db()
        self.assertFalse(prefs.email_marketing)
        self.assertTrue(prefs.sms_marketing)

    def test_post_is_accepted_as_an_update(self):
        """The portal sends POST; its verb choice must not be a 405."""
        response = self.client.post(
            reverse("privacy-communication-preferences"),
            {"email_marketing": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)


class DashboardAndAuditTests(PrivacyApiTestCase):
    def test_dashboard_counts_this_customer_only(self):
        self.client.post(
            reverse("privacy-consent-grant"),
            {"consent_type": ConsentType.MARKETING},
            format="json",
        )
        CustomerConsent.objects.create(
            customer=self.other_customer,
            consent_type=ConsentType.MARKETING,
            status=ConsentStatus.GIVEN,
            purpose_text="theirs",
        )

        response = self.client.get(reverse("privacy-dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["active_consents"], 1)

    def test_audit_log_is_paginated_and_scoped(self):
        response = self.client.get(reverse("privacy-audit-log"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])


class AuthenticationTests(APITestCase):
    def test_anonymous_access_is_refused(self):
        for name in (
            "privacy-consents",
            "privacy-dashboard-summary",
            "privacy-audit-log",
            "privacy-grievance",
        ):
            with self.subTest(endpoint=name):
                response = self.client.get(reverse(name))
                self.assertIn(
                    response.status_code,
                    (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
                )

    def test_user_without_a_customer_profile_gets_404_not_a_crash(self):
        from tests.helpers import create_admin_user

        staff = create_admin_user(username="priv_admin", phone="9000006009")
        self.client.force_authenticate(user=staff)

        response = self.client.get(reverse("privacy-consents"))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
