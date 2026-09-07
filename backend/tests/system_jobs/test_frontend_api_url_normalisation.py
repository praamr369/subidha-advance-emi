"""Regression tests for the frontend/backend URL reconciliation tool.

This tool is the instrument the whole API-gap programme is measured with, and
it has now been wrong four times: it ignored four fifths of the frontend,
mangled every DRF-router route, invented endpoints from prose in JSX, and — in
the change these tests accompany — truncated every parameterised route and cut
the backend count by a thousand.

Every bug had the same signature: a number that moved for a reason nobody
checked. So each case below pins a specific past failure. A measurement is not
evidence until something has tried to falsify it.
"""
from django.test import SimpleTestCase

from system_jobs.management.commands.check_frontend_api_urls import (
    _matches,
    _normalise,
)


class NormaliseTests(SimpleTestCase):
    def test_a_parameterised_route_survives_normalisation(self):
        """The bug introduced while fixing the prose bug.

        _PATH_CONVERTER rewrites "<int:pk>" to the literal "{}", so a check for
        a bare "{" matched the placeholder itself and truncated the path there.
        Backend routes fell from 2,659 to 1,587 and the unmatched count moved
        for an entirely bogus reason.
        """
        self.assertEqual(
            _normalise("/api/v1/admin/crm/disputes/<int:dispute_id>/notify/"),
            "/api/v1/admin/crm/disputes/{}/notify/",
        )

    def test_a_drf_router_regex_route_is_not_cut_at_the_question_mark(self):
        """re_path patterns contain a literal "?" inside named groups."""
        self.assertEqual(
            _normalise(r"^/api/v1/payments/(?P<pk>[^/.]+)/$"),
            "/api/v1/payments/{}/",
        )

    def test_a_url_written_in_prose_loses_its_full_stop(self):
        """Real source: 'Uploads use POST /api/v1/admin/hr/staff-documents/.'

        The trailing period is sentence punctuation. Captured as part of the
        path it produced a URL matching nothing, which the tool then reported
        as a missing endpoint that had never been missing.
        """
        self.assertEqual(
            _normalise("/api/v1/admin/hr/staff-documents/."),
            "/api/v1/admin/hr/staff-documents/",
        )

    def test_an_unclosed_template_expression_becomes_one_dynamic_segment(self):
        """Real source: apiFetch(`/admin/support/tickets/${qs(params)}`).

        The capture stops inside the interpolation because of the nested
        parentheses, leaving ".../tickets/{qs(params". Everything from the
        brace on is interpolated, so it is one dynamic segment — keeping the
        fragment made a working endpoint look absent.
        """
        self.assertEqual(
            _normalise("/api/v1/admin/support/tickets/{qs(params"),
            "/api/v1/admin/support/tickets/{}/",
        )

    def test_a_template_expression_spanning_a_segment_collapses(self):
        self.assertEqual(
            _normalise("/api/v1/warranty/check/${productId}/"),
            "/api/v1/warranty/check/{}/",
        )

    def test_a_trailing_query_string_variable_is_not_a_path_segment(self):
        """Real sources, and 11 of the reported gaps were this.

            `/admin/growth/customers/${id}/offer-candidates/${qs}`   qs="?a=b"
            `/admin/customers/${id}/timeline/${suffix}`          suffix="?x=1"

        Template expressions are collapsed before the "?" split, so the query
        string became a phantom trailing segment and endpoints that exist and
        work were reported missing.
        """
        self.assertEqual(
            _normalise("/api/v1/admin/customers/${customerId}/timeline/${suffix}"),
            "/api/v1/admin/customers/{}/timeline/",
        )
        self.assertEqual(
            _normalise("/api/v1/admin/vendor-purchase-returns/${suffix}"),
            "/api/v1/admin/vendor-purchase-returns/",
        )

    def test_a_trailing_id_variable_is_still_a_path_segment(self):
        """The other half of that trade, and why the name list stays short.

        `${id}` in tail position is a real path parameter. The two idioms are
        indistinguishable without the variable's value, so only names that
        conventionally hold a query string are stripped. Widening this list
        would start hiding genuinely missing detail endpoints.
        """
        self.assertEqual(
            _normalise("/api/v1/admin/customers/${customerId}"),
            "/api/v1/admin/customers/{}/",
        )


class MatchesTests(SimpleTestCase):
    ROUTES = {
        "/api/v1/admin/customers/{}/timeline/{}/{}/",
        "/api/v1/admin/warranty-claims/{}/approve/",
    }

    def test_a_literal_written_where_a_route_declares_a_parameter_matches(self):
        """The case generalisation exists for: '.../timeline/Customer/${id}/'."""
        self.assertTrue(
            _matches("/api/v1/admin/customers/{}/timeline/Customer/{}/", self.ROUTES)
        )

    def test_a_runtime_chosen_action_segment_matches_a_parent_with_actions(self):
        """Real source: apiFetch(`/admin/payments/reversals/${id}/${action}/`).

        The action is a variable, so it can never match a literal route however
        the segments are generalised — yet .../{}/approve/ and .../{}/reject/
        both exist. Three endpoints were reported missing for this reason.
        """
        routes = {
            "/api/v1/admin/payments/reversals/{}/approve/",
            "/api/v1/admin/payments/reversals/{}/reject/",
        }
        self.assertTrue(_matches("/api/v1/admin/payments/reversals/{}/{}/", routes))

    def test_a_trailing_variable_does_not_match_a_parent_with_no_actions(self):
        """The bound on the rule above, and the reason it is not just
        "anything ending in a variable matches".

        If nothing is registered beneath the prefix, the call really does go
        nowhere and must still be reported.
        """
        routes = {"/api/v1/admin/payments/reversals/"}
        self.assertFalse(_matches("/api/v1/admin/payments/reversals/{}/{}/", routes))
        self.assertFalse(_matches("/api/v1/admin/no-such-thing/{}/{}/", routes))

    def test_generalisation_does_not_invent_a_match_for_an_absent_resource(self):
        """The risk generalisation carries, pinned so it stays bounded.

        Relaxing one segment at a time must not let an entirely unrelated
        resource name match some other route that happens to take a parameter
        in that position — that would report a missing endpoint as present and
        hide exactly what this tool exists to find.
        """
        self.assertFalse(_matches("/api/v1/admin/totally-made-up/", self.ROUTES))
        self.assertFalse(_matches("/api/v1/admin/nonexistent/{}/", self.ROUTES))
