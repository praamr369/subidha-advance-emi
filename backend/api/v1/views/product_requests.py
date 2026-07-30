from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.pagination import build_paginated_payload
from api.v1.permissions import IsAdmin, IsCustomer, IsPartner
from api.v1.serializers.product_request import (
    AdminProductRequestCancelSerializer,
    AdminProductRequestEditSerializer,
    CustomerProductRequestCreateSerializer,
    PartnerProductRequestCreateSerializer,
    ProductRequestDecisionSerializer,
    ProductRequestReadSerializer,
)
from api.v1.views.customer import _get_customer_or_404_response
from api.v1.views.partner_dashboard import (
    _get_partner_user,
    _partner_customer_queryset,
    _serialize_partner_customers,
)
from subscriptions.models import Customer, ProductRequest
from subscriptions.services.product_request_service import (
    approve_product_request_for_admin,
    cancel_product_request,
    cancel_product_request_for_admin,
    create_customer_product_request,
    create_partner_product_request,
    edit_product_request_for_admin,
    reject_product_request_for_admin,
    product_request_base_queryset,
    get_product_stock_status,
)
from api.v1.views.subscription_requests import (
    _request_options_payload,
    _serialize_admin_customer_options,
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
    return product_request_base_queryset()


def _reload_request_for_response(request_id: int) -> ProductRequest:
    return _request_queryset_for_response().get(pk=request_id)


class CustomerProductRequestOptionsView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request):
        return Response(_request_options_payload(request))


class CustomerProductRequestListView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request):
        customer, err_resp = _get_customer_or_404_response(request)
        if err_resp:
            return err_resp

        qs = _request_queryset_for_response().filter(requester=request.user)
        return Response(
            build_paginated_payload(
                request,
                qs,
                lambda items: ProductRequestReadSerializer(
                    items, many=True, context={"request": request}
                ).data,
            )
        )

    @transaction.atomic
    def post(self, request):
        customer, err_resp = _get_customer_or_404_response(request)
        if err_resp:
            return err_resp

        serializer = CustomerProductRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            req_obj = create_customer_product_request(
                customer=customer,
                requester=request.user,
                product=serializer.validated_data["product"],
                request_type=serializer.validated_data["request_type"],
                batch=serializer.validated_data.get("batch"),
                preferred_lucky_number=serializer.validated_data.get("preferred_lucky_number"),
                notes=serializer.validated_data.get("notes", ""),
            )
            resp_serializer = ProductRequestReadSerializer(
                _reload_request_for_response(req_obj.id),
                context={"request": request},
            )
            return Response(resp_serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response(_validation_error_payload(e), status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class CustomerProductRequestCancelView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    @transaction.atomic
    def post(self, request, pk):
        try:
            req_obj = cancel_product_request(request_id=pk, user=request.user)
            resp_serializer = ProductRequestReadSerializer(
                _reload_request_for_response(req_obj.id),
                context={"request": request},
            )
            return Response(resp_serializer.data)
        except ProductRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except ValidationError as e:
            return Response(_validation_error_payload(e), status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PartnerProductRequestOptionsView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request):
        partner = _get_partner_user(request.user)
        customer_qs = _partner_customer_queryset(partner)
        return Response(
            _request_options_payload(
                request,
                customer_options=_serialize_partner_customers(customer_qs),
            )
        )


class PartnerProductRequestListView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request):
        partner = _get_partner_user(request.user)
        qs = _request_queryset_for_response().filter(partner=partner)
        return Response(
            build_paginated_payload(
                request,
                qs,
                lambda items: ProductRequestReadSerializer(
                    items, many=True, context={"request": request}
                ).data,
            )
        )

    @transaction.atomic
    def post(self, request):
        partner = _get_partner_user(request.user)
        serializer = PartnerProductRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        customer = None
        if data.get("customer_id"):
            customer = Customer.objects.filter(pk=data["customer_id"]).first()
            if not customer:
                return Response(
                    {"customer_id": "Customer not found."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            req_obj = create_partner_product_request(
                partner=partner,
                product=data["product"],
                request_type=data["request_type"],
                batch=data.get("batch"),
                preferred_lucky_number=data.get("preferred_lucky_number"),
                notes=data.get("notes", ""),
                customer=customer,
                requested_customer_name=data.get("requested_customer_name", ""),
                requested_customer_phone=data.get("requested_customer_phone", ""),
                requested_customer_email=data.get("requested_customer_email", ""),
                requested_customer_address=data.get("requested_customer_address", ""),
                requested_customer_city=data.get("requested_customer_city", ""),
            )
            resp_serializer = ProductRequestReadSerializer(
                _reload_request_for_response(req_obj.id),
                context={"request": request},
            )
            return Response(resp_serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response(_validation_error_payload(e), status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminProductRequestListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = _request_queryset_for_response()
        
        status_param = request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)

        type_param = request.query_params.get("request_type")
        if type_param:
            qs = qs.filter(request_type=type_param)

        search = request.query_params.get("q", "").strip()
        if search:
            if search.isdigit():
                qs = qs.filter(pk=int(search))
            else:
                qs = qs.filter(
                    Q(customer__name__icontains=search)
                    | Q(customer__phone__icontains=search)
                    | Q(requested_customer_name__icontains=search)
                    | Q(requested_customer_phone__icontains=search)
                )

        return Response(
            build_paginated_payload(
                request,
                qs,
                lambda items: ProductRequestReadSerializer(
                    items, many=True, context={"request": request}
                ).data,
            )
        )


class AdminProductRequestOptionsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(
            _request_options_payload(
                request,
                customer_options=_serialize_admin_customer_options(request),
            )
        )


class AdminProductRequestDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        try:
            req_obj = _request_queryset_for_response().get(pk=pk)
            resp_serializer = ProductRequestReadSerializer(
                req_obj,
                context={"request": request},
            )
            return Response(resp_serializer.data)
        except ProductRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminProductRequestDecisionView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        serializer = ProductRequestDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        decision = serializer.validated_data["decision"]
        review_note = serializer.validated_data.get("review_note", "")
        create_crm_lead = request.data.get("create_crm_lead", False)

        try:
            if decision == "APPROVE":
                req_obj = approve_product_request_for_admin(
                    request_id=pk,
                    admin=request.user,
                    review_note=review_note,
                    create_crm_lead=create_crm_lead,
                )
            else:
                req_obj = reject_product_request_for_admin(
                    request_id=pk,
                    admin=request.user,
                    review_note=review_note,
                )

            resp_serializer = ProductRequestReadSerializer(
                _reload_request_for_response(req_obj.id),
                context={"request": request},
            )
            return Response(resp_serializer.data)
        except ProductRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except ValidationError as e:
            return Response(_validation_error_payload(e), status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminProductRequestCancelView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        serializer = AdminProductRequestCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review_note = serializer.validated_data.get("review_note", "")

        try:
            req_obj = cancel_product_request_for_admin(
                request_id=pk,
                admin=request.user,
                review_note=review_note,
            )
            resp_serializer = ProductRequestReadSerializer(
                _reload_request_for_response(req_obj.id),
                context={"request": request},
            )
            return Response(resp_serializer.data)
        except ProductRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except ValidationError as e:
            return Response(_validation_error_payload(e), status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminProductRequestEditView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def patch(self, request, pk):
        serializer = AdminProductRequestEditSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            req_obj = edit_product_request_for_admin(
                request_id=pk,
                admin=request.user,
                **serializer.validated_data,
            )
            resp_serializer = ProductRequestReadSerializer(
                _reload_request_for_response(req_obj.id),
                context={"request": request},
            )
            return Response(resp_serializer.data)
        except ProductRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except ValidationError as e:
            return Response(_validation_error_payload(e), status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminProductRequestStockCheckView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        try:
            req_obj = _request_queryset_for_response().get(pk=pk)
            stock_status = get_product_stock_status(req_obj.product_id)
            return Response(stock_status)
        except ProductRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
