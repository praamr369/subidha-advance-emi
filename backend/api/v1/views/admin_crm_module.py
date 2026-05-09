from __future__ import annotations

from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.admin_crm_module import (
    FollowUpTaskSerializer,
    LeadConvertSerializer,
    LeadSerializer,
    LeadStageUpdateSerializer,
)
from crm.models import FollowUpTask, Lead
from subscriptions.models import AuditLog, Customer, Emi, Payment, Subscription
from subscriptions.services.customer_service import find_or_create_customer


class AdminCrmLeadListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = Lead.objects.select_related("assigned_to", "converted_customer", "interested_product").order_by("-created_at", "-id")
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(phone__icontains=q)
                | Q(email__icontains=q)
                | Q(source__icontains=q)
            )
        return Response({"count": qs.count(), "results": LeadSerializer(qs[:200], many=True).data})

    def post(self, request):
        serializer = LeadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lead = serializer.save()
        return Response(LeadSerializer(lead).data, status=status.HTTP_201_CREATED)


class AdminCrmLeadStageUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        serializer = LeadStageUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lead.stage = serializer.validated_data["stage"]
        lead.save(update_fields=["stage", "updated_at"])
        return Response(LeadSerializer(lead).data)


class AdminCrmLeadConvertView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        serializer = LeadConvertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data.get("create_customer", True):
            raise serializers.ValidationError({"create_customer": "Lead conversion requires create_customer=true."})

        customer, _created = find_or_create_customer(
            name=serializer.validated_data.get("name") or lead.name,
            phone=serializer.validated_data.get("phone") or lead.phone,
            email=serializer.validated_data.get("email") or lead.email,
            address=serializer.validated_data.get("address") or lead.address,
            city=serializer.validated_data.get("city") or "",
            created_by=request.user,
        )
        lead.converted_customer = customer
        lead.stage = "CONVERTED"
        lead.save(update_fields=["converted_customer", "stage", "updated_at"])
        return Response({"lead": LeadSerializer(lead).data, "customer_id": customer.id})


class AdminCrmFollowUpListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = FollowUpTask.objects.select_related("lead", "customer", "assigned_to").order_by("due_at", "-id")
        overdue = qs.filter(status="OPEN", due_at__lte=timezone.now()).count()
        return Response(
            {
                "count": qs.count(),
                "overdue_count": overdue,
                "results": FollowUpTaskSerializer(qs[:300], many=True).data,
            }
        )

    def post(self, request):
        serializer = FollowUpTaskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task = serializer.save()
        return Response(FollowUpTaskSerializer(task).data, status=status.HTTP_201_CREATED)


class AdminCrmFollowUpCallNoteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        task = get_object_or_404(FollowUpTask, pk=pk)
        note = (request.data.get("call_note") or "").strip()
        if not note:
            raise serializers.ValidationError({"call_note": "call_note is required."})
        task.call_note = note
        task.save(update_fields=["call_note", "updated_at"])
        return Response(FollowUpTaskSerializer(task).data)


class AdminCustomerCrmProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        customer = get_object_or_404(Customer, pk=pk)
        subs = Subscription.objects.filter(customer=customer).order_by("-created_at")
        payments = Payment.objects.filter(customer=customer).order_by("-payment_date", "-id")
        due_total = Emi.objects.filter(subscription__customer=customer, status="PENDING").aggregate(total=Sum("amount"))["total"] or 0
        risk_flags = list(customer.crm_risk_flags.filter(is_active=True).values("id", "code", "reason", "severity", "created_at"))
        follow_ups = FollowUpTask.objects.filter(Q(customer=customer) | Q(lead__converted_customer=customer)).order_by("due_at", "-id")
        interactions = list(customer.crm_interactions.order_by("-happened_at", "-id")[:100].values("id", "interaction_type", "note", "happened_at"))
        deliveries = []
        for sub in subs[:200]:
            latest_delivery = sub.deliveries.order_by("-created_at", "-id").first()
            deliveries.append(
                {
                    "subscription_id": sub.id,
                    "fulfillment_status": sub.fulfillment_status,
                    "delivery_status": getattr(latest_delivery, "status", None),
                    "delivery_date": getattr(latest_delivery, "delivery_date", None),
                }
            )
        audits = list(
            AuditLog.objects.filter(
                Q(model_name="Customer", object_id=customer.id) | Q(model_name="Subscription", object_id__in=subs.values_list("id", flat=True))
            )
            .order_by("-created_at", "-id")[:200]
            .values("id", "action_type", "model_name", "object_id", "metadata", "created_at")
        )
        return Response(
            {
                "identity": {
                    "id": customer.id,
                    "name": customer.name,
                    "phone": customer.phone,
                    "address": customer.address,
                    "city": customer.city,
                },
                "kyc": {"status": customer.kyc_status},
                "contracts": list(subs.values("id", "subscription_number", "status", "plan_type", "monthly_amount", "start_date")),
                "dues": {"pending_emi_total": f"{due_total:.2f}"},
                "payments": list(payments.values("id", "amount", "method", "payment_date", "reference_no")[:200]),
                "delivery_status": deliveries,
                "notes": interactions[-10:] if interactions else [],
                "follow_ups": FollowUpTaskSerializer(follow_ups[:100], many=True).data,
                "risk_flags": risk_flags,
                "audit_timeline": audits,
            }
        )

