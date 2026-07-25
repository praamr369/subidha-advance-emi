from __future__ import annotations

from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.pagination import build_paginated_payload
from api.v1.permissions import IsCustomer, IsAdmin, IsPartner
from api.v1.serializers.workbench import (
    WorkbenchItemSerializer,
    WorkbenchActionSerializer,
)
from subscriptions.models_workbench import WorkbenchItem, WorkbenchModule, WorkbenchItemStatus
from subscriptions.services.workbench_service import (
    workbench_base_queryset,
    get_customer_workbench,
    get_user_assigned_items,
    assign_workbench_item,
    complete_workbench_item,
    cancel_workbench_item,
    add_workbench_action,
)
from api.v1.views.customer import _get_customer_or_404_response


# ID namespacing so synthesized items from different source tables never collide.
_KYC_ID_OFFSET = 1_000_000
_LEAD_ID_OFFSET = 2_000_000
_SUPPORT_ID_OFFSET = 3_000_000
_ONLINE_REQUEST_ID_OFFSET = 4_000_000
_PRODUCT_REQUEST_ID_OFFSET = 5_000_000
_SUBSCRIPTION_REQUEST_ID_OFFSET = 6_000_000


def _base_item(**overrides):
    """A workbench row with every field defaulted so the frontend can rely on a
    stable shape regardless of which source model produced it."""
    item = {
        "id": None,
        "module": None,
        "status": "OPEN",
        # Who / what the task is about.
        "entity_type": None,      # customer | lead | ticket | request
        "entity_id": None,        # raw PK on the source model
        "customer": None,
        "customer_id": None,
        "customer_name": None,
        "product": None,
        "product_name": None,
        "batch": None,
        "batch_display": None,
        # Presentation.
        "title": None,
        "description": None,
        "request_data": {},
        # Routing: where to inspect the entity, and the one primary action to take.
        "deep_link": None,        # 360 / detail page for the entity
        "action_label": None,     # verb shown on the Execute button
        "action_href": None,      # where Execute navigates
        # Workflow bookkeeping.
        "assigned_to": None,
        "assigned_to_name": None,
        "assigned_at": None,
        "priority": 50,
        "due_date": None,
        "created_at": None,
        "updated_at": None,
        "completed_at": None,
        "actions": [],
    }
    item.update(overrides)
    return item


# Terminal statuses: records in these states are done and belong in History,
# not in the "Action Required" queue.
_ONLINE_REQUEST_TERMINAL = ("REJECTED", "COMPLETED", "CANCELLED")
_PRODUCT_REQUEST_ACTIONABLE = ("SUBMITTED",)
_LEAD_TERMINAL = ("CONVERTED", "CLOSED")


def get_dynamic_workbench_items(module=None, status_filter=None, history=False):
    """Synthesize a normalized inbox across request-bearing source tables.

    ``history=False`` (default) returns only actionable items — the "Action
    Required" queue. ``history=True`` returns every record (including terminal
    ones) with its real source status, for the History tab.
    """
    from subscriptions.models import (
        OnlineRequest,
        ProductRequest,
        Customer,
        PublicLead,
        SubscriptionRequest,
        SubscriptionRequestStatus,
    )
    from service_desk.support_ticket_models import SupportTicket

    items = []
    # ``open_only`` gates the action-only queues (KYC/Support/Lead promotion).
    open_only = not history and (not status_filter or status_filter == "OPEN")

    # --- KYC: pending customer verifications -> customer profile ---------------
    # KYC is an action queue, not a request log, so it only appears in the
    # actionable view.
    if (not module or module == "KYC") and open_only:
        for c in Customer.objects.filter(kyc_status="PENDING"):
            items.append(_base_item(
                id=c.id + _KYC_ID_OFFSET,
                module="KYC",
                entity_type="customer",
                entity_id=c.id,
                customer=c.id,
                customer_id=c.id,
                customer_name=c.name,
                title=f"KYC Pending: {c.name}",
                description="KYC verification is pending for this registered customer.",
                deep_link=f"/admin/customers/{c.id}",
                action_label="Verify KYC",
                action_href=f"/admin/crm/kyc?customer={c.id}",
                priority=80,
                created_at=c.created_at,
                updated_at=getattr(c, "updated_at", c.created_at),
            ))

    # --- SUPPORT: service tickets -> ticket detail -----------------------------
    if not module or module == "SUPPORT":
        support_qs = SupportTicket.objects.select_related("customer", "assigned_to")
        support_qs = support_qs.all() if history else support_qs.filter(status="OPEN")
        for t in support_qs:
            items.append(_base_item(
                id=t.id + _SUPPORT_ID_OFFSET,
                module="SUPPORT",
                status=t.status,
                entity_type="ticket",
                entity_id=t.id,
                customer=t.customer_id,
                customer_id=t.customer_id,
                customer_name=t.customer.name if t.customer else None,
                title=f"Ticket: {t.title}",
                description=t.description or "Support ticket awaiting response.",
                deep_link=(f"/admin/customers/{t.customer_id}" if t.customer_id else f"/admin/requests/support/{t.id}"),
                action_label="Open Ticket",
                action_href=f"/admin/requests/support/{t.id}",
                assigned_to=t.assigned_to_id,
                assigned_to_name=t.assigned_to.get_full_name() if t.assigned_to else None,
                priority=90 if t.priority == "HIGH" else 50,
                created_at=t.created_at,
                updated_at=getattr(t, "updated_at", t.created_at),
            ))

    # --- LEAD: public enquiries -> lead register -------------------------------
    if not module or module == "LEAD":
        # Action view: enquiries not yet promoted to a pipeline lead.
        # History view: every public enquiry, with its real status.
        lead_qs = PublicLead.objects.all() if history else PublicLead.objects.filter(crm_pipeline_lead__isnull=True)
        for l in lead_qs:
            items.append(_base_item(
                id=l.id + _LEAD_ID_OFFSET,
                module="LEAD",
                status=l.status,
                entity_type="lead",
                entity_id=l.id,
                # Deliberately no customer_id: an enquiry is not a registered customer yet.
                customer_name=l.name,
                title=f"New Enquiry: {l.name}",
                description=f"Enquiry from {l.source or 'Website'} — review and promote to a pipeline lead.",
                deep_link="/admin/crm/leads",
                action_label="Convert to Lead",
                action_href="/admin/crm/leads",
                priority=60,
                created_at=l.created_at,
                updated_at=getattr(l, "updated_at", l.created_at),
            ))

    # --- REQUEST: online / product requests -> request detail ------------------
    if not module or module == "REQUEST":
        online_qs = OnlineRequest.objects.select_related("customer", "product")
        online_qs = online_qs.all() if history else online_qs.exclude(status__in=_ONLINE_REQUEST_TERMINAL)
        for req in online_qs:
            items.append(_base_item(
                id=req.id + _ONLINE_REQUEST_ID_OFFSET,
                module="REQUEST",
                status=req.status,
                entity_type="request",
                entity_id=req.id,
                customer=req.customer_id,
                customer_id=req.customer_id,
                customer_name=req.customer.name if req.customer else None,
                product=req.product_id,
                product_name=req.product.name if req.product else None,
                title=f"Online Request: {req.request_type}",
                description="Online product request awaiting processing.",
                deep_link=f"/admin/requests/online-requests/{req.id}",
                action_label="Process Request",
                action_href=f"/admin/requests/online-requests/{req.id}",
                priority=70,
                created_at=req.created_at,
                updated_at=getattr(req, "updated_at", getattr(req, "created_at", None)),
            ))

        product_qs = ProductRequest.objects.select_related("customer", "product")
        product_qs = product_qs.all() if history else product_qs.filter(status__in=_PRODUCT_REQUEST_ACTIONABLE)
        for req in product_qs:
            items.append(_base_item(
                id=req.id + _PRODUCT_REQUEST_ID_OFFSET,
                module="REQUEST",
                status=req.status,
                entity_type="request",
                entity_id=req.id,
                customer=req.customer_id,
                customer_id=req.customer_id,
                customer_name=(
                    req.customer.name if req.customer
                    else (req.requested_customer_name or None)
                ),
                product=req.product_id,
                product_name=req.product.name if req.product else None,
                title=f"Product Request: {req.request_type}",
                description="Product request awaiting processing.",
                deep_link=f"/admin/requests/product-requests/{req.id}",
                action_label="Process Request",
                action_href=f"/admin/requests/product-requests/{req.id}",
                priority=70,
                created_at=req.created_at,
                updated_at=getattr(req, "updated_at", getattr(req, "created_at", None)),
            ))

    # --- SUBSCRIPTION: EMI/rent/lease subscription intake awaiting review ------
    # Actionable = SUBMITTED plus the funnel hold/amendment states (still need
    # follow-up). History = every subscription request with its real status.
    if not module or module == "SUBSCRIPTION":
        actionable_states = [
            SubscriptionRequestStatus.SUBMITTED,
            SubscriptionRequestStatus.ON_HOLD_LUCKY_UNAVAILABLE,
            SubscriptionRequestStatus.ON_HOLD_PRODUCT_NOT_READY,
            SubscriptionRequestStatus.AMENDMENT_REQUESTED,
        ]
        sub_qs = SubscriptionRequest.objects.select_related("customer", "product")
        sub_qs = sub_qs.all() if history else sub_qs.filter(status__in=actionable_states)
        for req in sub_qs:
            items.append(_base_item(
                id=req.id + _SUBSCRIPTION_REQUEST_ID_OFFSET,
                module="SUBSCRIPTION",
                status=req.status,
                entity_type="request",
                entity_id=req.id,
                customer=req.customer_id,
                customer_id=req.customer_id,
                customer_name=(
                    req.customer.name if req.customer
                    else (req.requested_customer_name or None)
                ),
                product=req.product_id,
                product_name=req.product.name if req.product else None,
                title=f"Subscription Request #{req.id}",
                description="Subscription intake awaiting admin review.",
                deep_link=f"/admin/requests/subscriptions/{req.id}",
                action_label="Review Request",
                action_href=f"/admin/requests/subscriptions/{req.id}",
                # Held/amendment items float above plain submitted ones.
                priority=75 if req.status != SubscriptionRequestStatus.SUBMITTED else 70,
                created_at=req.created_at,
                updated_at=getattr(req, "updated_at", getattr(req, "created_at", None)),
            ))

    items.sort(key=lambda x: (-x["priority"], x["created_at"]))
    return items
class CustomerWorkbenchListView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request):
        customer, err_resp = _get_customer_or_404_response(request)
        if err_resp:
            return err_resp

        module = request.query_params.get("module")
        status_filter = request.query_params.get("status")

        qs = get_customer_workbench(customer, module=module)
        if status_filter:
            qs = qs.filter(status=status_filter)

        return Response(
            build_paginated_payload(
                request,
                qs,
                lambda items: WorkbenchItemSerializer(
                    items, many=True, context={"request": request}
                ).data,
            )
        )


class CustomerWorkbenchDetailView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request, pk):
        customer, err_resp = _get_customer_or_404_response(request)
        if err_resp:
            return err_resp

        try:
            item = workbench_base_queryset().get(pk=pk, customer=customer)
            serializer = WorkbenchItemSerializer(item, context={"request": request})
            return Response(serializer.data)
        except WorkbenchItem.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)


class AdminWorkbenchListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        module = request.query_params.get("module")
        status_filter = request.query_params.get("status")
        # scope=history returns every request record (including terminal ones)
        # with its real status; default is the "Action Required" queue.
        history = request.query_params.get("scope") == "history"

        qs = get_dynamic_workbench_items(
            module=module,
            status_filter=status_filter,
            history=history,
        )

        return Response(
            build_paginated_payload(
                request,
                qs,
                lambda items: items,
            )
        )


class AdminWorkbenchDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        try:
            item = workbench_base_queryset().get(pk=pk)
            serializer = WorkbenchItemSerializer(item, context={"request": request})
            return Response(serializer.data)
        except WorkbenchItem.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)


class WorkbenchAssignView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        assigned_to_id = request.data.get("assigned_to_id")
        if not assigned_to_id:
            return Response(
                {"assigned_to_id": "Required field."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from accounts.models import User
            assigned_to = User.objects.get(pk=assigned_to_id)
            item = assign_workbench_item(
                item_id=pk,
                assigned_to=assigned_to,
                performed_by=request.user,
            )
            serializer = WorkbenchItemSerializer(item, context={"request": request})
            return Response(serializer.data)
        except WorkbenchItem.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class WorkbenchCompleteView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        notes = request.data.get("notes", "")
        result_data = request.data.get("result_data", {})

        try:
            item = complete_workbench_item(
                item_id=pk,
                performed_by=request.user,
                notes=notes,
                result_data=result_data,
            )
            serializer = WorkbenchItemSerializer(item, context={"request": request})
            return Response(serializer.data)
        except WorkbenchItem.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class WorkbenchCancelView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        notes = request.data.get("notes", "")

        try:
            item = cancel_workbench_item(
                item_id=pk,
                performed_by=request.user,
                notes=notes,
            )
            serializer = WorkbenchItemSerializer(item, context={"request": request})
            return Response(serializer.data)
        except WorkbenchItem.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class WorkbenchActionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            item = WorkbenchItem.objects.get(pk=pk)
            actions = item.actions.all()
            serializer = WorkbenchActionSerializer(actions, many=True)
            return Response(serializer.data)
        except WorkbenchItem.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)


class WorkbenchActionCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        action_type = request.data.get("action_type")
        notes = request.data.get("notes", "")
        result_data = request.data.get("result_data", {})

        try:
            action = add_workbench_action(
                item_id=pk,
                action_type=action_type,
                performed_by=request.user,
                notes=notes,
                result_data=result_data,
            )
            serializer = WorkbenchActionSerializer(action)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except WorkbenchItem.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminAssignedItemsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        status_filter = request.query_params.get("status")
        qs = get_dynamic_workbench_items(status_filter=status_filter)

        return Response(
            build_paginated_payload(
                request,
                qs,
                lambda items: items,
            )
        )
