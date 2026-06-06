from __future__ import annotations

from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from accounting.services.accounting_mapping_remediation_service import (
    acknowledge_warning,
    apply_mapping,
    build_mapping_remediation_summary,
    create_missing_mapped_account,
)


class _AdminAccountingMappingRemediationBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class MappingRemediationActionSerializer(serializers.Serializer):
    event_type = serializers.CharField(required=True)
    account_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)


class AccountingMappingRemediationView(_AdminAccountingMappingRemediationBase):
    def get(self, request):
        return Response(build_mapping_remediation_summary(), status=status.HTTP_200_OK)


class AccountingMappingRemediationCreateAccountView(_AdminAccountingMappingRemediationBase):
    def post(self, request):
        serializer = MappingRemediationActionSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        try:
            payload = create_missing_mapped_account(
                event_type=serializer.validated_data["event_type"],
                actor=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(payload, status=status.HTTP_200_OK)


class AccountingMappingRemediationApplyView(_AdminAccountingMappingRemediationBase):
    def post(self, request):
        serializer = MappingRemediationActionSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        try:
            payload = apply_mapping(
                event_type=serializer.validated_data["event_type"],
                account_id=serializer.validated_data.get("account_id"),
                actor=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(payload, status=status.HTTP_200_OK)


class AccountingMappingRemediationAcknowledgeView(_AdminAccountingMappingRemediationBase):
    def post(self, request):
        serializer = MappingRemediationActionSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        payload = acknowledge_warning(
            event_type=serializer.validated_data["event_type"],
            actor=request.user,
        )
        return Response(payload, status=status.HTTP_200_OK)
