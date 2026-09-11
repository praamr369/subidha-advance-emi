"""Admin/cashier API for the click-to-send WhatsApp outbox."""
from __future__ import annotations

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from api.v1.permissions import IsCashierOrAdmin
from customers.models import Customer
from reminders.models import WhatsAppEventType, WhatsAppMessage, WhatsAppMessageStatus
from reminders.services.whatsapp_outbox_service import (
    mark_sent,
    open_message,
    queue_whatsapp_message,
    skip_message,
)


class WhatsAppMessageSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True, default="")
    event_label = serializers.CharField(source="get_event_type_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    subscription_number = serializers.CharField(
        source="subscription.subscription_number", read_only=True, default=""
    )
    sent_by_username = serializers.CharField(source="sent_by.username", read_only=True, default="")

    class Meta:
        model = WhatsAppMessage
        fields = [
            "id",
            "event_type",
            "event_label",
            "status",
            "status_label",
            "customer",
            "customer_name",
            "subscription",
            "subscription_number",
            "phone",
            "phone_e164",
            "body",
            "opted_in_snapshot",
            "source_model",
            "source_id",
            "opened_at",
            "sent_at",
            "sent_by_username",
            "skip_reason",
            "created_at",
        ]
        read_only_fields = fields


class WhatsAppMessageViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsCashierOrAdmin]
    serializer_class = WhatsAppMessageSerializer

    def get_queryset(self):
        qs = WhatsAppMessage.objects.select_related("customer", "subscription", "sent_by")
        params = self.request.query_params
        status_filter = (params.get("status") or "").strip().upper()
        if status_filter == "PENDING":
            qs = qs.filter(status__in=[WhatsAppMessageStatus.QUEUED, WhatsAppMessageStatus.OPENED])
        elif status_filter:
            qs = qs.filter(status=status_filter)
        event_type = (params.get("event_type") or "").strip().upper()
        if event_type:
            qs = qs.filter(event_type=event_type)
        search = (params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(customer__name__icontains=search)
                | Q(phone_e164__icontains=search)
                | Q(body__icontains=search)
                | Q(subscription__subscription_number__icontains=search)
            )
        return qs.order_by("-id")

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        counts = WhatsAppMessage.objects.aggregate(
            queued=Count("id", filter=Q(status=WhatsAppMessageStatus.QUEUED)),
            opened=Count("id", filter=Q(status=WhatsAppMessageStatus.OPENED)),
            sent=Count("id", filter=Q(status=WhatsAppMessageStatus.SENT)),
            skipped=Count("id", filter=Q(status=WhatsAppMessageStatus.SKIPPED)),
        )
        counts["pending"] = counts["queued"] + counts["opened"]
        counts["event_types"] = [
            {"value": value, "label": label} for value, label in WhatsAppEventType.choices
        ]
        return Response(counts)

    @action(detail=True, methods=["post"], url_path="open")
    def open(self, request, pk=None):
        message = get_object_or_404(WhatsAppMessage, pk=pk)
        try:
            return Response(open_message(message=message, performed_by=request.user))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="mark-sent")
    def mark_sent(self, request, pk=None):
        message = get_object_or_404(WhatsAppMessage, pk=pk)
        try:
            message = mark_sent(message=message, performed_by=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(message).data)

    @action(detail=True, methods=["post"], url_path="skip")
    def skip(self, request, pk=None):
        message = get_object_or_404(WhatsAppMessage, pk=pk)
        try:
            message = skip_message(
                message=message,
                performed_by=request.user,
                reason=str(request.data.get("reason") or ""),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(message).data)

    @action(detail=False, methods=["post"], url_path="compose")
    def compose(self, request):
        """Queue a free-text message to any customer (for interactions with no template)."""
        text = str(request.data.get("text") or "").strip()
        if not text:
            return Response({"text": "Message text is required."}, status=status.HTTP_400_BAD_REQUEST)
        customer = get_object_or_404(Customer, pk=request.data.get("customer"))
        message = queue_whatsapp_message(
            event_type=WhatsAppEventType.CUSTOM,
            customer=customer,
            context={"text": text},
            source_model="Customer",
            source_id=customer.pk,
        )
        if message is None:
            return Response(
                {"detail": "This customer has no valid mobile number for WhatsApp."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(self.get_serializer(message).data, status=status.HTTP_201_CREATED)
