"""Server-Sent Events (SSE) channel for the notification bell and admin badges.

Design notes:
- The browser EventSource API cannot send an Authorization header, and the
  frontend keeps its JWT in localStorage. Putting the JWT in a query string
  would leak it into access logs, so the stream authenticates with a
  short-lived single-use ticket instead: the client POSTs /realtime/ticket/
  (normal JWT auth), receives an opaque random ticket, and opens the stream
  with ?ticket=... . The ticket is consumed on first use and expires in 90s.
- Each stream lives for a bounded window (~50s) and then closes cleanly; the
  client re-tickets and reconnects. This keeps worker occupancy bounded on
  plain WSGI deployments (gunicorn) without requiring ASGI/channels.
- Events are only emitted when the payload changes; a comment heartbeat keeps
  proxies from buffering/closing the connection.
"""

from __future__ import annotations

import json
import secrets
import time

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.http import HttpResponseForbidden, StreamingHttpResponse
from django.views.decorators.cache import never_cache
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from system_jobs.models import Notification

TICKET_TTL_SECONDS = 90
STREAM_LIFETIME_SECONDS = 50
POLL_INTERVAL_SECONDS = 4.0

_TICKET_CACHE_PREFIX = "sse_ticket:"


class RealtimeTicketView(APIView):
    """Issue a short-lived single-use ticket for the SSE stream."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        ticket = secrets.token_urlsafe(32)
        cache.set(
            f"{_TICKET_CACHE_PREFIX}{ticket}",
            {"user_id": request.user.id},
            TICKET_TTL_SECONDS,
        )
        return Response(
            {
                "ticket": ticket,
                "expires_in": TICKET_TTL_SECONDS,
                "stream_path": "/api/v1/realtime/stream/",
                "stream_lifetime_seconds": STREAM_LIFETIME_SECONDS,
            }
        )


def _unread_count(user_id: int) -> int:
    return Notification.objects.filter(recipient_id=user_id, read_at__isnull=True).count()


def _sse_event(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"


def _stream_body(user_id: int, is_admin: bool):
    from api.v1.views.admin_navigation import build_admin_navigation_badges

    deadline = time.monotonic() + STREAM_LIFETIME_SECONDS
    last_notifications: str | None = None
    last_badges: str | None = None

    # Tell EventSource to wait ~2s before auto-reconnecting after we close.
    yield "retry: 2000\n\n"

    while True:
        payload = {"unread_count": _unread_count(user_id)}
        serialized = json.dumps(payload, sort_keys=True)
        if serialized != last_notifications:
            last_notifications = serialized
            yield _sse_event("notifications", payload)

        if is_admin:
            badges = build_admin_navigation_badges(user=user_id)
            serialized_badges = json.dumps(badges, sort_keys=True)
            if serialized_badges != last_badges:
                last_badges = serialized_badges
                yield _sse_event("badges", badges)

        if time.monotonic() >= deadline:
            # Bounded stream: close cleanly, the client reconnects with a
            # fresh ticket. Keeps WSGI worker occupancy predictable.
            yield _sse_event("end", {"reconnect": True})
            return

        yield ": ping\n\n"
        time.sleep(POLL_INTERVAL_SECONDS)


@never_cache
def realtime_stream(request):
    ticket = (request.GET.get("ticket") or "").strip()
    if not ticket:
        return HttpResponseForbidden("Missing stream ticket.")

    cache_key = f"{_TICKET_CACHE_PREFIX}{ticket}"
    entry = cache.get(cache_key)
    if not entry:
        return HttpResponseForbidden("Invalid or expired stream ticket.")
    cache.delete(cache_key)  # single use

    User = get_user_model()
    user = User.objects.filter(pk=entry.get("user_id"), is_active=True).first()
    if user is None:
        return HttpResponseForbidden("Stream user is not active.")

    is_admin = (getattr(user, "role", "") or "").upper() == "ADMIN"
    response = StreamingHttpResponse(
        _stream_body(user.id, is_admin),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"  # disable nginx proxy buffering
    return response
