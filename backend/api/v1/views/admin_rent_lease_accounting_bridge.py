from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import connection
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, RentLeaseAccountingAccountMapping
from api.v1.permissions import IsAdmin
from subscriptions.services import rent_lease_accounting_posting_service as bridge


def _error(exc: Exception) -> Response:
    detail = getattr(exc, "message_dict", None) or getattr(exc, "messages", None) or str(exc)
    return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)


def _account(pk, field: str, expected: str) -> ChartOfAccount:
    account = ChartOfAccount.objects.filter(pk=int(pk or 0), is_active=True).first()
    if account is None:
        raise ValidationError({field: "Active chart account is required."})
    if account.account_type != expected:
        raise ValidationError({field: f"Account must be {expected}."})
    return account


def _mapping_payload() -> dict | None:
    mapping = RentLeaseAccountingAccountMapping.objects.select_related(
        "monthly_income_account",
        "deposit_liability_account",
        "deposit_refund_account",
        "damage_recovery_income_account",
        "settlement_finance_account",
    ).filter(is_active=True).first()
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
        "deposit_liability_account_id": mapping.deposit_liability_account_id,
        "deposit_refund_account_id": mapping.deposit_refund_account_id,
        "damage_recovery_income_account_id": mapping.damage_recovery_income_account_id,
        "settlement_finance_account_id": mapping.settlement_finance_account_id,
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


class AdminRentLeaseAccountMappingBridgeView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response({
            "mapping": _mapping_payload(),
            "readiness": bridge.get_rent_lease_accounting_readiness(),
            "chart_accounts": [
                {"id": row.id, "code": row.code, "name": row.name, "account_type": row.account_type}
                for row in ChartOfAccount.objects.filter(is_active=True).order_by("code")[:500]
            ],
            "finance_accounts": [
                {"id": row.id, "name": row.name, "kind": row.kind, "chart_account_id": row.chart_account_id, "chart_account_type": row.chart_account.account_type}
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
        try:
            data = request.data
            mapping = RentLeaseAccountingAccountMapping.objects.filter(is_active=True).first() or RentLeaseAccountingAccountMapping(is_active=True)
            mapping.monthly_income_account = _account(data.get("monthly_income_account_id"), "monthly_income_account", ChartOfAccountType.INCOME)
            mapping.deposit_liability_account = _account(data.get("deposit_liability_account_id"), "deposit_liability_account", ChartOfAccountType.LIABILITY)
            mapping.deposit_refund_account = _account(data.get("deposit_refund_account_id"), "deposit_refund_account", ChartOfAccountType.ASSET)
            mapping.damage_recovery_income_account = _account(data.get("damage_recovery_income_account_id"), "damage_recovery_income_account", ChartOfAccountType.INCOME)
            settlement_id = data.get("settlement_finance_account_id")
            mapping.settlement_finance_account = FinanceAccount.objects.get(pk=int(settlement_id)) if str(settlement_id or "").isdigit() else None
            if mapping.settlement_finance_account and mapping.settlement_finance_account.chart_account.account_type != ChartOfAccountType.ASSET:
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
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    [data.get("customer_advance_liability_account_id") or None, data.get("rent_income_account_id") or None, data.get("lease_income_account_id") or None, mapping.id],
                )
        except Exception as exc:
            return _error(exc)
        return Response({"detail": "Rent/lease account mapping saved.", "mapping_id": mapping.id, "readiness": bridge.get_rent_lease_accounting_readiness()})


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
