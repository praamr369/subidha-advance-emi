from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from reminders.models import PaymentReminder
from reminders.services.reminder_send_run_service import run_payment_reminders
from reminders.services.reminder_service import (
    cancel_payment_reminder,
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
        if self.action in {"schedule", "send", "cancel"}:
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
