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
from crm.models import (
    CustomerInteraction,
    FollowUpTask,
    FollowUpTaskStatus,
    Lead,
    LeadSource,
    LeadStage,
    Opportunity,
)
from subscriptions.models import AuditLog, Customer, Emi, KycStatus, Payment, PublicLead, Subscription
from subscriptions.services.audit_service import log_audit
from customers.services.customer_service import find_or_create_customer
from crm.services.party_service import sync_party_for_crm_lead, sync_party_for_customer

# Gap 2: valid forward transitions per stage
VALID_TRANSITIONS: dict[str, list[str]] = {
    LeadStage.NEW: [LeadStage.CONTACTED, LeadStage.LOST],
    LeadStage.CONTACTED: [LeadStage.INTERESTED, LeadStage.LOST],
    LeadStage.INTERESTED: [LeadStage.KYC_PENDING, LeadStage.LOST],
    LeadStage.KYC_PENDING: [LeadStage.READY_TO_CONVERT, LeadStage.LOST],
    LeadStage.READY_TO_CONVERT: [LeadStage.CONVERTED, LeadStage.LOST],
    LeadStage.CONVERTED: [LeadStage.LOST],
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
        page_list = list(page_qs)

        # Bulk-resolve which leads on this page map to a registered customer by
        # phone (single query), so the serializer's registered_customer field is
        # N+1-free.
        phones = [l.phone for l in page_list if l.phone]
        registered_by_phone = {}
        if phones:
            for c in Customer.objects.filter(phone__in=phones).values("id", "name", "kyc_status", "phone"):
                registered_by_phone.setdefault(c["phone"], {"id": c["id"], "name": c["name"], "kyc_status": c["kyc_status"]})

        return Response({
            "count": total,
            "stage_counts": stage_counts,
            **page_meta,
            "results": LeadSerializer(
                page_list, many=True, context={"registered_by_phone": registered_by_phone}
            ).data,
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
        sync_party_for_crm_lead(lead, performed_by=request.user)
        return Response(LeadSerializer(lead).data, status=status.HTTP_201_CREATED)


_LEAD_STAGE_SCORE = {
    "NEW": 0, "CONTACTED": 10, "INTERESTED": 20,
    "KYC_PENDING": 25, "READY_TO_CONVERT": 35, "CONVERTED": 40, "LOST": -30,
}
# Forward progression order used for stage-age and readiness comparisons.
_LEAD_STAGE_ORDER = ["NEW", "CONTACTED", "INTERESTED", "KYC_PENDING", "READY_TO_CONVERT", "CONVERTED"]


def build_lead_qualification(lead, tasks, opportunities, now):
    """Additive lead-qualification intelligence for the lead profile: a 0-100
    lead score, age/stage-age, follow-up SLA, existing-customer (duplicate)
    detection, and a conversion-readiness checklist. Purely derived — no writes,
    no schema changes."""
    task_list = list(tasks)
    opp_list = list(opportunities)

    # --- Lead score (0..100) ---
    score = 10
    if lead.email:
        score += 15
    if (lead.address or "").strip():
        score += 10
    if lead.interested_product_id:
        score += 15
    if lead.interested_plan_type:
        score += 10
    score += _LEAD_STAGE_SCORE.get(lead.stage, 0)
    score += min(len(task_list) * 5, 15)
    score += min(len(opp_list) * 5, 10)
    score = max(0, min(100, score))
    band = "hot" if score >= 70 else "warm" if score >= 40 else "cold"

    age_days = (now - lead.created_at).days if lead.created_at else None
    stage_since = lead.stage_changed_at or lead.updated_at
    days_in_stage = (now - stage_since).days if stage_since else None

    # --- Follow-up SLA ---
    nf = lead.next_follow_up_at
    if nf:
        hours_until = (nf - now).total_seconds() / 3600.0
        sla = {
            "next_follow_up_at": nf.isoformat(),
            "is_overdue": nf <= now,
            "hours_until": round(hours_until, 1),
            "state": "overdue" if nf <= now else ("due_soon" if hours_until <= 24 else "scheduled"),
        }
    else:
        sla = {"next_follow_up_at": None, "is_overdue": False, "hours_until": None, "state": "none"}

    # --- Converted customer link — the customer this lead became ---
    converted_customer = None
    if lead.converted_customer_id:
        cc = lead.converted_customer
        converted_customer = {
            "id": cc.id,
            "name": cc.name,
            "phone": cc.phone,
            "kyc_status": cc.kyc_status,
        }

    # --- Existing-customer (duplicate) detection — phone is the only shared key ---
    # Only surfaced as a *warning* when it's NOT already this lead's converted target.
    dup = None
    if lead.phone:
        match = Customer.objects.filter(phone=lead.phone).order_by("id").first()
        if match and match.id != lead.converted_customer_id:
            dup = {
                "id": match.id,
                "name": match.name,
                "phone": match.phone,
                "kyc_status": match.kyc_status,
                "is_converted_target": False,
            }

    # --- Conversion-readiness checklist ---
    stage_idx = _LEAD_STAGE_ORDER.index(lead.stage) if lead.stage in _LEAD_STAGE_ORDER else -1
    contacted = stage_idx >= _LEAD_STAGE_ORDER.index("CONTACTED")
    kyc_in_progress = stage_idx >= _LEAD_STAGE_ORDER.index("KYC_PENDING") or bool(
        dup and dup["kyc_status"] in (KycStatus.VERIFIED, KycStatus.APPROVED)
    )
    checklist = [
        {"key": "contact", "label": "Contact captured", "done": bool(lead.phone)},
        {"key": "product", "label": "Product of interest selected", "done": bool(lead.interested_product_id)},
        {"key": "plan", "label": "Plan type selected", "done": bool(lead.interested_plan_type)},
        {"key": "contacted", "label": "Lead contacted", "done": contacted},
        {"key": "kyc", "label": "KYC in progress", "done": kyc_in_progress},
    ]
    core_keys = {"contact", "product", "plan", "contacted"}
    core_done = all(item["done"] for item in checklist if item["key"] in core_keys)
    ready = core_done and lead.stage in {"READY_TO_CONVERT", "KYC_PENDING"}

    return {
        "score": score,
        "band": band,
        "age_days": age_days,
        "days_in_stage": days_in_stage,
        "sla": sla,
        "converted_customer": converted_customer,
        # Data-integrity flag: stage says converted but no customer is linked.
        "conversion_orphaned": lead.stage == "CONVERTED" and lead.converted_customer_id is None,
        "duplicate_customer": dup,
        "readiness": {"items": checklist, "ready": ready},
        "engagement": {"task_count": len(task_list), "opportunity_count": len(opp_list)},
    }


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
            "qualification": build_lead_qualification(lead, tasks, opportunities, now),
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
        allowed = list(VALID_TRANSITIONS.get(lead.stage, []))
        
        # Fast-track: if the lead is already linked to a customer, allow jumping straight to READY_TO_CONVERT
        if lead.converted_customer_id is not None and LeadStage.READY_TO_CONVERT not in allowed:
            if lead.stage not in [LeadStage.CONVERTED, LeadStage.LOST]:
                allowed.append(LeadStage.READY_TO_CONVERT)

        if new_stage not in allowed:
            raise serializers.ValidationError({
                "stage": (
                    f"Cannot move from {lead.stage} to {new_stage}. "
                    f"Allowed next stages: {allowed or ['none']}."
                )
            })

        # KYC gate: a lead cannot become READY_TO_CONVERT until its linked customer
        # has passed KYC. Verified/Approved/Exception-Approved all clear the gate;
        # anything else (Pending/Submitted/Rejected/missing) blocks the move.
        # Guard: CONVERTED must go through the Convert action, which creates and
        # links the customer. Reaching CONVERTED via a bare stage move would leave
        # the lead "converted" but orphaned (no customer). Block it here.
        if new_stage == LeadStage.CONVERTED and lead.converted_customer_id is None:
            raise serializers.ValidationError({
                "stage": (
                    "Use the Convert action to convert this lead — it creates and "
                    "links the customer record. A lead cannot be marked Converted "
                    "without a linked customer."
                )
            })

        if new_stage == LeadStage.READY_TO_CONVERT:
            customer = lead.converted_customer
            approved_states = {
                KycStatus.VERIFIED,
                KycStatus.APPROVED,
                KycStatus.EXCEPTION_APPROVED,
            }
            if customer is None:
                raise serializers.ValidationError({
                    "stage": "KYC required: no customer record is linked. Enter KYC Pending first."
                })
            if customer.kyc_status not in approved_states:
                raise serializers.ValidationError({
                    "stage": (
                        "KYC not approved yet. The linked customer's KYC status is "
                        f"'{customer.kyc_status}'. Approve KYC in the KYC queue before "
                        "moving to Ready to Convert."
                    )
                })

        note = (ser.validated_data.get("note") or "").strip()
        next_follow_up_at = ser.validated_data.get("next_follow_up_at")

        old_stage = lead.stage
        lead.stage = new_stage
        lead.stage_changed_at = timezone.now()
        update_fields = ["stage", "stage_changed_at", "updated_at"]
        if next_follow_up_at is not None:
            lead.next_follow_up_at = next_follow_up_at
            update_fields.append("next_follow_up_at")

        # Entering KYC: materialise the Customer record now so KYC documents can be
        # attached to it via the existing customer-KYC pipeline before conversion.
        # find_or_create is idempotent (matches on phone), so the later Convert
        # step reuses this same customer rather than creating a duplicate.
        kyc_customer = None
        if new_stage == LeadStage.KYC_PENDING and lead.converted_customer_id is None:
            kyc_customer, _ = find_or_create_customer(
                name=lead.name,
                phone=lead.phone,
                email=lead.email,
                address=lead.address,
                created_by=request.user,
            )
            lead.converted_customer = kyc_customer
            update_fields.append("converted_customer")

        lead.save(update_fields=update_fields)

        if kyc_customer is not None:
            party = sync_party_for_crm_lead(lead, performed_by=request.user)
            sync_party_for_customer(kyc_customer, party=party, performed_by=request.user)

        # Durable timeline entry: a completed follow-up activity records who moved
        # the stage, when, and what feedback was captured — visible in the lead's
        # Follow-up Tasks list without needing a separate audit-log reader.
        transition_label = (
            f"Stage: {LeadStage(old_stage).label} → {LeadStage(new_stage).label}"
        )
        FollowUpTask.objects.create(
            lead=lead,
            customer=lead.converted_customer,
            assigned_to=lead.assigned_to,
            due_at=timezone.now(),
            status=FollowUpTaskStatus.DONE,
            call_note=f"{transition_label}\n{note}".strip() if note else transition_label,
        )

        log_audit(
            action_type=AuditLog.ActionType.CRM_INTERACTION_UPDATED,
            instance=lead,
            performed_by=request.user,
            metadata={
                "event": "CRM_LEAD_STAGE_MOVED",
                "from_stage": old_stage,
                "to_stage": lead.stage,
                "note": note,
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
        lead.stage_changed_at = timezone.now()
        lead.save(update_fields=["converted_customer", "stage", "stage_changed_at", "updated_at"])
        log_audit(
            action_type=AuditLog.ActionType.CRM_INTERACTION_UPDATED,
            instance=lead,
            performed_by=request.user,
            metadata={"event": "CRM_LEAD_CONVERTED", "customer_id": customer.id},
        )
        party = sync_party_for_crm_lead(lead, performed_by=request.user)
        sync_party_for_customer(customer, party=party, performed_by=request.user)
        return Response({"lead": LeadSerializer(lead).data, "customer_id": customer.id})


class AdminCrmLeadReconcileView(APIView):
    """Manual reconcile of one lead — link an existing customer and/or advance
    the stage to CONVERTED so the pipeline matches customer truth."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        from crm.services.lead_reconcile_service import reconcile_lead
        lead = get_object_or_404(
            Lead.objects.select_related("assigned_to", "converted_customer", "interested_product"),
            pk=pk,
        )
        report = reconcile_lead(lead, performed_by=request.user)
        lead.refresh_from_db()
        return Response({"report": report, "lead": LeadSerializer(lead).data})


class AdminCrmLeadReconcileAllView(APIView):
    """Automatic reconcile — sweep every drifted lead in one call. Also the entry
    point used by the scheduled `reconcile_lead_conversions` command."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        from crm.services.lead_reconcile_service import reconcile_all_leads
        summary = reconcile_all_leads(performed_by=request.user)
        return Response(summary)


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


class AdminCrmFollowUpSnoozeView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        task = get_object_or_404(FollowUpTask, pk=pk)
        if task.status != "OPEN":
            raise serializers.ValidationError({"status": "Only OPEN tasks can be snoozed."})
        
        days = request.data.get("days", 1)
        try:
            days = int(days)
        except ValueError:
            raise serializers.ValidationError({"days": "Days must be an integer."})
            
        task.due_at = timezone.now() + timezone.timedelta(days=days)
        task.save(update_fields=["due_at", "updated_at"])
        return Response(FollowUpTaskSerializer(task).data)


class AdminCrmFollowUpDueView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        now = timezone.now()
        qs = FollowUpTask.objects.select_related("lead", "customer", "assigned_to").order_by("due_at", "-id")
        qs = qs.filter(status="OPEN", due_at__lte=now)

        # Gap 9: pagination
        page_qs, page_meta = _paginate(qs, request, max_size=300)

        return Response({
            "count": qs.count(),
            "overdue_count": qs.count(),
            **page_meta,
            "results": FollowUpTaskSerializer(page_qs, many=True).data,
        })



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
        sync_party_for_crm_lead(crm_lead, performed_by=request.user)
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
