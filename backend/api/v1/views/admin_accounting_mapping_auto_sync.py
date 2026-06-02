from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import connection, transaction
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, RentLeaseAccountingAccountMapping
from api.v1.permissions import IsAdmin
from subscriptions.services.rent_lease_accounting_posting_service import get_rent_lease_accounting_readiness

REQUIRED_SYSTEM_CODES = {
    "monthly_income_account": ("RENT_INCOME", ChartOfAccountType.INCOME),
    "rent_income_account": ("RENT_INCOME", ChartOfAccountType.INCOME),
    "lease_income_account": ("LEASE_INCOME", ChartOfAccountType.INCOME),
    "deposit_liability_account": ("SECURITY_DEPOSIT_LIABILITY", ChartOfAccountType.LIABILITY),
    "deposit_refund_account": ("CASH_COLLECTION", ChartOfAccountType.ASSET),
    "damage_recovery_income_account": ("DAMAGE_RECOVERY", ChartOfAccountType.INCOME),
    "customer_advance_liability_account": ("CUSTOMER_ADVANCE_UNEARNED_REVENUE", ChartOfAccountType.LIABILITY),
}

SETTLEMENT_SYSTEM_CODES = ["CASH_COLLECTION", "UPI_COLLECTION", "BANK_COLLECTION", "PAYMENT_GATEWAY_COLLECTION"]


def _coalesce_system_account(system_code: str, account_type: str) -> ChartOfAccount | None:
    return ChartOfAccount.objects.filter(system_code=system_code, account_type=account_type, is_active=True).order_by("id").first()


def _preferred_finance_account() -> FinanceAccount | None:
    for code in SETTLEMENT_SYSTEM_CODES:
        account = (
            FinanceAccount.objects.select_related("chart_account")
            .filter(chart_account__system_code=code, chart_account__account_type=ChartOfAccountType.ASSET, is_active=True)
            .order_by("id")
            .first()
        )
        if account:
            return account
    return (
        FinanceAccount.objects.select_related("chart_account")
        .filter(chart_account__account_type=ChartOfAccountType.ASSET, is_active=True)
        .order_by("id")
        .first()
    )


class AdminRentLeaseAccountMappingAutoSyncView(APIView):
    """Safely map existing canonical COA/FA rows to the rent/lease accounting bridge.

    This endpoint does not create journals, payments, receipts, COA rows, or finance accounts.
    It only configures the bridge mapping from already-existing canonical system accounts.
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        missing: list[dict[str, str]] = []
        accounts: dict[str, ChartOfAccount] = {}
        for field, (system_code, expected_type) in REQUIRED_SYSTEM_CODES.items():
            account = _coalesce_system_account(system_code, expected_type)
            if account is None:
                missing.append({"field": field, "system_code": system_code, "account_type": expected_type})
            else:
                accounts[field] = account

        settlement = _preferred_finance_account()
        if settlement is None:
            missing.append({"field": "settlement_finance_account", "system_code": "CASH/UPI/BANK/PAYMENT_GATEWAY_COLLECTION", "account_type": ChartOfAccountType.ASSET})

        if missing:
            return Response(
                {
                    "detail": "Canonical COA/FA setup is incomplete. Run accounting setup defaults or create the missing accounts before auto-sync.",
                    "missing": missing,
                    "readiness": get_rent_lease_accounting_readiness(),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            mapping = RentLeaseAccountingAccountMapping.objects.select_for_update().filter(is_active=True).first()
            if mapping is None:
                mapping = RentLeaseAccountingAccountMapping(is_active=True)
            mapping.monthly_income_account = accounts["monthly_income_account"]
            mapping.deposit_liability_account = accounts["deposit_liability_account"]
            mapping.deposit_refund_account = accounts["deposit_refund_account"]
            mapping.damage_recovery_income_account = accounts["damage_recovery_income_account"]
            mapping.settlement_finance_account = settlement
            mapping.notes = "Auto-synced from canonical COA/FA system codes for rent/lease bridge readiness."
            mapping.full_clean()
            mapping.save()

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
                    [
                        accounts["customer_advance_liability_account"].id,
                        accounts["rent_income_account"].id,
                        accounts["lease_income_account"].id,
                        mapping.id,
                    ],
                )

        return Response(
            {
                "detail": "Rent/lease account mapping auto-synced from canonical COA and finance accounts.",
                "mapping_id": mapping.id,
                "settlement_finance_account_id": settlement.id,
                "readiness": get_rent_lease_accounting_readiness(),
            }
        )
