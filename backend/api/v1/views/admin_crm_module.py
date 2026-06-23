from __future__ import annotations

from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.admin_crm_module import (
    CustomerInteractionCreateSerializer,
    CustomerInteractionSerializer,
    FollowUpTaskCreateSerializer,
    FollowUpTaskSerializer,
    LeadAssignSerializer,
    LeadConvertSerializer,
    LeadSerializer,
    LeadStageUpdateSerializer,
    LeadUpdateSerializer,
    OpportunityCreateSerializer,
    OpportunitySerializer,
    OpportunityStageUpdateSerializer,
)
from crm.models import CustomerInteraction, FollowUpTask, Lead, LeadSource, LeadStage, Opportunity
from subscriptions.models import AuditLog, Customer, Emi, Payment, PublicLead, Subscription
from subscriptions.services.audit_service import log_audit
from subscriptions.services.customer_service import find_or_create_customer

# Gap 2: valid forward transitions per stage
VALID_TRANSITIONS: dict[str, list[str]] = {
    LeadStage.NEW: [LeadStage.CONTACTED, LeadStage.LOST],
    LeadStage.CONTACTED: [LeadStage.INTERESTED, LeadStage.LOST],
    LeadStage.INTERESTED: [LeadStage.KYC_PENDING, LeadStage.LOST],
    LeadStage.KYC_PENDING: [LeadStage.READY_TO_CONVERT, LeadStage.LOST],
    LeadStage.READY_TO_CONVERT: [LeadStage.CONVERTED, LeadStage.LOST],
    LeadStage.CONVERTED: [],
    LeadStage.LOST: [LeadStage.NEW],
}


def _paginate(qs, request, max_size: int = 200):
    """Return (page_qs, pagination_meta_dict)."""
    try:
        page = max(1, int(request.query_params.get("page") or 1))
    except (ValueError, TypeError):
        page = 1
    try:
        page_size = min(max_size, max(1, int(request.query_params.get("page_size") or 50)))
    except (ValueError, TypeError):
        page_size = 50
    offset = (page - 1) * page_size
    total = qs.count()
    total_pages = max(1, (total + page_size - 1) // page_size)
    return qs[offset: offset + page_size], {
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1,
    }


class AdminCrmLeadListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = Lead.objects.select_related(
            "assigned_to", "converted_customer", "interested_product"
        ).order_by("-created_at", "-id")

        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(phone__icontains=q)
                | Q(email__icontains=q)
            )

        stage = (request.query_params.get("stage") or "").strip().upper()
        if stage and stage in LeadStage.values:
            qs = qs.filter(stage=stage)

        source = (request.query_params.get("source") or "").strip().upper()
        if source and source in LeadSource.values:
            qs = qs.filter(source=source)

        assigned = (request.query_params.get("assigned_to") or "").strip()
        if assigned == "me":
            qs = qs.filter(assigned_to=request.user)
        elif assigned == "unassigned":
            qs = qs.filter(assigned_to__isnull=True)

        plan_type = (request.query_params.get("plan_type") or "").strip().upper()
        if plan_type:
            qs = qs.filter(interested_plan_type=plan_type)

        # Gap 10: date range filter
        created_after = (request.query_params.get("created_after") or "").strip()
        if created_after:
            qs = qs.filter(created_at__date__gte=created_after)
        created_before = (request.query_params.get("created_before") or "").strip()
        if created_before:
            qs = qs.filter(created_at__date__lte=created_before)

        stage_counts = {
            item["stage"]: item["count"]
            for item in Lead.objects.values("stage").annotate(count=Count("id"))
        }

        total = qs.count()
        # Gap 9: real pagination
        page_qs, page_meta = _paginate(qs, request)

        return Response({
            "count": total,
            "stage_counts": stage_counts,
            **page_meta,
            "results": LeadSerializer(page_qs, many=True).data,
        })

    def post(self, request):
        ser = LeadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        # Gap 8: duplicate phone check
        phone = (request.data.get("phone") or "").strip()
        if phone:
            existing = Lead.objects.filter(phone=phone).exclude(stage=LeadStage.LOST).first()
            if existing:
                return Response(
                    {
                        "detail": f"A lead with phone {phone} already exists in the pipeline.",
                        "existing_lead_id": existing.id,
                        "existing_stage": existing.stage,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        lead = ser.save()
        log_audit(
            action_type=AuditLog.ActionType.CRM_PARTY_CREATED,
            instance=lead,
            performed_by=request.user,
            metadata={"event": "CRM_LEAD_CREATED", "name": lead.name, "source": lead.source},
        )
        return Response(LeadSerializer(lead).data, status=status.HTTP_201_CREATED)


class AdminCrmLeadDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def _get_lead(self, pk):
        return get_object_or_404(
            Lead.objects.select_related("assigned_to", "converted_customer", "interested_product"),
            pk=pk,
        )

    def get(self, request, pk):
        lead = self._get_lead(pk)
        tasks = FollowUpTask.objects.filter(lead=lead).select_related("assigned_to").order_by("due_at", "-id")
        opportunities = Opportunity.objects.filter(lead=lead).select_related("owner").order_by("-created_at", "-id")
        now = timezone.now()
        return Response({
            "lead": LeadSerializer(lead).data,
            "follow_up_tasks": FollowUpTaskSerializer(tasks, many=True).data,
            "opportunities": OpportunitySerializer(opportunities, many=True).data,
            "overdue_task_count": tasks.filter(status="OPEN", due_at__lte=now).count(),
            "open_task_count": tasks.filter(status="OPEN").count(),
        })

    def patch(self, request, pk):
        lead = self._get_lead(pk)
        ser = LeadUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        update_fields = []
        for field in ("name", "phone", "email", "address", "source", "notes", "interested_plan_type", "next_follow_up_at"):
            if field in data:
                setattr(lead, field, data[field])
                update_fields.append(field)

        if "interested_product" in data:
            lead.interested_product_id = data["interested_product"]
            update_fields.append("interested_product")

        if update_fields:
            update_fields.append("updated_at")
            lead.save(update_fields=update_fields)

        lead.refresh_from_db()
        lead = self._get_lead(pk)
        return Response(LeadSerializer(lead).data)


class AdminCrmLeadStageUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        ser = LeadStageUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        new_stage = ser.validated_data["stage"]

        # Gap 2: enforce valid transitions
        allowed = VALID_TRANSITIONS.get(lead.stage, [])
        if new_stage not in allowed:
            raise serializers.ValidationError({
                "stage": (
                    f"Cannot move from {lead.stage} to {new_stage}. "
                    f"Allowed next stages: {allowed or ['none']}."
                )
            })

        old_stage = lead.stage
        lead.stage = new_stage
        lead.save(update_fields=["stage", "updated_at"])
        log_audit(
            action_type=AuditLog.ActionType.CRM_INTERACTION_UPDATED,
            instance=lead,
            performed_by=request.user,
            metadata={
                "event": "CRM_LEAD_STAGE_MOVED",
                "from_stage": old_stage,
                "to_stage": lead.stage,
            },
        )
        return Response(LeadSerializer(lead).data)


class AdminCrmLeadAssignView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        lead = get_object_or_404(
            Lead.objects.select_related("assigned_to", "converted_customer", "interested_product"),
            pk=pk,
        )
        ser = LeadAssignSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        assigned_to_id = ser.validated_data["assigned_to"]

        if assigned_to_id is None:
            lead.assigned_to = None
        else:
            from accounts.models import User
            try:
                lead.assigned_to = User.objects.get(pk=assigned_to_id)
            except User.DoesNotExist:
                raise serializers.ValidationError({"assigned_to": "User not found."})

        lead.save(update_fields=["assigned_to", "updated_at"])
        log_audit(
            action_type=AuditLog.ActionType.CRM_INTERACTION_UPDATED,
            instance=lead,
            performed_by=request.user,
            metadata={
                "event": "CRM_LEAD_ASSIGNED",
                "assigned_to_id": assigned_to_id,
            },
        )
        return Response(LeadSerializer(lead).data)


class AdminCrmLeadConvertView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        ser = LeadConvertSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if not ser.validated_data.get("create_customer", True):
            raise serializers.ValidationError({"create_customer": "Lead conversion requires create_customer=true."})

        customer, _created = find_or_create_customer(
            name=ser.validated_data.get("name") or lead.name,
            phone=ser.validated_data.get("phone") or lead.phone,
            email=ser.validated_data.get("email") or lead.email,
            address=ser.validated_data.get("address") or lead.address,
            city=ser.validated_data.get("city") or "",
            created_by=request.user,
        )
        lead.converted_customer = customer
        lead.stage = LeadStage.CONVERTED
        lead.save(update_fields=["converted_customer", "stage", "updated_at"])
        log_audit(
            action_type=AuditLog.ActionType.CRM_INTERACTION_UPDATED,
            instance=lead,
            performed_by=request.user,
            metadata={"event": "CRM_LEAD_CONVERTED", "customer_id": customer.id},
        )
        return Response({"lead": LeadSerializer(lead).data, "customer_id": customer.id})


class AdminCrmLeadTaskListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        tasks = FollowUpTask.objects.filter(lead=lead).select_related("assigned_to").order_by("due_at", "-id")
        overdue = tasks.filter(status="OPEN", due_at__lte=timezone.now()).count()
        return Response({
            "count": tasks.count(),
            "overdue_count": overdue,
            "results": FollowUpTaskSerializer(tasks, many=True).data,
        })

    def post(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        ser = FollowUpTaskCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        assigned_to = None
        if ser.validated_data.get("assigned_to"):
            from accounts.models import User
            try:
                assigned_to = User.objects.get(pk=ser.validated_data["assigned_to"])
            except User.DoesNotExist:
                raise serializers.ValidationError({"assigned_to": "User not found."})

        customer = None
        if ser.validated_data.get("customer"):
            try:
                customer = Customer.objects.get(pk=ser.validated_data["customer"])
            except Customer.DoesNotExist:
                raise serializers.ValidationError({"customer": "Customer not found."})

        task = FollowUpTask.objects.create(
            lead=lead,
            due_at=ser.validated_data["due_at"],
            call_note=(ser.validated_data.get("call_note") or "").strip(),
            assigned_to=assigned_to,
            customer=customer,
        )
        return Response(FollowUpTaskSerializer(task).data, status=status.HTTP_201_CREATED)


class AdminCrmFollowUpListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = FollowUpTask.objects.select_related("lead", "customer", "assigned_to").order_by("due_at", "-id")

        task_status = (request.query_params.get("status") or "").strip().upper()
        if task_status in ("OPEN", "DONE", "CANCELLED"):
            qs = qs.filter(status=task_status)
        else:
            qs = qs.filter(status="OPEN")

        assigned = (request.query_params.get("assigned_to") or "").strip()
        if assigned == "me":
            qs = qs.filter(assigned_to=request.user)

        now = timezone.now()
        overdue = qs.filter(status="OPEN", due_at__lte=now).count()

        # Gap 9: pagination
        page_qs, page_meta = _paginate(qs, request, max_size=300)

        return Response({
            "count": qs.count(),
            "overdue_count": overdue,
            **page_meta,
            "results": FollowUpTaskSerializer(page_qs, many=True).data,
        })
    # Gap 3: removed incorrect POST — tasks are created via /leads/<pk>/tasks/


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


class AdminCrmFollowUpCompleteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        task = get_object_or_404(FollowUpTask, pk=pk)
        if task.status != "OPEN":
            raise serializers.ValidationError({"status": "Only OPEN tasks can be completed."})
        task.status = "DONE"
        task.completed_at = timezone.now()
        call_note = (request.data.get("call_note") or "").strip()
        if call_note:
            task.call_note = call_note
        task.save(update_fields=["status", "completed_at", "call_note", "updated_at"])
        return Response(FollowUpTaskSerializer(task).data)


class AdminCrmFollowUpCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        task = get_object_or_404(FollowUpTask, pk=pk)
        if task.status != "OPEN":
            raise serializers.ValidationError({"status": "Only OPEN tasks can be cancelled."})
        task.status = "CANCELLED"
        task.completed_at = timezone.now()
        task.save(update_fields=["status", "completed_at", "updated_at"])
        return Response(FollowUpTaskSerializer(task).data)


class AdminCrmLeadOpportunityListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        opps = Opportunity.objects.filter(lead=lead).select_related("owner").order_by("-created_at", "-id")
        return Response({
            "count": opps.count(),
            "results": OpportunitySerializer(opps, many=True).data,
        })

    def post(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        ser = OpportunityCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        owner = None
        if ser.validated_data.get("owner"):
            from accounts.models import User
            try:
                owner = User.objects.get(pk=ser.validated_data["owner"])
            except User.DoesNotExist:
                raise serializers.ValidationError({"owner": "User not found."})

        customer = None
        if ser.validated_data.get("customer"):
            try:
                customer = Customer.objects.get(pk=ser.validated_data["customer"])
            except Customer.DoesNotExist:
                raise serializers.ValidationError({"customer": "Customer not found."})

        opp = Opportunity.objects.create(
            lead=lead,
            customer=customer,
            title=ser.validated_data["title"].strip(),
            estimated_value=ser.validated_data.get("estimated_value", 0),
            expected_close_date=ser.validated_data.get("expected_close_date"),
            owner=owner,
            notes=(ser.validated_data.get("notes") or "").strip(),
        )
        return Response(OpportunitySerializer(opp).data, status=status.HTTP_201_CREATED)


class AdminCrmOpportunityStageView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        opp = get_object_or_404(Opportunity.objects.select_related("owner"), pk=pk)
        ser = OpportunityStageUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        opp.stage = ser.validated_data["stage"]
        update_fields = ["stage", "updated_at"]
        if ser.validated_data.get("notes"):
            opp.notes = ser.validated_data["notes"].strip()
            update_fields.append("notes")
        opp.save(update_fields=update_fields)
        return Response(OpportunitySerializer(opp).data)


class AdminCrmFunnelView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        stage_order = [s.value for s in LeadStage]
        counts = {
            item["stage"]: item["count"]
            for item in Lead.objects.values("stage").annotate(count=Count("id"))
        }

        source_counts = [
            {"source": item["source"] or "UNKNOWN", "count": item["count"]}
            for item in Lead.objects.values("source").annotate(count=Count("id")).order_by("-count")
        ]
        source_converted = {
            item["source"] or "UNKNOWN": item["count"]
            for item in Lead.objects.filter(stage=LeadStage.CONVERTED)
            .values("source")
            .annotate(count=Count("id"))
        }
        source_breakdown = []
        for entry in source_counts:
            src = entry["source"]
            total = entry["count"]
            converted = source_converted.get(src, 0)
            source_breakdown.append({
                "source": src,
                "total": total,
                "converted": converted,
                "conversion_rate": round(converted / total * 100, 1) if total > 0 else 0,
            })

        plan_type_counts = [
            {"plan_type": item["interested_plan_type"], "count": item["count"]}
            for item in Lead.objects.values("interested_plan_type").annotate(count=Count("id")).order_by("-count")
        ]

        total = Lead.objects.count()
        converted_total = counts.get(LeadStage.CONVERTED, 0)
        lost_total = counts.get(LeadStage.LOST, 0)

        stages = []
        for stage in stage_order:
            count = counts.get(stage, 0)
            stages.append({
                "stage": stage,
                "count": count,
                "pct_of_total": round(count / total * 100, 1) if total > 0 else 0,
            })

        return Response({
            "summary": {
                "total_leads": total,
                "converted": converted_total,
                "lost": lost_total,
                "active": total - converted_total - lost_total,
                "overall_conversion_rate": round(converted_total / total * 100, 1) if total > 0 else 0,
            },
            "stages": stages,
            "source_breakdown": source_breakdown,
            "plan_type_breakdown": plan_type_counts,
        })


# Gap 7: CustomerInteraction endpoints
class AdminCrmCustomerInteractionView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        customer = get_object_or_404(Customer, pk=pk)
        qs = CustomerInteraction.objects.filter(customer=customer).select_related("created_by", "lead").order_by("-happened_at", "-id")
        return Response({
            "count": qs.count(),
            "results": CustomerInteractionSerializer(qs[:200], many=True).data,
        })

    def post(self, request, pk):
        customer = get_object_or_404(Customer, pk=pk)
        ser = CustomerInteractionCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        lead = None
        if ser.validated_data.get("lead"):
            try:
                lead = Lead.objects.get(pk=ser.validated_data["lead"])
            except Lead.DoesNotExist:
                raise serializers.ValidationError({"lead": "Lead not found."})

        interaction = CustomerInteraction.objects.create(
            customer=customer,
            lead=lead,
            interaction_type=(ser.validated_data.get("interaction_type") or "CALL").strip().upper(),
            note=ser.validated_data["note"].strip(),
            happened_at=ser.validated_data.get("happened_at") or timezone.now(),
            created_by=request.user,
        )
        return Response(CustomerInteractionSerializer(interaction).data, status=status.HTTP_201_CREATED)


# Gap 6: minimal staff list for assignment dropdowns
class AdminCrmStaffListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        from accounts.models import User
        qs = User.objects.filter(is_active=True, role__in=["ADMIN", "CASHIER", "STAFF"]).order_by("first_name", "username")
        results = [
            {
                "id": u.id,
                "username": u.username,
                "full_name": f"{u.first_name or ''} {u.last_name or ''}".strip() or u.username,
                "role": getattr(u, "role", ""),
            }
            for u in qs[:200]
        ]
        return Response({"count": len(results), "results": results})


# Gap 11: PublicLead → crm.Lead promotion
class AdminCrmPromotePublicLeadView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        public_lead = get_object_or_404(PublicLead, pk=pk)

        # Prevent double-promotion
        existing = Lead.objects.filter(public_lead=public_lead).first()
        if existing:
            return Response(
                {
                    "detail": "This online enquiry has already been promoted to the CRM pipeline.",
                    "crm_lead_id": existing.id,
                    "crm_lead_stage": existing.stage,
                },
                status=status.HTTP_409_CONFLICT,
            )

        # Map intent/source
        source = "ONLINE_ENQUIRY"

        # Determine plan type (default LUCKY_PLAN)
        interested_plan_type = (request.data.get("interested_plan_type") or "LUCKY_PLAN").strip().upper()
        if interested_plan_type not in ("LUCKY_PLAN", "RENT", "LEASE", "DIRECT_SALE"):
            interested_plan_type = "LUCKY_PLAN"

        notes_parts = []
        if public_lead.notes:
            notes_parts.append(f"Enquiry notes: {public_lead.notes}")
        if public_lead.admin_notes:
            notes_parts.append(f"Admin notes: {public_lead.admin_notes}")

        crm_lead = Lead.objects.create(
            name=public_lead.name,
            phone=public_lead.phone,
            email=public_lead.email or "",
            address=getattr(public_lead, "city", "") or "",
            source=source,
            interested_plan_type=interested_plan_type,
            stage=LeadStage.NEW,
            notes="\n".join(notes_parts),
            public_lead=public_lead,
            assigned_to=request.user,
        )

        log_audit(
            action_type=AuditLog.ActionType.CRM_PARTY_CREATED,
            instance=crm_lead,
            performed_by=request.user,
            metadata={
                "event": "CRM_LEAD_PROMOTED_FROM_PUBLIC",
                "public_lead_id": public_lead.id,
                "name": crm_lead.name,
            },
        )
        return Response(
            {"crm_lead": LeadSerializer(crm_lead).data, "public_lead_id": public_lead.id},
            status=status.HTTP_201_CREATED,
        )


class AdminCustomerCrmProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        customer = get_object_or_404(Customer, pk=pk)
        subs = Subscription.objects.filter(customer=customer).order_by("-created_at")
        payments = Payment.objects.filter(customer=customer).order_by("-payment_date", "-id")
        due_total = (
            Emi.objects.filter(subscription__customer=customer, status="PENDING")
            .aggregate(total=Sum("amount"))["total"] or 0
        )
        risk_flags = list(
            customer.crm_risk_flags.filter(is_active=True)
            .values("id", "code", "reason", "severity", "created_at")
        )
        follow_ups = FollowUpTask.objects.filter(
            Q(customer=customer) | Q(lead__converted_customer=customer)
        ).order_by("due_at", "-id")
        interactions = list(
            customer.crm_interactions.order_by("-happened_at", "-id")[:100]
            .values("id", "interaction_type", "note", "happened_at")
        )
        deliveries = []
        for sub in subs[:200]:
            latest_delivery = sub.deliveries.order_by("-created_at", "-id").first()
            deliveries.append({
                "subscription_id": sub.id,
                "fulfillment_status": sub.fulfillment_status,
                "delivery_status": getattr(latest_delivery, "status", None),
                "delivery_date": getattr(latest_delivery, "delivery_date", None),
            })
        audits = list(
            AuditLog.objects.filter(
                Q(model_name="Customer", object_id=customer.id)
                | Q(model_name="Subscription", object_id__in=subs.values_list("id", flat=True))
            )
            .order_by("-created_at", "-id")[:200]
            .values("id", "action_type", "model_name", "object_id", "metadata", "created_at")
        )
        return Response({
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
        })
