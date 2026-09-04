"""Public lead submission must be rate-limited.

PublicLeadView is the only unauthenticated endpoint that writes. Before this it
carried no throttle_classes and inherited the global anon rate of 120/minute —
7,200 submissions per hour per IP, enough to bury the CRM pipeline in junk
faster than anyone could triage it.
"""
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from rest_framework import status

from api.v1.throttles.public import PublicLeadThrottle
from crm.models import PublicLead


class PublicLeadThrottleTests(TestCase):
    def setUp(self):
        # DRF throttling counts through the cache; a leftover count from another
        # test would make these pass or fail for the wrong reason.
        cache.clear()
        self.url = reverse("public-leads")

    def tearDown(self):
        cache.clear()

    def _payload(self, index):
        return {
            "name": f"Lead {index}",
            "phone": f"98765432{index:02d}",
            "message": "Interested in a sofa set.",
        }

    def _submit(self, index):
        return self.client.post(self.url, self._payload(index), format="json")

    def test_view_declares_the_scoped_throttle(self):
        """Pins the wiring itself.

        The behavioural test below overrides the rate, so it would still pass
        if the view silently fell back to the global anon throttle.
        """
        from api.v1.routes.public import PublicLeadView

        self.assertIn(PublicLeadThrottle, PublicLeadView.throttle_classes)

    def _allowed_per_hour(self):
        from django.conf import settings

        rate = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["public_lead"]
        return int(rate.split("/")[0])

    def test_submissions_are_blocked_once_the_rate_is_exceeded(self):
        """Exercises the real configured rate.

        override_settings on REST_FRAMEWORK is not used here: DRF resolves
        throttle rates through its own cached api_settings, so an override can
        silently fail to apply and leave this passing against the wrong limit.
        """
        allowed = self._allowed_per_hour()

        for index in range(allowed):
            response = self._submit(index)
            self.assertIn(
                response.status_code,
                (status.HTTP_200_OK, status.HTTP_201_CREATED),
                f"submission {index} should have been accepted: {response.data}",
            )

        blocked = self._submit(allowed)

        self.assertEqual(
            blocked.status_code,
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"submission {allowed + 1} should have been throttled at {allowed}/hour",
        )

    def test_a_throttled_request_does_not_create_a_lead(self):
        """A 429 must reject the write, not merely warn about it."""
        allowed = self._allowed_per_hour()
        for index in range(allowed):
            self._submit(index)
        count_before = PublicLead.objects.count()

        self._submit(allowed)

        self.assertEqual(PublicLead.objects.count(), count_before)

    def test_configured_production_rate_is_restrictive(self):
        """Guards the setting itself against being loosened by accident."""
        from django.conf import settings

        rate = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["public_lead"]
        count, period = rate.split("/")

        self.assertEqual(period, "hour")
        self.assertLessEqual(
            int(count), 60, "public lead submission should stay well under the anon rate"
        )
