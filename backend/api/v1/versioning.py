"""API versioning for the /api/<version>/ surface.

Every endpoint is mounted under a literal path prefix (``api/v1/``) rather than
a captured ``<version>`` URL parameter, so DRF's stock ``URLPathVersioning``
cannot read the version from ``kwargs`` — it would fall through to the default
for every request, which tells you nothing.

It also overrides ``reverse()`` to inject a ``version`` kwarg. None of the URL
patterns here accept one, so those reversals raise ``NoReverseMatch``. That
matters in one concrete place: ``DefaultRouter``'s api-root view reverses every
registered route and *silently skips* the ones that fail, so the root listings
would quietly turn up empty. A versioning scheme that degrades other endpoints
is worse than none.

This class reads the version from the path that is already there and leaves
``reverse()`` alone.
"""
from __future__ import annotations

import re

from rest_framework import exceptions
from rest_framework.versioning import BaseVersioning

# Matches the version segment of "/api/v1/...", tolerating an optional
# script-name prefix so it keeps working under a mounted sub-path.
_VERSION_IN_PATH = re.compile(r"/api/(?P<version>v[0-9]+)(?:/|$)")


class PathPrefixVersioning(BaseVersioning):
    """Resolve the API version from the ``/api/<version>/`` path prefix.

    Populates ``request.version`` so views, serializers and the schema can
    branch on it, and rejects a version outside ``ALLOWED_VERSIONS`` with 404
    rather than serving it as though it existed.
    """

    invalid_version_in_url_message = "Unsupported API version."

    def determine_version(self, request, *args, **kwargs):
        match = _VERSION_IN_PATH.search(request.path_info or "")
        version = match.group("version") if match else self.default_version

        if version is None:
            return None

        if not self.is_allowed_version(version):
            raise exceptions.NotFound(self.invalid_version_in_url_message)

        return version
