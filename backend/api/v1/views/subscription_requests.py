from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.pagination import build_paginated_payload
from api.v1.permissions import IsAdmin, IsCustomer, IsPartner
from api.v1.serializers.media import serialize_media_url
from api.v1.serializers.subscription_request import (
    CustomerSubscriptionRequestCreateSerializer,
    PartnerSubscriptionRequestCreateSerializer,
    SubscriptionRequestApprovalSerializer,
    SubscriptionRequestDecisionSerializer,
    SubscriptionRequestReadSerializer,
)
from api.v1.views.customer import _get_customer_or_404_response
from api.v1.views.partner_dashboard import (
    _get_partner_user,
    _partner_customer_queryset,
    _serialize_partner_customers,
)
from subscriptions.models import Customer, LuckyIdStatus, SubscriptionRequest
from subscriptions.services.subscription_request_service import (
    approve_subscription_request,
    available_lucky_numbers_for_batch,
    cancel_subscription_request,
    create_customer_subscription_request,
    create_partner_subscription_request,
    reject_subscription_request,
    requestable_batch_queryset,
    requestable_product_queryset,
    subscription_request_base_queryset,
    subscription_request_lock_queryset,
)


def _validation_error_payload(exc: Exception) -> dict:
    if isinstance(exc, ValidationError):
        if hasattr(exc, "message_dict"):
            return exc.message_dict
        if getattr(exc, "messages", None):
            messages = exc.messages
            if len(messages) == 1:
                return {"detail": messages[0]}
            return {"detail": messages}
    return {"detail": str(exc)}


def _request_queryset_for_response():
    return subscription_request_base_queryset()


def _reload_request_for_response(request_id: int) -> SubscriptionRequest:
    return _request_queryset_for_response().get(pk=request_id)


def _batch_param(request) -> str:
    return (
        (request.query_params.get("batch") or "").strip()
        or (request.query_params.get("batch_id") or "").strip()
    )


def _serialize_request_products(request):
    products = requestable_product_queryset()
    return [
        {
            "id": product.id,
            "name": product.name,
            "product_code": product.product_code,
            "base_price": str(product.base_price),
            "image": serialize_media_url(request, getattr(product, "image", None)),
        }
        for product in products
    ]


def _serialize_request_batches():
    batches = requestable_batch_queryset().annotate(
        available_slots=Count(
            "lucky_ids",
            filter=Q(lucky_ids__status=LuckyIdStatus.AVAILABLE),
        )
    )
    return [
        {
            "id": batch.id,
            "batch_code": batch.batch_code,
            "duration_months": batch.duration_months,
            "available_slots": batch.available_slots,
            "start_date": batch.start_date,
            "status": batch.status,
        }
        for batch in batches
    ]


def _serialize_lucky_numbers(request):
    batch_value = _batch_param(request)
    if not batch_value or not batch_value.isdigit():
        return []

    batch = requestable_batch_queryset().filter(pk=int(batch_value)).first()
    if batch is None:
        return []
    return available_lucky_numbers_for_batch(batch)


def _serialize_admin_customer_options(request):
    queryset = Customer.objects.select_related("user").order_by("-created_at", "-id")
    search = (request.query_params.get("customer_q") or request.query_params.get("q") or "").strip()
    if search:
        queryset = queryset.filter(
            Q(name__icontains=search)
            | Q(phone__icontains=search)
            | Q(user__email__icontains=search)
            | Q(user__username__icontains=search)
        )
    queryset = queryset[:20]
    return [
        {
            "id": customer.id,
            "name": customer.name,
            "phone": customer.phone,
            "email": getattr(customer.user, "email", "") or "",
            "kyc_status": customer.kyc_status,
        }
        for customer in queryset
    ]


def _request_options_payload(request, *, customer_options=None):
    payload = {
        "products": _serialize_request_products(request),
        "batches": _serialize_request_batches(),
        "lucky_numbers": _serialize_lucky_numbers(request),
    }
    if customer_options is not None:
        payload["customers"] = customer_options
    return payload


class CustomerSubscriptionRequestOptionsView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response
        return Response(_request_options_payload(request))


class CustomerSubscriptionRequestListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        queryset = _request_queryset_for_response().filter(
            requester=request.user,
            customer=customer,
        )

        status_filter = (request.query_params.get("status") or "").strip().upper()
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        payload = build_paginated_payload(
            request,
            queryset,
            serializer=lambda items: SubscriptionRequestReadSerializer(
                items,
                many=True,
                context={"request": request},
            ).data,
        )
        return Response(payload)

    def post(self, request):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        serializer = CustomerSubscriptionRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            request_obj = create_customer_subscription_request(
                customer=customer,
                requester=request.user,
                product=serializer.validated_data["product"],
                batch=serializer.validated_data["batch"],
                preferred_lucky_number=serializer.validated_data["preferred_lucky_number"],
                notes=serializer.validated_data.get("notes") or "",
            )
        except ValidationError as exc:
            return Response(
                _validation_error_payload(exc),
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "detail": "Subscription request submitted successfully.",
                "request": SubscriptionRequestReadSerializer(
                    request_obj,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )


class CustomerSubscriptionRequestDetailView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request, pk):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        request_obj = _request_queryset_for_response().filter(
            pk=pk,
            requester=request.user,
            customer=customer,
        ).first()
        if request_obj is None:
            return Response(
                {"detail": "Subscription request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            SubscriptionRequestReadSerializer(
                request_obj,
                context={"request": request},
            ).data
        )


class CustomerSubscriptionRequestCancelView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    @transaction.atomic
    def post(self, request, pk):
        customer, error_response = _get_customer_or_404_response(request)
        if error_response is not None:
            return error_response

        request_obj = (
            subscription_request_lock_queryset()
            .select_for_update()
            .filter(
                pk=pk,
                requester=request.user,
                customer=customer,
            )
            .first()
        )
        if request_obj is None:
            return Response(
                {"detail": "Subscription request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            cancel_subscription_request(
                request_obj=request_obj,
                performed_by=request.user,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_obj = _reload_request_for_response(request_obj.id)
        return Response(
            {
                "detail": "Subscription request cancelled successfully.",
                "request": SubscriptionRequestReadSerializer(
                    response_obj,
                    context={"request": request},
                ).data,
            }
        )


class PartnerSubscriptionRequestOptionsView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request):
        partner = _get_partner_user(request)
        search = (request.query_params.get("customer_q") or "").strip()
        customers = _partner_customer_queryset(partner)
        if search:
            customers = customers.filter(
                Q(name__icontains=search) | Q(phone__icontains=search)
            )
        return Response(
            _request_options_payload(
                request,
                customer_options=_serialize_partner_customers(customers[:20]),
            )
        )


class PartnerSubscriptionRequestListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request):
        partner = _get_partner_user(request)
        queryset = _request_queryset_for_response().filter(partner=partner)

        status_filter = (request.query_params.get("status") or "").strip().upper()
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        payload = build_paginated_payload(
            request,
            queryset,
            serializer=lambda items: SubscriptionRequestReadSerializer(
                items,
                many=True,
                context={"request": request},
            ).data,
        )
        return Response(payload)

    def post(self, request):
        partner = _get_partner_user(request)
        serializer = PartnerSubscriptionRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        customer = None
        customer_id = serializer.validated_data.get("customer_id")
        if customer_id is not None:
            customer = _partner_customer_queryset(partner).filter(pk=customer_id).first()
            if customer is None:
                return Response(
                    {"detail": "Customer not found for current partner."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        try:
            request_obj = create_partner_subscription_request(
                partner=partner,
                customer=customer,
                product=serializer.validated_data["product"],
                batch=serializer.validated_data["batch"],
                preferred_lucky_number=serializer.validated_data["preferred_lucky_number"],
                notes=serializer.validated_data.get("notes") or "",
                requested_customer_name=serializer.validated_data.get("requested_customer_name") or "",
                requested_customer_phone=serializer.validated_data.get("requested_customer_phone") or "",
                requested_customer_email=serializer.validated_data.get("requested_customer_email") or "",
                requested_customer_address=serializer.validated_data.get("requested_customer_address") or "",
                requested_customer_city=serializer.validated_data.get("requested_customer_city") or "",
            )
        except ValidationError as exc:
            return Response(
                _validation_error_payload(exc),
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "detail": "Subscription request submitted successfully.",
                "request": SubscriptionRequestReadSerializer(
                    request_obj,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )


class PartnerSubscriptionRequestDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request, pk):
        partner = _get_partner_user(request)
        request_obj = _request_queryset_for_response().filter(
            pk=pk,
            partner=partner,
        ).first()
        if request_obj is None:
            return Response(
                {"detail": "Subscription request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            SubscriptionRequestReadSerializer(
                request_obj,
                context={"request": request},
            ).data
        )


class PartnerSubscriptionRequestCancelView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    @transaction.atomic
    def post(self, request, pk):
        partner = _get_partner_user(request)
        request_obj = (
            subscription_request_lock_queryset()
            .select_for_update()
            .filter(pk=pk, partner=partner)
            .first()
        )
        if request_obj is None:
            return Response(
                {"detail": "Subscription request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            cancel_subscription_request(
                request_obj=request_obj,
                performed_by=request.user,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_obj = _reload_request_for_response(request_obj.id)
        return Response(
            {
                "detail": "Subscription request cancelled successfully.",
                "request": SubscriptionRequestReadSerializer(
                    response_obj,
                    context={"request": request},
                ).data,
            }
        )


class AdminSubscriptionRequestOptionsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(
            _request_options_payload(
                request,
                customer_options=_serialize_admin_customer_options(request),
            )
        )


class AdminSubscriptionRequestListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = _request_queryset_for_response()

        status_filter = (request.query_params.get("status") or "").strip().upper()
        requester_role = (request.query_params.get("requester_role") or "").strip().upper()
        q = (request.query_params.get("q") or "").strip()

        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if requester_role:
            queryset = queryset.filter(requester_role_snapshot=requester_role)
        if q:
            search_filter = (
                Q(requested_customer_name__icontains=q)
                | Q(requested_customer_phone__icontains=q)
                | Q(requested_customer_email__icontains=q)
                | Q(product__name__icontains=q)
                | Q(product__product_code__icontains=q)
                | Q(batch__batch_code__icontains=q)
            )
            if q.isdigit():
                search_filter = (
                    search_filter
                    | Q(id=int(q))
                    | Q(customer_id=int(q))
                    | Q(partner_id=int(q))
                    | Q(approved_subscription_id=int(q))
                )
            queryset = queryset.filter(search_filter).distinct()

        payload = build_paginated_payload(
            request,
            queryset,
            serializer=lambda items: SubscriptionRequestReadSerializer(
                items,
                many=True,
                context={"request": request},
            ).data,
        )
        return Response(payload)


class AdminSubscriptionRequestDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        request_obj = _request_queryset_for_response().filter(pk=pk).first()
        if request_obj is None:
            return Response(
                {"detail": "Subscription request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            SubscriptionRequestReadSerializer(
                request_obj,
                context={"request": request},
            ).data
        )


class AdminSubscriptionRequestApproveView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        request_obj = (
            subscription_request_lock_queryset()
            .select_for_update()
            .filter(pk=pk)
            .first()
        )
        if request_obj is None:
            return Response(
                {"detail": "Subscription request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = SubscriptionRequestApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        customer = None
        customer_id = serializer.validated_data.get("customer_id")
        if customer_id is not None:
            customer = Customer.objects.select_related("user").filter(pk=customer_id).first()
            if customer is None:
                return Response(
                    {"detail": "Customer not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        try:
            approve_subscription_request(
                request_obj=request_obj,
                performed_by=request.user,
                customer=customer,
                create_customer=serializer.validated_data.get("create_customer", False),
                lucky_number_override=serializer.validated_data.get("lucky_number_override"),
                review_note=serializer.validated_data.get("review_note") or "",
            )
        except (ValidationError, ValueError) as exc:
            return Response(
                _validation_error_payload(exc),
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_obj = _reload_request_for_response(request_obj.id)
        return Response(
            {
                "detail": "Subscription request approved successfully.",
                "result": SubscriptionRequestReadSerializer(
                    response_obj,
                    context={"request": request},
                ).data,
            }
        )


class AdminSubscriptionRequestRejectView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        request_obj = (
            subscription_request_lock_queryset()
            .select_for_update()
            .filter(pk=pk)
            .first()
        )
        if request_obj is None:
            return Response(
                {"detail": "Subscription request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = SubscriptionRequestDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            reject_subscription_request(
                request_obj=request_obj,
                performed_by=request.user,
                review_note=serializer.get_note(),
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_obj = _reload_request_for_response(request_obj.id)
        return Response(
            {
                "detail": "Subscription request rejected successfully.",
                "result": SubscriptionRequestReadSerializer(
                    response_obj,
                    context={"request": request},
                ).data,
            }
        )
