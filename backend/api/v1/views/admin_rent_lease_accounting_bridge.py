from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import connection
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, RentLeaseAccountingAccountMapping
from api.v1.permissions import IsAdmin
from subscriptions.services import rent_lease_accounting_posting_service as bridge
from subscriptions.services.rent_lease_finance_sync_service import (
    ensure_premade_rent_lease_accounting_setup,
    get_active_account_mapping,
)
from subscriptions.services.rent_lease_posting_bridge_config_service import (
    disable_rent_lease_posting_bridge,
    enable_rent_lease_posting_bridge,
    get_rent_lease_posting_bridge_state,
)


def _error(exc: Exception) -> Response:
    detail = getattr(exc, "message_dict", None) or getattr(exc, "messages", None) or str(exc)
    return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)


def _clean_error_response(detail: str, field_errors: dict[str, list[str] | str], *, status_code=status.HTTP_400_BAD_REQUEST) -> Response:
    normalized = {
        field: messages if isinstance(messages, list) else [str(messages)]
        for field, messages in field_errors.items()
    }
    return Response({"detail": detail, "field_errors": normalized}, status=status_code)


def _account(pk, field: str, expected: str) -> ChartOfAccount:
    account = ChartOfAccount.objects.filter(pk=int(pk or 0), is_active=True).first()
    if account is None:
        raise ValidationError({field: "Active chart account is required."})
    if account.account_type != expected:
        raise ValidationError({field: f"Account must be {expected}."})
    return account


def _mapping_payload() -> dict | None:
    mapping = get_active_account_mapping(auto_create=False)
    if mapping is None:
        return None
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT customer_advance_liability_account_id, rent_income_account_id, lease_income_account_id
            FROM accounting_rent_lease_account_mappings WHERE id = %s
            """,
            [mapping.id],
        )
        extra = cursor.fetchone() or (None, None, None)
    return {
        "id": mapping.id,
        "monthly_income_account_id": mapping.monthly_income_account_id,
        "monthly_income_account_code": mapping.monthly_income_account.code,
        "monthly_income_account_name": mapping.monthly_income_account.name,
        "monthly_income_account_type": mapping.monthly_income_account.account_type,
        "deposit_liability_account_id": mapping.deposit_liability_account_id,
        "deposit_liability_account_code": mapping.deposit_liability_account.code,
        "deposit_liability_account_name": mapping.deposit_liability_account.name,
        "deposit_liability_account_type": mapping.deposit_liability_account.account_type,
        "deposit_refund_account_id": mapping.deposit_refund_account_id,
        "deposit_refund_account_code": mapping.deposit_refund_account.code,
        "deposit_refund_account_name": mapping.deposit_refund_account.name,
        "deposit_refund_account_type": mapping.deposit_refund_account.account_type,
        "damage_recovery_income_account_id": mapping.damage_recovery_income_account_id,
        "damage_recovery_income_account_code": mapping.damage_recovery_income_account.code,
        "damage_recovery_income_account_name": mapping.damage_recovery_income_account.name,
        "damage_recovery_income_account_type": mapping.damage_recovery_income_account.account_type,
        "settlement_finance_account_id": mapping.settlement_finance_account_id,
        "settlement_finance_account_name": mapping.settlement_finance_account.name if mapping.settlement_finance_account_id else None,
        "customer_advance_liability_account_id": extra[0],
        "rent_income_account_id": extra[1],
        "lease_income_account_id": extra[2],
        "notes": mapping.notes,
        "is_active": mapping.is_active,
    }


class AdminAccountingReadinessView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(bridge.get_rent_lease_accounting_readiness())


class AdminRentLeasePostingBridgeConfigView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        readiness = bridge.get_rent_lease_accounting_readiness()
        state = get_rent_lease_posting_bridge_state(readiness=readiness)
        return Response({"config": state["config"], "readiness": readiness})


class AdminRentLeasePostingBridgeEnableView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        try:
            return Response(
                enable_rent_lease_posting_bridge(
                    request.user,
                    reason=request.data.get("reason", ""),
                    confirmation=request.data.get("confirmation", ""),
                )
            )
        except Exception as exc:
            return _error(exc)


class AdminRentLeasePostingBridgeDisableView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        try:
            return Response(
                disable_rent_lease_posting_bridge(
                    request.user,
                    reason=request.data.get("reason", ""),
                    confirmation=request.data.get("confirmation", ""),
                )
            )
        except Exception as exc:
            return _error(exc)


class AdminRentLeaseAccountMappingBridgeView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response({
            "mapping": _mapping_payload(),
            "readiness": bridge.get_rent_lease_accounting_readiness(),
            "chart_accounts": [
                {"id": row.id, "code": row.code, "name": row.name, "account_type": row.account_type, "system_code": row.system_code}
                for row in ChartOfAccount.objects.filter(is_active=True).order_by("code")[:500]
            ],
            "finance_accounts": [
                {
                    "id": row.id,
                    "name": row.name,
                    "kind": row.kind,
                    "chart_account_id": row.chart_account_id,
                    "chart_account_code": row.chart_account.code,
                    "chart_account_type": row.chart_account.account_type,
                    "chart_account_is_active": row.chart_account.is_active,
                    "is_real_settlement_account": row.is_real_settlement_account,
                }
                for row in FinanceAccount.objects.select_related("chart_account").filter(is_active=True).order_by("name")[:200]
            ],
            "guidance": {
                "rent_income_account": "Rent Income: INCOME",
                "lease_income_account": "Lease Income: INCOME",
                "deposit_liability_account": "Security Deposit Liability: LIABILITY",
                "customer_advance_liability_account": "Customer Advance / Unearned Revenue: LIABILITY",
                "damage_recovery_income_account": "Damage Recovery Income: INCOME",
                "settlement_finance_account": "Settlement Finance Account: Cash/Bank/UPI finance account mapped to ASSET",
            },
        })

    def post(self, request):
        action = (request.data.get("action") or "").strip().upper()
        if action == "ENSURE_PREMADE":
            try:
                mapping = ensure_premade_rent_lease_accounting_setup(performed_by=request.user)
            except Exception as exc:
                return _clean_error_response(
                    "Premade rent/lease accounting setup could not be completed.",
                    {"non_field_errors": str(exc)},
                )
            return Response(
                {
                    "detail": "Premade rent/lease accounting setup is ready.",
                    "mapping_id": mapping.id,
                    "mapping": _mapping_payload(),
                    "readiness": bridge.get_rent_lease_accounting_readiness(),
                }
            )
        try:
            data = request.data
            mapping = get_active_account_mapping(auto_create=False) or RentLeaseAccountingAccountMapping(is_active=True)
            mapping.monthly_income_account = _account(data.get("monthly_income_account_id"), "monthly_income_account", ChartOfAccountType.INCOME)
            mapping.deposit_liability_account = _account(data.get("deposit_liability_account_id"), "deposit_liability_account", ChartOfAccountType.LIABILITY)
            mapping.deposit_refund_account = _account(data.get("deposit_refund_account_id"), "deposit_refund_account", ChartOfAccountType.ASSET)
            mapping.damage_recovery_income_account = _account(data.get("damage_recovery_income_account_id"), "damage_recovery_income_account", ChartOfAccountType.INCOME)
            settlement_id = data.get("settlement_finance_account_id")
            if str(settlement_id or "").isdigit():
                mapping.settlement_finance_account = FinanceAccount.objects.select_related("chart_account").get(pk=int(settlement_id), is_active=True)
            if not mapping.settlement_finance_account_id:
                raise ValidationError({"settlement_finance_account": "Settlement finance account is required."})
            if mapping.settlement_finance_account.chart_account.account_type != ChartOfAccountType.ASSET:
                raise ValidationError({"settlement_finance_account": "Settlement finance account must map to ASSET."})
            mapping.notes = (data.get("notes") or "").strip()
            mapping.is_active = True
            mapping.save()
            for key, expected in {
                "customer_advance_liability_account_id": ChartOfAccountType.LIABILITY,
                "rent_income_account_id": ChartOfAccountType.INCOME,
                "lease_income_account_id": ChartOfAccountType.INCOME,
            }.items():
                if data.get(key):
                    _account(data.get(key), key, expected)
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE accounting_rent_lease_account_mappings
                    SET customer_advance_liability_account_id = %s,
                        rent_income_account_id = %s,
                        lease_income_account_id = %s,
                        updated_at = %s
                    WHERE id = %s
                    """,
                    [
                        data.get("customer_advance_liability_account_id") or None,
                        data.get("rent_income_account_id") or None,
                        data.get("lease_income_account_id") or None,
                        timezone.now(),
                        mapping.id,
                    ],
                )
        except ValidationError as exc:
            field_errors = getattr(exc, "message_dict", None)
            if not field_errors:
                field_errors = {"non_field_errors": getattr(exc, "messages", [str(exc)])}
            return _clean_error_response("Invalid rent/lease mapping.", field_errors)
        except Exception as exc:
            return _clean_error_response("Invalid rent/lease mapping.", {"non_field_errors": str(exc)})
        return Response(
            {
                "detail": "Rent/lease account mapping saved.",
                "mapping_id": mapping.id,
                "mapping": _mapping_payload(),
                "readiness": bridge.get_rent_lease_accounting_readiness(),
            }
        )


class AdminRentLeaseAccountingSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(bridge.get_rent_lease_accounting_summary())


class _ActionView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    action = None

    def post(self, request, pk: int):
        try:
            return Response(self.action(pk, actor=request.user))
        except Exception as exc:
            return _error(exc)


class AdminDepositPostingPreviewView(_ActionView):
    action = staticmethod(bridge.preview_security_deposit_collection_posting)


class AdminDepositPostingExecuteView(_ActionView):
    action = staticmethod(bridge.execute_security_deposit_collection_posting)


class AdminDepositRefundPostingPreviewView(_ActionView):
    action = staticmethod(bridge.preview_security_deposit_refund_posting)


class AdminDepositRefundPostingExecuteView(_ActionView):
    action = staticmethod(bridge.execute_security_deposit_refund_posting)


class AdminDepositDamagePostingPreviewView(_ActionView):
    action = staticmethod(bridge.preview_damage_recovery_posting)


class AdminDepositDamagePostingExecuteView(_ActionView):
    action = staticmethod(bridge.execute_damage_recovery_posting)


class AdminRentLeaseDemandPostingPreviewView(_ActionView):
    action = staticmethod(bridge.preview_rent_lease_monthly_posting)


class AdminRentLeaseDemandPostingExecuteView(_ActionView):
    action = staticmethod(bridge.execute_rent_lease_monthly_posting)


class AdminCustomerAdvanceListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(bridge.list_customer_advances())

    def post(self, request):
        try:
            result = bridge.create_customer_advance_source_record(
                customer_id=request.data.get("customer_id"),
                amount=request.data.get("amount"),
                transaction_type=request.data.get("transaction_type", "COLLECTION"),
                payment_method=request.data.get("payment_method", ""),
                finance_account_id=request.data.get("finance_account_id"),
                reference_no=request.data.get("reference_no", ""),
                notes=request.data.get("notes", ""),
                created_by=request.user,
            )
            return Response(result, status=status.HTTP_201_CREATED)
        except Exception as exc:
            return _error(exc)


class AdminCustomerAdvanceDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        try:
            return Response(bridge.get_customer_advance(pk))
        except Exception as exc:
            return _error(exc)


class AdminCustomerAdvancePostingPreviewView(_ActionView):
    action = staticmethod(bridge.preview_customer_advance_posting)


class AdminCustomerAdvancePostingExecuteView(_ActionView):
    action = staticmethod(bridge.execute_customer_advance_posting)
