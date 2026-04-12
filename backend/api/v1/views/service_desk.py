from __future__ import annotations

from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.service_desk import (
    ServiceDeskCaseDeliveryActionSerializer,
    ServiceDeskCaseReplacementSerializer,
    ServiceDeskCaseSerializer,
    ServiceDeskCaseStatusUpdateSerializer,
    ServiceDeskComplaintRegisterSerializer,
    run_service_case_credit_note_post,
    run_service_case_debit_note_post,
    run_service_case_delivery_complete,
    run_service_case_delivery_request,
)
from service_desk.models import (
    ServiceDeskCase,
    ServiceDeskCaseStatus,
    ServiceDeskCaseType,
)
from service_desk.services.case_service import transition_service_desk_case_status
from subscriptions.models import CustomerSupportRequest, SupportRequestStatus


def _case_queryset():
    return ServiceDeskCase.objects.select_related(
        "party",
        "support_request",
        "direct_sale",
        "subscription",
        "delivery",
        "billing_invoice",
        "credit_note",
        "debit_note",
        "replacement_direct_sale",
        "product",
        "inventory_item",
        "assigned_to",
        "authorized_by",
        "resolved_by",
        "closed_by",
    ).prefetch_related("lines")


def _apply_case_filters(queryset, request):
    q = (request.query_params.get("q") or "").strip()
    case_type = (request.query_params.get("case_type") or "").strip().upper()
    status_filter = (request.query_params.get("status") or "").strip().upper()
    party = (request.query_params.get("party") or "").strip()
    support_request = (request.query_params.get("support_request") or "").strip()
    direct_sale = (request.query_params.get("direct_sale") or "").strip()
    subscription = (request.query_params.get("subscription") or "").strip()
    delivery = (request.query_params.get("delivery") or "").strip()
    billing_invoice = (request.query_params.get("billing_invoice") or "").strip()
    branch_id = (request.query_params.get("branch") or "").strip()
    finance_status = (request.query_params.get("finance_status") or "").strip().upper()
    stock_status = (request.query_params.get("stock_status") or "").strip().upper()
    assigned_to = (request.query_params.get("assigned_to") or "").strip()

    if case_type and case_type in ServiceDeskCaseType.values:
        queryset = queryset.filter(case_type=case_type)
    if status_filter and status_filter in ServiceDeskCaseStatus.values:
        queryset = queryset.filter(status=status_filter)
    if finance_status:
        queryset = queryset.filter(finance_status=finance_status)
    if stock_status:
        queryset = queryset.filter(stock_status=stock_status)
    if party.isdigit():
        queryset = queryset.filter(party_id=int(party))
    if support_request.isdigit():
        queryset = queryset.filter(support_request_id=int(support_request))
    if direct_sale.isdigit():
        queryset = queryset.filter(direct_sale_id=int(direct_sale))
    if subscription.isdigit():
        queryset = queryset.filter(subscription_id=int(subscription))
    if delivery.isdigit():
        queryset = queryset.filter(delivery_id=int(delivery))
    if billing_invoice.isdigit():
        queryset = queryset.filter(billing_invoice_id=int(billing_invoice))
    if branch_id.isdigit():
        queryset = queryset.filter(
            Q(direct_sale__branch_id=int(branch_id))
            | Q(subscription__branch_id=int(branch_id))
            | Q(delivery__subscription__branch_id=int(branch_id))
            | Q(billing_invoice__branch_id=int(branch_id))
            | Q(support_request__subscription__branch_id=int(branch_id))
            | Q(support_request__payment__branch_id=int(branch_id))
            | Q(replacement_direct_sale__branch_id=int(branch_id))
        ).distinct()
    if assigned_to:
        if assigned_to == "unassigned":
            queryset = queryset.filter(assigned_to__isnull=True)
        elif assigned_to.isdigit():
            queryset = queryset.filter(assigned_to_id=int(assigned_to))

    if q:
        filters = (
            Q(case_no__icontains=q)
            | Q(issue_summary__icontains=q)
            | Q(issue_details__icontains=q)
            | Q(internal_notes__icontains=q)
            | Q(reporter_name_snapshot__icontains=q)
            | Q(reporter_phone_snapshot__icontains=q)
            | Q(party__display_name__icontains=q)
            | Q(support_request__message__icontains=q)
            | Q(direct_sale__sale_no__icontains=q)
            | Q(delivery__delivery_reference__icontains=q)
            | Q(billing_invoice__document_no__icontains=q)
            | Q(credit_note__note_no__icontains=q)
            | Q(debit_note__note_no__icontains=q)
        )
        if q.isdigit():
            filters = filters | Q(id=int(q))
        queryset = queryset.filter(filters)

    return queryset.order_by("-created_at", "-id")


def _support_request_queryset():
    return CustomerSupportRequest.objects.select_related(
        "customer",
        "payment",
        "subscription",
        "assigned_to",
        "resolved_by",
    ).prefetch_related(
        Prefetch(
            "service_desk_cases",
            queryset=_case_queryset().order_by("-created_at", "-id"),
        )
    )


def _apply_complaint_filters(queryset, request):
    q = (request.query_params.get("q") or "").strip()
    status_filter = (request.query_params.get("status") or "").strip().upper()
    category_filter = (request.query_params.get("category") or "").strip().upper()
    branch_id = (request.query_params.get("branch") or "").strip()
    linked_only = (request.query_params.get("linked_only") or "").strip().lower()

    if status_filter and status_filter in SupportRequestStatus.values:
        queryset = queryset.filter(status=status_filter)
    if category_filter:
        queryset = queryset.filter(category=category_filter)
    if branch_id.isdigit():
        queryset = queryset.filter(
            Q(subscription__branch_id=int(branch_id))
            | Q(payment__branch_id=int(branch_id))
            | Q(service_desk_cases__subscription__branch_id=int(branch_id))
            | Q(service_desk_cases__direct_sale__branch_id=int(branch_id))
            | Q(service_desk_cases__delivery__subscription__branch_id=int(branch_id))
            | Q(service_desk_cases__billing_invoice__branch_id=int(branch_id))
        ).distinct()
    if linked_only == "true":
        queryset = queryset.filter(service_desk_cases__isnull=False).distinct()
    if q:
        filters = (
            Q(message__icontains=q)
            | Q(internal_notes__icontains=q)
            | Q(customer__name__icontains=q)
            | Q(customer__phone__icontains=q)
            | Q(payment__reference_no__icontains=q)
            | Q(service_desk_cases__case_no__icontains=q)
            | Q(service_desk_cases__issue_summary__icontains=q)
        )
        if q.isdigit():
            filters = filters | Q(id=int(q)) | Q(subscription_id=int(q)) | Q(payment_id=int(q))
        queryset = queryset.filter(filters).distinct()
    return queryset.order_by("-created_at", "-id")


class AdminServiceDeskModelViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]


class ServiceDeskOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        cases = _case_queryset()
        complaints = _support_request_queryset()

        return Response(
            {
                "summary": {
                    "case_count": cases.count(),
                    "open_count": cases.filter(
                        status__in=[
                            ServiceDeskCaseStatus.OPEN,
                            ServiceDeskCaseStatus.UNDER_REVIEW,
                            ServiceDeskCaseStatus.AUTHORIZED,
                            ServiceDeskCaseStatus.IN_SERVICE,
                        ]
                    ).count(),
                    "returns_count": cases.filter(
                        case_type__in=[
                            ServiceDeskCaseType.SALES_RETURN,
                            ServiceDeskCaseType.DELIVERY_RETURN,
                            ServiceDeskCaseType.EXCHANGE,
                        ]
                    ).count(),
                    "service_count": cases.filter(case_type=ServiceDeskCaseType.SERVICE).count(),
                    "complaint_case_count": cases.filter(case_type=ServiceDeskCaseType.COMPLAINT).count(),
                    "finance_pending_count": cases.filter(finance_status="PENDING").count(),
                    "stock_pending_count": cases.filter(stock_status="PENDING").count(),
                    "support_request_count": complaints.count(),
                    "open_support_request_count": complaints.exclude(
                        status=SupportRequestStatus.CLOSED
                    ).count(),
                },
                "recent_cases": ServiceDeskCaseSerializer(cases[:8], many=True).data,
                "recent_complaints": ServiceDeskComplaintRegisterSerializer(
                    complaints[:8],
                    many=True,
                ).data,
            }
        )


class ServiceDeskComplaintRegisterView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = _apply_complaint_filters(_support_request_queryset(), request)
        serializer = ServiceDeskComplaintRegisterSerializer(queryset[:200], many=True)
        linked_cases = ServiceDeskCase.objects.filter(
            support_request_id__in=queryset.values("id")
        ).count()
        total = queryset.count()
        return Response(
            {
                "count": total,
                "summary": {
                    "total": total,
                    "submitted": queryset.filter(status=SupportRequestStatus.SUBMITTED).count(),
                    "under_review": queryset.filter(status=SupportRequestStatus.UNDER_REVIEW).count(),
                    "closed": queryset.filter(status=SupportRequestStatus.CLOSED).count(),
                    "linked_case_count": linked_cases,
                },
                "results": serializer.data,
            }
        )


class ServiceDeskCaseViewSet(AdminServiceDeskModelViewSet):
    queryset = _case_queryset()
    serializer_class = ServiceDeskCaseSerializer
    ordering = ["-created_at", "-id"]
    search_fields = ["case_no", "issue_summary", "reporter_name_snapshot", "reporter_phone_snapshot"]

    def get_queryset(self):
        return _apply_case_filters(super().get_queryset(), self.request)

    def get_serializer_class(self):
        if self.action == "update_status":
            return ServiceDeskCaseStatusUpdateSerializer
        if self.action in {"request_delivery_return", "complete_delivery_return"}:
            return ServiceDeskCaseDeliveryActionSerializer
        if self.action == "link_replacement_sale":
            return ServiceDeskCaseReplacementSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="status")
    def update_status(self, request, pk=None):
        service_case = get_object_or_404(_case_queryset(), pk=pk)
        serializer = self.get_serializer(
            data=request.data,
            context={"case": service_case, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        try:
            updated_case, updated = transition_service_desk_case_status(
                case_id=service_case.id,
                next_status=serializer.validated_data["status"],
                resolution_summary=serializer.validated_data.get("resolution_summary", ""),
                performed_by=request.user,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"status": str(exc)}) from exc
        payload = ServiceDeskCaseSerializer(updated_case, context=self.get_serializer_context())
        return Response({"updated": updated, "service_case": payload.data})

    @action(detail=True, methods=["post"], url_path="request-delivery-return")
    def request_delivery_return(self, request, pk=None):
        service_case = get_object_or_404(_case_queryset(), pk=pk)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = run_service_case_delivery_request(
                service_case,
                notes=serializer.validated_data.get("notes", ""),
                request=request,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        payload = ServiceDeskCaseSerializer(result["service_case"], context=self.get_serializer_context())
        return Response({"updated": result["updated"], "service_case": payload.data})

    @action(detail=True, methods=["post"], url_path="complete-delivery-return")
    def complete_delivery_return(self, request, pk=None):
        service_case = get_object_or_404(_case_queryset(), pk=pk)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = run_service_case_delivery_complete(
                service_case,
                notes=serializer.validated_data.get("notes", ""),
                request=request,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        payload = ServiceDeskCaseSerializer(result["service_case"], context=self.get_serializer_context())
        return Response({"updated": result["updated"], "service_case": payload.data})

    @action(detail=True, methods=["post"], url_path="post-credit-note")
    def post_credit_note(self, request, pk=None):
        service_case = get_object_or_404(_case_queryset(), pk=pk)
        try:
            result = run_service_case_credit_note_post(service_case, request=request)
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        payload = ServiceDeskCaseSerializer(result["service_case"], context=self.get_serializer_context())
        return Response(
            {
                "service_case": payload.data,
                "credit_note_id": result["credit_note_id"],
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="post-debit-note")
    def post_debit_note(self, request, pk=None):
        service_case = get_object_or_404(_case_queryset(), pk=pk)
        try:
            result = run_service_case_debit_note_post(service_case, request=request)
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        payload = ServiceDeskCaseSerializer(result["service_case"], context=self.get_serializer_context())
        return Response(
            {
                "service_case": payload.data,
                "debit_note_id": result["debit_note_id"],
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="link-replacement-sale")
    def link_replacement_sale(self, request, pk=None):
        service_case = get_object_or_404(_case_queryset(), pk=pk)
        serializer = self.get_serializer(
            data=request.data,
            context={"case": service_case, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        try:
            linked_case = serializer.save()
        except ValueError as exc:
            raise serializers.ValidationError({"replacement_direct_sale": str(exc)}) from exc
        payload = ServiceDeskCaseSerializer(linked_case, context=self.get_serializer_context())
        return Response({"updated": True, "service_case": payload.data})
