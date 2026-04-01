from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.models import (
    PaymentReconciliation,
    PaymentReconciliationEvent,
    ReconciliationEventType,
    ReconciliationStatus,
)
from subscriptions.services.audit_service import log_reconciliation_event


class ReconciliationEventSerializer(serializers.ModelSerializer):
    actor_username = serializers.SerializerMethodField()

    class Meta:
        model = PaymentReconciliationEvent
        fields = (
            "id",
            "event_type",
            "old_status",
            "new_status",
            "message",
            "actor",
            "actor_username",
            "created_at",
        )

    def get_actor_username(self, obj):
        if not obj.actor_id:
            return None
        return obj.actor.username


class PaymentReconciliationSerializer(serializers.ModelSerializer):
    payment_id = serializers.IntegerField(source="payment.id", read_only=True)
    subscription_id = serializers.IntegerField(source="payment.subscription_id", read_only=True)
    emi_id = serializers.IntegerField(source="payment.emi_id", read_only=True)
    customer_name = serializers.CharField(source="payment.customer.name", read_only=True)
    payment_amount = serializers.CharField(source="payment.amount", read_only=True)
    payment_reference_no = serializers.CharField(
        source="payment.reference_no",
        read_only=True,
        allow_blank=True,
        allow_null=True,
    )
    payment_date = serializers.DateField(source="payment.payment_date", read_only=True)
    events = ReconciliationEventSerializer(many=True, read_only=True)

    class Meta:
        model = PaymentReconciliation
        fields = (
            "id",
            "payment",
            "payment_id",
            "subscription_id",
            "emi_id",
            "customer_name",
            "payment_amount",
            "payment_reference_no",
            "payment_date",
            "matched_emi",
            "status",
            "expected_amount",
            "paid_amount",
            "variance_amount",
            "is_flagged",
            "is_locked",
            "notes",
            "reconciled_by",
            "reconciled_at",
            "created_at",
            "updated_at",
            "events",
        )


class ReconciliationActionSerializer(serializers.Serializer):
    note = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
        max_length=1000,
    )
    reason = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
        max_length=500,
    )

    def validate(self, attrs):
        note = (attrs.get("note") or "").strip()
        reason = (attrs.get("reason") or "").strip()

        if not note and not reason:
            raise serializers.ValidationError("Either note or reason is required.")

        attrs["note"] = note
        attrs["reason"] = reason
        return attrs


class PaymentReconciliationListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = PaymentReconciliationSerializer

    def get_queryset(self):
        queryset = (
            PaymentReconciliation.objects.select_related(
                "payment",
                "payment__customer",
                "payment__subscription",
                "matched_emi",
                "reconciled_by",
            )
            .prefetch_related("events__actor")
            .all()
            .order_by("-created_at", "-id")
        )

        status_filter = self.request.query_params.get("status")
        flagged = self.request.query_params.get("flagged")
        locked = self.request.query_params.get("locked")
        payment_id = self.request.query_params.get("payment")
        subscription_id = self.request.query_params.get("subscription")
        q = (self.request.query_params.get("q") or "").strip()

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if flagged in {"true", "false"}:
            queryset = queryset.filter(is_flagged=(flagged == "true"))

        if locked in {"true", "false"}:
            queryset = queryset.filter(is_locked=(locked == "true"))

        if payment_id:
            queryset = queryset.filter(payment_id=payment_id)

        if subscription_id:
            queryset = queryset.filter(payment__subscription_id=subscription_id)

        if q:
            queryset = queryset.filter(
                Q(payment__reference_no__icontains=q)
                | Q(payment__customer__name__icontains=q)
                | Q(notes__icontains=q)
                | Q(status__icontains=q)
            )

        return queryset


class PaymentReconciliationDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = PaymentReconciliationSerializer
    queryset = (
        PaymentReconciliation.objects.select_related(
            "payment",
            "payment__customer",
            "payment__subscription",
            "matched_emi",
            "reconciled_by",
        )
        .prefetch_related("events__actor")
        .all()
    )


class PaymentReconciliationFlagView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        serializer = ReconciliationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reconciliation = PaymentReconciliation.objects.select_for_update().get(pk=pk)

        old_status = reconciliation.status
        reason = serializer.validated_data["reason"] or serializer.validated_data["note"]

        reconciliation.is_flagged = True
        reconciliation.status = ReconciliationStatus.FLAGGED
        reconciliation.notes = "\n".join(
            part
            for part in [reconciliation.notes.strip(), reason]
            if part
        ).strip()
        reconciliation.reconciled_by = request.user
        reconciliation.reconciled_at = timezone.now()
        reconciliation.save(
            update_fields=[
                "is_flagged",
                "status",
                "notes",
                "reconciled_by",
                "reconciled_at",
                "updated_at",
            ]
        )

        PaymentReconciliationEvent.objects.create(
            reconciliation=reconciliation,
            event_type=ReconciliationEventType.FLAGGED,
            old_status=old_status,
            new_status=reconciliation.status,
            message=reason,
            actor=request.user,
        )

        log_reconciliation_event(
            instance=reconciliation.payment,
            performed_by=request.user,
            event="RECONCILIATION_FLAGGED",
            metadata={
                "reconciliation_id": reconciliation.id,
                "payment_id": reconciliation.payment_id,
                "old_status": old_status,
                "new_status": reconciliation.status,
                "reason": reason,
            },
        )

        return Response(
            {
                "detail": "Reconciliation flagged successfully.",
                "id": reconciliation.id,
                "status": reconciliation.status,
                "is_flagged": reconciliation.is_flagged,
            },
            status=status.HTTP_200_OK,
        )


class PaymentReconciliationNoteView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        serializer = ReconciliationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reconciliation = PaymentReconciliation.objects.select_for_update().get(pk=pk)

        note = serializer.validated_data["note"] or serializer.validated_data["reason"]
        reconciliation.notes = "\n".join(
            part for part in [reconciliation.notes.strip(), note] if part
        ).strip()
        reconciliation.reconciled_by = request.user
        reconciliation.reconciled_at = timezone.now()
        reconciliation.save(
            update_fields=["notes", "reconciled_by", "reconciled_at", "updated_at"]
        )

        PaymentReconciliationEvent.objects.create(
            reconciliation=reconciliation,
            event_type=ReconciliationEventType.NOTE_ADDED,
            old_status=reconciliation.status,
            new_status=reconciliation.status,
            message=note,
            actor=request.user,
        )

        log_reconciliation_event(
            instance=reconciliation.payment,
            performed_by=request.user,
            event="RECONCILIATION_NOTE_ADDED",
            metadata={
                "reconciliation_id": reconciliation.id,
                "payment_id": reconciliation.payment_id,
                "note": note,
            },
        )

        return Response(
            {
                "detail": "Reconciliation note added successfully.",
                "id": reconciliation.id,
                "notes": reconciliation.notes,
            },
            status=status.HTTP_200_OK,
        )


class PaymentReconciliationLockView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        serializer = ReconciliationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reconciliation = PaymentReconciliation.objects.select_for_update().get(pk=pk)

        if reconciliation.is_locked:
            return Response(
                {"detail": "Reconciliation is already locked."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reconciliation.is_locked = True
        reconciliation.reconciled_by = request.user
        reconciliation.reconciled_at = timezone.now()
        reason = serializer.validated_data["reason"] or serializer.validated_data["note"]
        reconciliation.notes = "\n".join(
            part for part in [reconciliation.notes.strip(), reason] if part
        ).strip()
        reconciliation.save(
            update_fields=["is_locked", "reconciled_by", "reconciled_at", "notes", "updated_at"]
        )

        PaymentReconciliationEvent.objects.create(
            reconciliation=reconciliation,
            event_type=ReconciliationEventType.LOCKED,
            old_status=reconciliation.status,
            new_status=reconciliation.status,
            message=reason,
            actor=request.user,
        )

        log_reconciliation_event(
            instance=reconciliation.payment,
            performed_by=request.user,
            event="RECONCILIATION_LOCKED",
            metadata={
                "reconciliation_id": reconciliation.id,
                "payment_id": reconciliation.payment_id,
                "reason": reason,
            },
        )

        return Response(
            {
                "detail": "Reconciliation locked successfully.",
                "id": reconciliation.id,
                "is_locked": reconciliation.is_locked,
            },
            status=status.HTTP_200_OK,
        )


class PaymentReconciliationUnlockView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        serializer = ReconciliationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reconciliation = PaymentReconciliation.objects.select_for_update().get(pk=pk)

        if not reconciliation.is_locked:
            return Response(
                {"detail": "Reconciliation is not locked."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reconciliation.is_locked = False
        reconciliation.reconciled_by = request.user
        reconciliation.reconciled_at = timezone.now()
        reason = serializer.validated_data["reason"] or serializer.validated_data["note"]
        reconciliation.notes = "\n".join(
            part for part in [reconciliation.notes.strip(), reason] if part
        ).strip()
        reconciliation.save(
            update_fields=["is_locked", "reconciled_by", "reconciled_at", "notes", "updated_at"]
        )

        PaymentReconciliationEvent.objects.create(
            reconciliation=reconciliation,
            event_type=ReconciliationEventType.UNLOCKED,
            old_status=reconciliation.status,
            new_status=reconciliation.status,
            message=reason,
            actor=request.user,
        )

        log_reconciliation_event(
            instance=reconciliation.payment,
            performed_by=request.user,
            event="RECONCILIATION_UNLOCKED",
            metadata={
                "reconciliation_id": reconciliation.id,
                "payment_id": reconciliation.payment_id,
                "reason": reason,
            },
        )

        return Response(
            {
                "detail": "Reconciliation unlocked successfully.",
                "id": reconciliation.id,
                "is_locked": reconciliation.is_locked,
            },
            status=status.HTTP_200_OK,
        )