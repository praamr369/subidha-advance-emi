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
    build_wa_me_link,
    build_whatsapp_web_link,
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
    wa_link = serializers.SerializerMethodField()
    web_link = serializers.SerializerMethodField()

    def get_wa_link(self, obj):
        return build_wa_me_link(obj.phone_e164, obj.body)

    def get_web_link(self, obj):
        return build_whatsapp_web_link(obj.phone_e164, obj.body)

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
            "wa_link",
            "web_link",
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
        """Queue a direct message to a customer or direct phone number."""
        text = str(request.data.get("text") or "").strip()
        customer_id = request.data.get("customer")
        phone = str(request.data.get("phone") or "").strip()
        recipient_name = str(request.data.get("name") or request.data.get("recipient_name") or "").strip()
        event_type = str(request.data.get("event_type") or WhatsAppEventType.CUSTOM).strip()

        customer = None
        if customer_id:
            customer = Customer.objects.filter(pk=customer_id).first()

        if not customer and not phone:
            return Response(
                {"detail": "Either an existing customer or a mobile phone number is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_phone = phone or (customer.phone if customer else "")
        if not target_phone:
            return Response(
                {"detail": "A valid phone number is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        context_data = dict(request.data.get("context") or {})
        if text:
            context_data["text"] = text
        if recipient_name:
            context_data["name"] = recipient_name
        elif customer:
            context_data.setdefault("name", customer.name)

        # Context fields for rich templates
        for field in (
            "amount",
            "ref",
            "receipt",
            "date",
            "product",
            "doc_url",
            "offer_text",
            "delivery_date",
            "payment_mode",
            "balance",
            "recovered_amount",
            "present_days",
            "absent_days",
            "overtime_hours",
            "customer_name",
            "period",
        ):
            if field in request.data:
                context_data[field] = str(request.data[field])

        message = queue_whatsapp_message(
            event_type=event_type,
            customer=customer,
            phone=target_phone,
            context=context_data,
            source_model=str(request.data.get("source_model") or "WhatsAppDirect"),
            source_id=str(request.data.get("source_id") or ""),
        )

        if message is None:
            return Response(
                {"detail": "Could not queue WhatsApp message. Check phone number format."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = self.get_serializer(message).data
        data["link"] = build_wa_me_link(message.phone_e164, message.body)
        data["web_link"] = build_whatsapp_web_link(message.phone_e164, message.body)
        return Response(data, status=status.HTTP_201_CREATED)
