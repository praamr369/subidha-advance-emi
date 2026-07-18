from __future__ import annotations

from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.pagination import build_paginated_payload
from api.v1.permissions import IsCustomer, IsAdmin
from api.v1.serializers.online_request import (
    OnlineRequestListSerializer,
    OnlineRequestDetailSerializer,
    OnlineRequestCreateSerializer,
    OnlineRequestQuoteSerializer,
    OnlineRequestApprovalSerializer,
)
from subscriptions.models_online_request import OnlineRequest
from subscriptions.services.online_request_service import (
    online_request_base_queryset,
    create_online_request,
    generate_quote,
    send_quote,
    accept_quote,
    approve_online_request,
    reject_online_request,
    cancel_online_request,
    complete_online_request,
)
from api.v1.views.customer import _get_customer_or_404_response


class CustomerRequestListView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request):
        customer, err_resp = _get_customer_or_404_response(request)
        if err_resp:
            return err_resp

        status_filter = request.query_params.get('status')
        qs = online_request_base_queryset().filter(customer=customer)

        if status_filter:
            qs = qs.filter(status=status_filter)

        return Response(
            build_paginated_payload(
                request,
                qs,
                lambda items: OnlineRequestListSerializer(
                    items, many=True, context={'request': request}
                ).data,
            )
        )

    @transaction.atomic
    def post(self, request):
        customer, err_resp = _get_customer_or_404_response(request)
        if err_resp:
            return err_resp

        serializer = OnlineRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            req_obj = create_online_request(
                customer=customer,
                product_id=serializer.validated_data['product'].id,
                request_type=serializer.validated_data['request_type'],
                quantity=serializer.validated_data.get('quantity', 1),
                preferred_tenure=serializer.validated_data.get('preferred_tenure'),
                preferred_lucky_number=serializer.validated_data.get('preferred_lucky_number'),
                batch=serializer.validated_data.get('batch'),
            )
            resp_serializer = OnlineRequestDetailSerializer(
                online_request_base_queryset().get(pk=req_obj.id),
                context={'request': request},
            )
            return Response(resp_serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class CustomerRequestDetailView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request, pk):
        customer, err_resp = _get_customer_or_404_response(request)
        if err_resp:
            return err_resp

        try:
            req_obj = online_request_base_queryset().get(pk=pk, customer=customer)
            serializer = OnlineRequestDetailSerializer(req_obj, context={'request': request})
            return Response(serializer.data)
        except OnlineRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)


class CustomerRequestGenerateQuoteView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    @transaction.atomic
    def post(self, request, pk):
        customer, err_resp = _get_customer_or_404_response(request)
        if err_resp:
            return err_resp

        try:
            req_obj = online_request_base_queryset().select_for_update().get(
                pk=pk, customer=customer
            )
            quote_data = generate_quote(
                request_id=pk,
                discount_amount=request.data.get('discount_amount', 0),
                delivery_cost=request.data.get('delivery_cost', 0),
            )
            return Response(quote_data)
        except OnlineRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class CustomerRequestAcceptQuoteView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]

    @transaction.atomic
    def post(self, request, pk):
        customer, err_resp = _get_customer_or_404_response(request)
        if err_resp:
            return err_resp

        try:
            req_obj = accept_quote(request_id=pk, accepted_by=request.user)
            serializer = OnlineRequestDetailSerializer(
                online_request_base_queryset().get(pk=req_obj.id),
                context={'request': request},
            )
            return Response(serializer.data)
        except OnlineRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminRequestListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        status_filter = request.query_params.get('status')
        request_type_filter = request.query_params.get('request_type')
        search = request.query_params.get('q', '').strip()

        qs = online_request_base_queryset()

        if status_filter:
            qs = qs.filter(status=status_filter)
        if request_type_filter:
            qs = qs.filter(request_type=request_type_filter)
        if search:
            qs = qs.filter(request_number__icontains=search)

        return Response(
            build_paginated_payload(
                request,
                qs,
                lambda items: OnlineRequestListSerializer(
                    items, many=True, context={'request': request}
                ).data,
            )
        )


class AdminRequestDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        try:
            req_obj = online_request_base_queryset().get(pk=pk)
            serializer = OnlineRequestDetailSerializer(req_obj, context={'request': request})
            return Response(serializer.data)
        except OnlineRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)


class AdminGenerateQuoteView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        serializer = OnlineRequestQuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            quote_data = generate_quote(
                request_id=pk,
                discount_amount=serializer.validated_data.get('discount_amount', 0),
                delivery_cost=serializer.validated_data.get('delivery_cost', 0),
                performed_by=request.user,
            )
            return Response(quote_data)
        except OnlineRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminSendQuoteView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        try:
            req_obj = send_quote(request_id=pk, performed_by=request.user)
            serializer = OnlineRequestDetailSerializer(
                online_request_base_queryset().get(pk=req_obj.id),
                context={'request': request},
            )
            return Response(serializer.data)
        except OnlineRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminApproveRequestView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        serializer = OnlineRequestApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            req_obj, transaction_obj = approve_online_request(
                request_id=pk,
                approved_by=request.user,
                approval_notes=serializer.validated_data.get('approval_notes', ''),
                create_transaction=serializer.validated_data.get('create_transaction', True),
            )
            resp_serializer = OnlineRequestDetailSerializer(
                online_request_base_queryset().get(pk=req_obj.id),
                context={'request': request},
            )
            return Response(resp_serializer.data)
        except OnlineRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminRejectRequestView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        try:
            req_obj = reject_online_request(
                request_id=pk,
                rejected_by=request.user,
                rejection_reason=request.data.get('reason', ''),
            )
            serializer = OnlineRequestDetailSerializer(
                online_request_base_queryset().get(pk=req_obj.id),
                context={'request': request},
            )
            return Response(serializer.data)
        except OnlineRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminCompleteRequestView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        try:
            req_obj = complete_online_request(
                request_id=pk,
                completed_by=request.user,
                completion_notes=request.data.get('notes', ''),
            )
            serializer = OnlineRequestDetailSerializer(
                online_request_base_queryset().get(pk=req_obj.id),
                context={'request': request},
            )
            return Response(serializer.data)
        except OnlineRequest.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
