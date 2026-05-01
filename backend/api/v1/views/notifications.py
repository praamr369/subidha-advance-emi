from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin, IsCashier
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
