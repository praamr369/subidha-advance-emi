"""API versioning resolution and endpoint deprecation headers."""
from datetime import date

from django.test import RequestFactory, TestCase
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory
from rest_framework.views import APIView

from api.v1.deprecation import apply_deprecation_headers, deprecate_endpoint
from api.v1.versioning import PathPrefixVersioning


class PathPrefixVersioningTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.versioning = PathPrefixVersioning()
        self.versioning.default_version = "v1"
        self.versioning.allowed_versions = ["v1"]

    def _version_for(self, path):
        return self.versioning.determine_version(self.factory.get(path))

    def test_reads_version_from_the_path_prefix(self):
        self.assertEqual(self._version_for("/api/v1/admin/customers/"), "v1")

    def test_bare_version_root_resolves(self):
        self.assertEqual(self._version_for("/api/v1/"), "v1")

    def test_unknown_version_is_404_not_silently_served(self):
        self.versioning.allowed_versions = ["v1"]
        with self.assertRaises(NotFound):
            self._version_for("/api/v9/admin/customers/")

    def test_allowed_second_version_resolves_independently(self):
        self.versioning.allowed_versions = ["v1", "v2"]
        self.assertEqual(self._version_for("/api/v2/admin/emis/"), "v2")

    def test_non_api_path_falls_back_to_default(self):
        self.assertEqual(self._version_for("/health/"), "v1")

    def test_does_not_override_reverse(self):
        """The reason this class exists instead of URLPathVersioning.

        URLPathVersioning.reverse injects a `version` kwarg that none of our URL
        patterns accept, and DefaultRouter's api-root swallows the resulting
        NoReverseMatch — so root listings would quietly go empty.
        """
        from rest_framework.versioning import BaseVersioning

        self.assertIs(PathPrefixVersioning.reverse, BaseVersioning.reverse)


class _DeprecatedView(APIView):
    permission_classes = []
    authentication_classes = []

    def get(self, request):
        return Response({"ok": True})


_DeprecatedView = deprecate_endpoint(
    sunset="2027-03-01",
    successor="/api/v2/admin/emis/",
    note="Replaced by the paginated v2 collection.",
    deprecated_since="2026-09-04",
)(_DeprecatedView)


class DeprecationHeaderTests(TestCase):
    def test_decorated_view_still_serves_its_payload(self):
        request = APIRequestFactory().get("/api/v1/legacy/")
        response = _DeprecatedView.as_view()(request)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"ok": True})

    def test_decorated_view_sets_the_standard_headers(self):
        request = APIRequestFactory().get("/api/v1/legacy/")
        response = _DeprecatedView.as_view()(request)

        self.assertEqual(response["Deprecation"], "Fri, 04 Sep 2026 00:00:00 GMT")
        self.assertEqual(response["Sunset"], "Mon, 01 Mar 2027 00:00:00 GMT")
        self.assertIn('rel="successor-version"', response["Link"])
        self.assertIn("/api/v2/admin/emis/", response["Link"])
        self.assertIn("299", response["Warning"])

    def test_deprecation_defaults_to_the_bare_token(self):
        response = apply_deprecation_headers(Response({}))
        self.assertEqual(response["Deprecation"], "true")
        self.assertNotIn("Sunset", response)

    def test_accepts_a_date_object(self):
        response = apply_deprecation_headers(Response({}), sunset=date(2027, 3, 1))
        self.assertEqual(response["Sunset"], "Mon, 01 Mar 2027 00:00:00 GMT")

    def test_existing_link_header_is_preserved(self):
        response = Response({})
        response["Link"] = '<https://example.test/page/2>; rel="next"'

        apply_deprecation_headers(response, successor="/api/v2/x/")

        self.assertIn('rel="next"', response["Link"])
        self.assertIn('rel="successor-version"', response["Link"])
