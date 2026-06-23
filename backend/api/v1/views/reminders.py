from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from reminders.models import NotificationTemplate, PaymentReminder
from reminders.services.reminder_send_run_service import run_payment_reminders
from reminders.services.reminder_service import (
    cancel_payment_reminder,
    generate_whatsapp_link,
    retry_failed_reminder,
    schedule_payment_reminder,
    send_payment_reminder,
)
from api.v1.permissions import IsAdmin, IsCashierOrAdmin
from api.v1.serializers.reminders import (
    PaymentReminderSerializer,
    ReminderActionSerializer,
    ReminderRunSerializer,
)


class PaymentReminderViewSet(viewsets.ModelViewSet):
    queryset = PaymentReminder.objects.select_related(
        "target_customer",
        "target_subscription",
        "target_invoice",
        "target_payment",
        "sent_by",
    ).all()
    serializer_class = PaymentReminderSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]
    search_fields = ["template_key", "notes", "last_error"]
    ordering_fields = ["due_date", "scheduled_for", "created_at"]
    ordering = ["scheduled_for", "due_date", "-created_at", "-id"]

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [permissions.IsAuthenticated(), IsCashierOrAdmin()]
        return [permissions.IsAuthenticated(), IsAdmin()]

    def get_serializer_class(self):
        if self.action in {"schedule", "send", "cancel", "retry"}:
            return ReminderActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="schedule")
    def schedule(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        scheduled_for = serializer.validated_data.get("scheduled_for")
        if scheduled_for is None:
            raise ValidationError({"scheduled_for": "scheduled_for is required."})
        try:
            reminder, updated = schedule_payment_reminder(
                reminder_id=int(pk),
                scheduled_for=scheduled_for,
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = PaymentReminderSerializer(reminder, context=self.get_serializer_context())
        return Response({"updated": updated, "reminder": payload.data})

    @action(detail=True, methods=["post"], url_path="send")
    def send(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            reminder, updated = send_payment_reminder(
                reminder_id=int(pk),
                performed_by=request.user,
                notes=serializer.validated_data.get("notes", ""),
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = PaymentReminderSerializer(reminder, context=self.get_serializer_context())
        return Response({"updated": updated, "reminder": payload.data})

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            reminder, updated = cancel_payment_reminder(
                reminder_id=int(pk),
                performed_by=request.user,
                notes=serializer.validated_data.get("notes", ""),
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = PaymentReminderSerializer(reminder, context=self.get_serializer_context())
        return Response({"updated": updated, "reminder": payload.data})

    @action(detail=True, methods=["post"], url_path="retry")
    def retry(self, request, pk=None):
        """Retry a FAILED reminder (email only). Max 3 attempts."""
        try:
            reminder, retried = retry_failed_reminder(
                reminder_id=int(pk),
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = PaymentReminderSerializer(reminder, context=self.get_serializer_context())
        return Response({"updated": retried, "reminder": payload.data})

    @action(detail=True, methods=["get"], url_path="whatsapp-link")
    def whatsapp_link(self, request, pk=None):
        """
        Generate a wa.me deep-link for manual WhatsApp sending.
        Returns the link and pre-filled message text. Staff must click and send manually.
        After sending, call the 'send' action to record the manual send in the audit log.
        This endpoint does NOT send any message — it only generates the link.
        """
        try:
            result = generate_whatsapp_link(reminder_id=int(pk))
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(result)


class PaymentReminderRunView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = ReminderRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = run_payment_reminders(
            due_date_on_or_before=serializer.validated_data.get("due_date_on_or_before"),
            send_now=serializer.validated_data.get("send_now", False),
            performed_by=request.user,
        )
        return Response(payload, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Notification Templates CRUD
# ---------------------------------------------------------------------------
from rest_framework import serializers as drf_serializers


class NotificationTemplateSerializer(drf_serializers.ModelSerializer):
    class Meta:
        model = NotificationTemplate
        fields = [
            "id", "key", "name", "channel", "subject", "body",
            "is_active", "description", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class NotificationTemplateViewSet(viewsets.ModelViewSet):
    queryset = NotificationTemplate.objects.all()
    serializer_class = NotificationTemplateSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    search_fields = ["key", "name", "channel"]
    ordering_fields = ["key", "channel", "created_at"]
    ordering = ["channel", "key"]

    @action(detail=True, methods=["get"], url_path="preview")
    def preview(self, request, pk=None):
        template = self.get_object()
        context = {}
        for key in ("name", "amount", "due_date", "ref", "company"):
            val = request.query_params.get(key)
            if val:
                context[key] = val
        rendered = template.render_preview(**context)
        return Response({
            "template_id": template.id,
            "key": template.key,
            "channel": template.channel,
            **rendered,
        })
