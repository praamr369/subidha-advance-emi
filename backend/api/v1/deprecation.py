"""Graceful endpoint deprecation.

The versioning class tells a caller *which* version they reached. This tells
them an endpoint is going away, when, and what to use instead — the part that
actually lets a breaking change ship without silently breaking a consumer.

Uses the standard HTTP fields so generic clients and proxies understand them
without bespoke parsing:

* ``Deprecation``  (RFC 9745) — an IMF-fixdate, or the bare token ``true``.
* ``Sunset``       (RFC 8594) — the IMF-fixdate after which the endpoint may
  stop responding at all.
* ``Link``         (RFC 8288) — ``rel="successor-version"`` pointing at the
  replacement, and ``rel="deprecation"`` pointing at the notes.

Usage on a DRF view::

    @deprecate_endpoint(
        sunset="2027-03-01",
        successor="/api/v2/admin/emis/",
        note="Replaced by the paginated v2 collection.",
    )
    class AdminEmiListView(generics.ListAPIView):
        ...

The decorator only adds response headers. It never changes status codes or
payloads, so applying it cannot break an existing caller — which is the point:
the warning ships first, the removal comes later.

To mark the same endpoint deprecated in the OpenAPI document, pair it with
drf-spectacular's own decorator — there is no way to infer it from the view::

    @extend_schema(deprecated=True)
    @deprecate_endpoint(sunset="2027-03-01", successor="/api/v2/admin/emis/")
    class AdminEmiListView(generics.ListAPIView):
        ...
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from functools import wraps

from django.utils.http import http_date

_DEPRECATION_NOTES_URL = "https://srv1391250.hstgr.cloud/docs/api-deprecations"


def _as_http_date(value: str | date | datetime) -> str:
    """Render a date as an IMF-fixdate, which is what both RFCs require."""
    if isinstance(value, str):
        value = date.fromisoformat(value)
    if isinstance(value, datetime):
        moment = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    else:
        moment = datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    return http_date(moment.timestamp())


def apply_deprecation_headers(
    response,
    *,
    sunset: str | date | datetime | None = None,
    successor: str | None = None,
    note: str | None = None,
    deprecated_since: str | date | datetime | None = None,
):
    """Attach the deprecation headers to an already-built response."""
    response["Deprecation"] = (
        _as_http_date(deprecated_since) if deprecated_since else "true"
    )

    if sunset is not None:
        response["Sunset"] = _as_http_date(sunset)

    links = []
    if successor:
        links.append(f'<{successor}>; rel="successor-version"')
    links.append(f'<{_DEPRECATION_NOTES_URL}>; rel="deprecation"')

    existing = response.get("Link")
    response["Link"] = f"{existing}, {', '.join(links)}" if existing else ", ".join(links)

    if note:
        # Warning code 299 is the registered "miscellaneous persistent warning".
        response["Warning"] = f'299 - "{note}"'

    return response


def deprecate_endpoint(
    *,
    sunset: str | date | datetime | None = None,
    successor: str | None = None,
    note: str | None = None,
    deprecated_since: str | date | datetime | None = None,
):
    """Mark a DRF view (class or function) as deprecated.

    Wraps ``dispatch`` for a class-based view, or the function itself for a
    function-based one, and stamps the headers on whatever comes back.
    """

    def decorate(view):
        if isinstance(view, type):
            original_dispatch = view.dispatch

            @wraps(original_dispatch)
            def dispatch(self, request, *args, **kwargs):
                response = original_dispatch(self, request, *args, **kwargs)
                return apply_deprecation_headers(
                    response,
                    sunset=sunset,
                    successor=successor,
                    note=note,
                    deprecated_since=deprecated_since,
                )

            view.dispatch = dispatch
            # Read by the OpenAPI hook below so the schema marks it too.
            view._api_deprecated = True
            return view

        @wraps(view)
        def wrapper(*args, **kwargs):
            response = view(*args, **kwargs)
            return apply_deprecation_headers(
                response,
                sunset=sunset,
                successor=successor,
                note=note,
                deprecated_since=deprecated_since,
            )

        wrapper._api_deprecated = True
        return wrapper

    return decorate
