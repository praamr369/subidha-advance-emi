from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin, IsCashier, IsCustomer, IsPartner, IsVendor
from api.v1.serializers.notifications import NotificationSerializer
from system_jobs.models import Notification


class AdminNotificationListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        module = (request.query_params.get("module") or "").strip()
        qs = Notification.objects.filter(recipient=request.user).order_by("-created_at", "-id")
        if module:
            qs = qs.filter(module=module)
        unread = qs.filter(read_at__isnull=True).count()
        limit = min(int(request.query_params.get("limit") or 50), 200)
        rows = list(qs[:limit])
        return Response(
            {
                "count": len(rows),
                "unread_count": unread,
                "results": NotificationSerializer(rows, many=True).data,
            }
        )


class AdminUnreadNotificationCountView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = Notification.objects.filter(recipient=request.user, read_at__isnull=True)
        module = (request.query_params.get("module") or "").strip()
        if module:
            qs = qs.filter(module=module)
        return Response({"unread_count": qs.count()})


class AdminNotificationMarkReadView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        notif = Notification.objects.filter(pk=pk).first()
        if notif is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if notif.recipient_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        notif.mark_read()
        return Response(NotificationSerializer(notif).data)


class CashierNotificationListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCashier]

    def get(self, request):
        module = (request.query_params.get("module") or "").strip()
        qs = Notification.objects.filter(recipient=request.user).order_by("-created_at", "-id")
        if module:
            qs = qs.filter(module=module)
        unread = qs.filter(read_at__isnull=True).count()
        limit = min(int(request.query_params.get("limit") or 50), 200)
        rows = list(qs[:limit])
        return Response(
            {
                "count": len(rows),
                "unread_count": unread,
                "results": NotificationSerializer(rows, many=True).data,
            }
        )


class CashierUnreadNotificationCountView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCashier]

    def get(self, request):
        qs = Notification.objects.filter(recipient=request.user, read_at__isnull=True)
        module = (request.query_params.get("module") or "").strip()
        if module:
            qs = qs.filter(module=module)
        return Response({"unread_count": qs.count()})


class CashierNotificationMarkReadView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCashier]

    def post(self, request, pk: int):
        notif = Notification.objects.filter(pk=pk, recipient=request.user).first()
        if notif is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        notif.mark_read()
        return Response(NotificationSerializer(notif).data)


def _safe_int(value, default: int, *, max_value: int) -> int:
    try:
        parsed = int(str(value))
    except (TypeError, ValueError):
        return default
    if parsed <= 0:
        return default
    return min(parsed, max_value)


class NotificationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        module = (request.query_params.get("module") or "").strip()
        category = (request.query_params.get("category") or "").strip().upper()
        severity = (request.query_params.get("severity") or "").strip().upper()
        unread_only = str(request.query_params.get("unread") or "").strip().lower() in {
            "1",
            "true",
            "yes",
        }

        qs = Notification.objects.filter(recipient=request.user).order_by("-created_at", "-id")
        if module:
            qs = qs.filter(module=module)
        if unread_only:
            qs = qs.filter(read_at__isnull=True)

        if category:
            qs = qs.filter(payload__category__iexact=category)
        if severity:
            qs = qs.filter(payload__severity__iexact=severity)

        unread_count = Notification.objects.filter(
            recipient=request.user,
            read_at__isnull=True,
        ).count()
        limit = _safe_int(request.query_params.get("limit"), 50, max_value=200)
        rows = list(qs[:limit])
        return Response(
            {
                "count": len(rows),
                "unread_count": unread_count,
                "results": NotificationSerializer(rows, many=True).data,
            }
        )


class NotificationMarkReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        notif = Notification.objects.filter(pk=pk, recipient=request.user).first()
        if notif is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        notif.mark_read()
        return Response(NotificationSerializer(notif).data)


class NotificationMarkAllReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        unread_qs = Notification.objects.filter(
            recipient=request.user,
            read_at__isnull=True,
        ).order_by("-created_at", "-id")
        rows = list(unread_qs[:500])
        for row in rows:
            row.mark_read()
        return Response({"updated_count": len(rows)}, status=status.HTTP_200_OK)


class NotificationSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Notification.objects.filter(recipient=request.user).order_by("-created_at", "-id")
        unread_count = qs.filter(read_at__isnull=True).count()
        high_priority_count = qs.filter(
            read_at__isnull=True,
            payload__severity__in=["HIGH", "CRITICAL"],
        ).count()
        latest = list(qs[:5])
        return Response(
            {
                "unread_count": unread_count,
                "high_priority_count": high_priority_count,
                "latest": NotificationSerializer(latest, many=True).data,
            }
        )


class CustomerNotificationListView(NotificationListView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]


class CustomerNotificationSummaryView(NotificationSummaryView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]


class PartnerNotificationListView(NotificationListView):
    permission_classes = [permissions.IsAuthenticated, IsPartner]


class PartnerNotificationSummaryView(NotificationSummaryView):
    permission_classes = [permissions.IsAuthenticated, IsPartner]


class VendorNotificationListView(NotificationListView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]


class VendorNotificationSummaryView(NotificationSummaryView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]
