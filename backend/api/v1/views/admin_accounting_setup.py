from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import ChartOfAccount, FinanceAccount, FinanceAccountCoaMapping
from accounting.services.finance_account_readiness import (
    chart_account_allowed_for_collection,
    finance_account_readiness,
)
from accounting.services.accounting_setup_service import AccountingSetupService
from accounting.services.accounting_setup_status import get_admin_accounting_setup_status
from accounting.services.master_edit_service import AccountingMasterUpdateService
from accounting.services.setup_defaults_service import (
    apply_accounting_setup_defaults,
    preview_accounting_setup_defaults,
)
from accounting.services.setup_health_service import get_accounting_setup_health
from api.v1.permissions import IsAdmin
from api.v1.serializers.accounting import FinanceAccountCoaMappingSerializer
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AccountingSetupStatusView(_AdminBase):
    def get(self, request):
        return Response(get_admin_accounting_setup_status())


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


class AccountingSetupHealthView(_AdminBase):
    def get(self, request):
        return Response(get_accounting_setup_health())


class AccountingSetupReadinessView(_AdminBase):
    def get(self, request):
        finance_accounts = list(
            FinanceAccount.objects.select_related("chart_account", "branch").order_by("kind", "name", "id")
        )
        chart_accounts = list(
            ChartOfAccount.objects.select_related("parent").prefetch_related("children").order_by("code", "id")
        )

        finance_rows = []
        ready_counts = {"CASH": 0, "BANK": 0, "UPI": 0}
        blockers_count = 0
        warnings_count = 0

        for account in finance_accounts:
            readiness = finance_account_readiness(account)
            if readiness.collection_ready:
                ready_counts[account.kind] = ready_counts.get(account.kind, 0) + 1
            else:
                blockers_count += 1
            chart_account = getattr(account, "chart_account", None)
            finance_rows.append(
                {
                    "id": account.id,
                    "name": account.name,
                    "code": f"FA-{account.id}",
                    "kind": account.kind,
                    "branch": (
                        {
                            "id": account.branch_id,
                            "code": getattr(account.branch, "code", None),
                            "name": getattr(account.branch, "name", None),
                        }
                        if account.branch_id
                        else None
                    ),
                    "mapped_chart_account": (
                        {
                            "id": chart_account.id,
                            "code": chart_account.code,
                            "name": chart_account.name,
                            "type": chart_account.account_type,
                            "is_posting": chart_account_allowed_for_collection(chart_account),
                        }
                        if chart_account is not None
                        else None
                    ),
                    "collection_ready": readiness.collection_ready,
                    "blocker_reason": readiness.collection_blocker_reason,
                    "collection_blocker_reason": readiness.collection_blocker_reason,
                    "recommended_action": readiness.recommended_action,
                }
            )

        chart_rows = []
        for account in chart_accounts:
            is_posting = chart_account_allowed_for_collection(account)
            is_asset = account.account_type == "ASSET"
            chart_rows.append(
                {
                    "id": account.id,
                    "code": account.code,
                    "name": account.name,
                    "type": account.account_type,
                    "account_type": account.account_type,
                    "is_posting": is_posting,
                    "allow_manual_posting": account.allow_manual_posting,
                    "is_active": account.is_active,
                    "parent": (
                        {
                            "id": account.parent_id,
                            "code": getattr(account.parent, "code", None),
                            "name": getattr(account.parent, "name", None),
                        }
                        if account.parent_id
                        else None
                    ),
                    "allowed_for_cash_collection": bool(is_posting and is_asset),
                    "allowed_for_bank_collection": bool(is_posting and is_asset),
                    "allowed_for_upi_collection": bool(is_posting and is_asset),
                }
            )

        return Response(
            {
                "finance_accounts": finance_rows,
                "chart_accounts": chart_rows,
                "summary": {
                    "cash_accounts_ready_count": ready_counts.get("CASH", 0),
                    "bank_accounts_ready_count": ready_counts.get("BANK", 0),
                    "upi_accounts_ready_count": ready_counts.get("UPI", 0),
                    "blockers_count": blockers_count,
                    "warnings_count": warnings_count,
                },
            }
        )


class AccountingSetupDefaultsPreviewView(_AdminBase):
    def post(self, request):
        return Response(preview_accounting_setup_defaults(), status=status.HTTP_200_OK)


class AccountingSetupDefaultsApplySerializer(serializers.Serializer):
    confirm = serializers.BooleanField(required=True)


class AccountingSetupDefaultsApplyView(_AdminBase):
    def post(self, request):
        serializer = AccountingSetupDefaultsApplySerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data.get("confirm"):
            raise serializers.ValidationError({"confirm": "Confirm must be true to apply defaults."})
        payload = apply_accounting_setup_defaults(performed_by=request.user)
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


class FinanceAccountPrimaryMappingPatchSerializer(serializers.Serializer):
    chart_account_id = serializers.IntegerField(min_value=1)


class FinanceAccountPrimaryMappingPatchView(_AdminBase):
    def patch(self, request, pk):
        serializer = FinanceAccountPrimaryMappingPatchSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)

        finance_account = FinanceAccount.objects.select_related("chart_account").filter(pk=pk).first()
        if finance_account is None:
            raise serializers.ValidationError({"detail": "Finance account not found."})

        chart_account = ChartOfAccount.objects.prefetch_related("children").filter(
            pk=serializer.validated_data["chart_account_id"],
        ).first()
        if chart_account is None:
            raise serializers.ValidationError({"chart_account_id": "Chart account not found."})
        if not chart_account_allowed_for_collection(chart_account, kind=finance_account.kind):
            raise serializers.ValidationError(
                {
                    "chart_account_id": (
                        "Target chart account must be an active posting-enabled leaf ASSET account."
                    )
                }
            )

        try:
            with transaction.atomic():
                updated = AccountingMasterUpdateService.update_finance_account(
                    account=finance_account,
                    payload={"chart_account": chart_account},
                    actor=request.user,
                )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc

        readiness = finance_account_readiness(updated)
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=updated,
            performed_by=request.user,
            metadata={
                "event": "FINANCE_ACCOUNT_PRIMARY_CHART_MAPPING_UPDATED",
                "finance_account_id": updated.id,
                "chart_account_id": updated.chart_account_id,
            },
        )
        return Response(
            {
                "id": updated.id,
                "chart_account_id": updated.chart_account_id,
                "collection_ready": readiness.collection_ready,
                "collection_blocker_reason": readiness.collection_blocker_reason,
                "recommended_action": readiness.recommended_action,
            },
            status=status.HTTP_200_OK,
        )


class AccountingMappingSuggestionsView(_AdminBase):
    def get(self, request):
        warnings = AccountingSetupService.get_setup_warnings()
        return Response(
            {
                "suggestions": AccountingSetupService.create_default_mappings(actor=request.user, dry_run=True).__dict__,
                "repair_preview": AccountingSetupService.repair_suggested_mappings(actor=request.user, dry_run=True),
                "warnings": warnings,
            }
        )


class AccountingRepairSuggestedMappingsSerializer(serializers.Serializer):
    dry_run = serializers.BooleanField(required=False, default=False)


class AccountingRepairSuggestedMappingsView(_AdminBase):
    def post(self, request):
        serializer = AccountingRepairSuggestedMappingsSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        payload = AccountingSetupService.repair_suggested_mappings(
            actor=request.user,
            dry_run=serializer.validated_data["dry_run"],
        )
        return Response(payload, status=status.HTTP_200_OK)
