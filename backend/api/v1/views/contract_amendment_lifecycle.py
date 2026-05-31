from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin, IsCustomer, IsPartner
from api.v1.serializers.contract_amendments import ContractAmendmentCreateSerializer, ContractAmendmentSerializer
from api.v1.views.contract_amendments import _amendment_queryset, _customer_profile_for, _validation_response
from subscriptions.services.contract_amendment_lifecycle_service import cancel_or_archive_amendment
from subscriptions.services.contract_amendment_service import create_amendment


class AmendmentLifecycleReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(allow_blank=False, trim_whitespace=True)
    action = serializers.ChoiceField(
        choices=["CANCELLED", "ARCHIVED", "VOIDED", "WITHDRAWN"],
        required=False,
        default="CANCELLED",
    )


class AdminContractAmendmentCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = ContractAmendmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            amendment = create_amendment(
                subscription=data.get("subscription"),
                rent_lease_contract=data.get("rent_lease_contract"),
                contract_type=data["contract_type"],
                amendment_type=data["amendment_type"],
                requested_values=data.get("requested_values") or {},
                reason=data["reason"],
                requested_by=request.user,
                requested_role=(request.data.get("requested_role") or "CUSTOMER").strip().upper(),
                admin_note=(request.data.get("admin_note") or "").strip(),
                metadata={**(data.get("metadata") or {}), "requested_channel": "ADMIN_API", "created_on_behalf": True},
            )
            if data.get("effective_date"):
                amendment.effective_date = data["effective_date"]
                amendment.save(update_fields=["effective_date", "updated_at"])
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractAmendmentSerializer(amendment).data, status=status.HTTP_201_CREATED)


class AdminContractAmendmentLifecycleView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AmendmentLifecycleReasonSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        try:
            updated = cancel_or_archive_amendment(
                amendment=amendment,
                actor=request.user,
                reason=serializer.validated_data["reason"],
                action=serializer.validated_data.get("action") or "CANCELLED",
                actor_scope="ADMIN",
            )
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractAmendmentSerializer(updated).data, status=status.HTTP_200_OK)


class CustomerContractAmendmentWithdrawView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    def post(self, request, pk: int):
        customer = _customer_profile_for(request.user)
        if not customer:
            return Response({"detail": "Customer profile not found."}, status=status.HTTP_404_NOT_FOUND)
        amendment = _amendment_queryset().filter(pk=pk, customer=customer).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AmendmentLifecycleReasonSerializer(data={**(request.data or {}), "action": "WITHDRAWN"})
        serializer.is_valid(raise_exception=True)
        try:
            updated = cancel_or_archive_amendment(
                amendment=amendment,
                actor=request.user,
                reason=serializer.validated_data["reason"],
                action="WITHDRAWN",
                actor_scope="CUSTOMER",
            )
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractAmendmentSerializer(updated).data, status=status.HTTP_200_OK)


class PartnerContractAmendmentWithdrawView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsPartner]

    def post(self, request, pk: int):
        amendment = _amendment_queryset().filter(pk=pk).filter(
            serializers.models.Q(partner=request.user)
            | serializers.models.Q(subscription__partner=request.user)
            | serializers.models.Q(rent_lease_contract__partner=request.user)
        ).first()
        if not amendment:
            return Response({"detail": "Amendment not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AmendmentLifecycleReasonSerializer(data={**(request.data or {}), "action": "WITHDRAWN"})
        serializer.is_valid(raise_exception=True)
        try:
            updated = cancel_or_archive_amendment(
                amendment=amendment,
                actor=request.user,
                reason=serializer.validated_data["reason"],
                action="WITHDRAWN",
                actor_scope="PARTNER",
            )
        except DjangoValidationError as exc:
            return _validation_response(exc)
        return Response(ContractAmendmentSerializer(updated).data, status=status.HTTP_200_OK)
