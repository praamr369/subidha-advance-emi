from django.db.models import Q
from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.serializers import ModelSerializer, SerializerMethodField

from api.v1.permissions import IsCashierOrAdmin
from subscriptions.models import AuditLog, BusinessEventLog


class AuditLogSerializer(ModelSerializer):
    performed_by_username = SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "action_type",
            "model_name",
            "object_id",
            "performed_by",
            "performed_by_username",
            "metadata",
            "created_at",
        )

    def get_performed_by_username(self, obj):
        if not obj.performed_by_id:
            return None
        return obj.performed_by.username


class AuditLogListView(generics.ListAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AuditLogSerializer

    def get_queryset(self):
        queryset = (
            AuditLog.objects.select_related("performed_by")
            .all()
            .order_by("-created_at", "-id")
        )

        action_type = self.request.query_params.get("action_type")
        model_name = self.request.query_params.get("model_name")
        object_id = self.request.query_params.get("object_id")
        performed_by = self.request.query_params.get("performed_by")
        q = self.request.query_params.get("q")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")

        if action_type:
            queryset = queryset.filter(action_type=action_type)

        if model_name:
            queryset = queryset.filter(model_name__iexact=model_name.strip())

        if object_id:
            queryset = queryset.filter(object_id=str(object_id).strip())

        if performed_by:
            if str(performed_by).isdigit():
                queryset = queryset.filter(performed_by_id=int(performed_by))
            else:
                queryset = queryset.filter(
                    performed_by__username__icontains=str(performed_by).strip()
                )

        if q:
            search = q.strip()
            queryset = queryset.filter(
                Q(action_type__icontains=search)
                | Q(model_name__icontains=search)
                | Q(object_id__icontains=search)
                | Q(performed_by__username__icontains=search)
            )

        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)

        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        return queryset


class AuditLogDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AuditLogSerializer
    queryset = AuditLog.objects.select_related("performed_by").all()


class AuditObjectTimelineView(generics.ListAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AuditLogSerializer

    def get_queryset(self):
        model_name = (self.kwargs.get("model_name") or "").strip()
        object_id = self.kwargs.get("object_id")

        queryset = (
            AuditLog.objects.select_related("performed_by")
            .all()
            .order_by("-created_at", "-id")
        )

        if not model_name:
            return queryset.none()

        return queryset.filter(
            model_name__iexact=model_name,
            object_id=str(object_id).strip(),
        )


class BusinessEventLogSerializer(ModelSerializer):
    actor_username = SerializerMethodField()

    class Meta:
        model = BusinessEventLog
        fields = (
            "id",
            "event_type",
            "actor_user",
            "actor_username",
            "customer",
            "subscription",
            "contract_reference",
            "payment",
            "batch",
            "lucky_id",
            "ledger_reference",
            "source_module",
            "payload",
            "occurred_at",
            "request_id",
            "idempotency_key",
            "ip_address",
            "user_agent",
        )

    def get_actor_username(self, obj):
        if not obj.actor_user_id:
            return None
        return obj.actor_user.username


class CashierBusinessEventLogSerializer(BusinessEventLogSerializer):
    class Meta(BusinessEventLogSerializer.Meta):
        fields = (
            "id",
            "event_type",
            "customer",
            "subscription",
            "payment",
            "batch",
            "lucky_id",
            "ledger_reference",
            "occurred_at",
        )


class AdminBusinessEventLogListView(generics.ListAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = BusinessEventLogSerializer

    def get_queryset(self):
        queryset = BusinessEventLog.objects.select_related("actor_user").all().order_by("-occurred_at", "-id")
        customer = self.request.query_params.get("customer")
        subscription = self.request.query_params.get("subscription")
        contract_reference = self.request.query_params.get("contract")
        payment = self.request.query_params.get("payment")
        event_type = self.request.query_params.get("event_type")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        if customer:
            queryset = queryset.filter(customer_id=customer)
        if subscription:
            queryset = queryset.filter(subscription_id=subscription)
        if contract_reference:
            queryset = queryset.filter(contract_reference_id=contract_reference)
        if payment:
            queryset = queryset.filter(payment_id=payment)
        if event_type:
            queryset = queryset.filter(event_type=event_type.strip().upper())
        if date_from:
            queryset = queryset.filter(occurred_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(occurred_at__date__lte=date_to)
        return queryset


class AdminBusinessEventLogDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = BusinessEventLogSerializer
    queryset = BusinessEventLog.objects.select_related("actor_user").all()


class CashierBusinessEventLogListView(generics.ListAPIView):
    permission_classes = [IsCashierOrAdmin]
    serializer_class = CashierBusinessEventLogSerializer

    def get_queryset(self):
        return (
            BusinessEventLog.objects.filter(
                Q(payment__collected_by=self.request.user) | Q(actor_user=self.request.user)
            )
            .order_by("-occurred_at", "-id")
            .distinct()
        )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def financial_audit_report(request):
    """
    Lightweight compatibility endpoint.

    This intentionally avoids importing a non-existent
    system_financial_audit service. It returns audit-log-based
    summary information so the route remains operational.
    """
    queryset = AuditLog.objects.all()

    action_type = request.query_params.get("action_type")
    model_name = request.query_params.get("model_name")
    date_from = request.query_params.get("date_from")
    date_to = request.query_params.get("date_to")

    if action_type:
        queryset = queryset.filter(action_type=action_type)

    if model_name:
        queryset = queryset.filter(model_name__iexact=model_name.strip())

    if date_from:
        queryset = queryset.filter(created_at__date__gte=date_from)

    if date_to:
        queryset = queryset.filter(created_at__date__lte=date_to)

    latest = queryset.order_by("-created_at", "-id")[:20]

    return Response(
        {
            "count": queryset.count(),
            "latest": AuditLogSerializer(latest, many=True).data,
            "guidance": "Detailed financial reconciliation should use the dedicated reconciliation reports and payment reconciliation workflows.",
        }
    )