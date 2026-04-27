from __future__ import annotations

from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import FinanceAccountCoaMapping
from accounting.services.accounting_setup_service import AccountingSetupService
from api.v1.permissions import IsAdmin
from api.v1.serializers.accounting import FinanceAccountCoaMappingSerializer
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AccountingSetupStatusView(_AdminBase):
    def get(self, request):
        return Response(AccountingSetupService.validate_accounting_setup())


class AccountingSetupBootstrapSerializer(serializers.Serializer):
    dry_run = serializers.BooleanField(required=False, default=False)


class AccountingSetupBootstrapView(_AdminBase):
    def post(self, request):
        serializer = AccountingSetupBootstrapSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        payload = AccountingSetupService.bootstrap(
            actor=request.user,
            dry_run=serializer.validated_data["dry_run"],
        )
        return Response(payload, status=status.HTTP_200_OK)


class FinanceAccountMappingListCreateView(_AdminBase):
    def get(self, request):
        queryset = FinanceAccountCoaMapping.objects.select_related("finance_account", "chart_account").order_by("purpose", "-is_default", "-is_active", "id")
        return Response(
            {
                "count": queryset.count(),
                "results": FinanceAccountCoaMappingSerializer(queryset, many=True).data,
            }
        )

    def post(self, request):
        serializer = FinanceAccountCoaMappingSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(created_by=request.user, updated_by=request.user)
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=instance,
            performed_by=request.user,
            metadata={"event": "ACCOUNTING_SETUP_MAPPING_CREATED", "purpose": instance.purpose},
        )
        return Response(FinanceAccountCoaMappingSerializer(instance).data, status=status.HTTP_201_CREATED)


class FinanceAccountMappingPatchView(_AdminBase):
    def patch(self, request, pk):
        instance = FinanceAccountCoaMapping.objects.filter(pk=pk).first()
        if instance is None:
            raise serializers.ValidationError({"detail": "Mapping not found."})
        serializer = FinanceAccountCoaMappingSerializer(instance, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(updated_by=request.user)
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=instance,
            performed_by=request.user,
            metadata={"event": "ACCOUNTING_SETUP_MAPPING_UPDATED", "purpose": instance.purpose},
        )
        return Response(FinanceAccountCoaMappingSerializer(instance).data)


class AccountingMappingSuggestionsView(_AdminBase):
    def get(self, request):
        warnings = AccountingSetupService.get_setup_warnings()
        return Response(
            {
                "suggestions": AccountingSetupService.create_default_mappings(actor=request.user, dry_run=True).__dict__,
                "warnings": warnings,
            }
        )
