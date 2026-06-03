from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.utils import timezone

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
)
from accounting.services.accounting_setup_catalog import (
    CANONICAL_CHART_ACCOUNTS,
)
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit

# Profiles-only finance row used exclusively for FinanceAccountCoaMapping FK (not a cash desk).
LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME = "Ledger posting profiles (system)"

REQUIRED_COA: list[tuple[str, str, str]] = [
    (spec.account_type, spec.name, spec.key) for spec in CANONICAL_CHART_ACCOUNTS
]

REQUIRED_COA_SYSTEM_CODES: tuple[str, ...] = tuple(code for _, _, code in REQUIRED_COA)

# Cash/Bank/UPI/gateway desks — physical settlement instruments only.
SETTLEMENT_FINANCE_ACCOUNTS: list[tuple[str, str]] = [
    ("Main Cash Desk", FinanceAccountKind.CASH),
    ("Branch Cash Desk", FinanceAccountKind.CASH),
    ("Main Bank Account", FinanceAccountKind.BANK),
    ("UPI Account", FinanceAccountKind.UPI),
    ("Payment Gateway Settlement Account", FinanceAccountKind.BANK),
]

# finance_account_name, chart_account_name (seeded COA label), purpose, is_default_for_purpose
DEFAULT_MAPPINGS: list[tuple[str, str, str, bool]] = [
    ("Main Cash Desk", "Cash in Hand", FinanceAccountMappingPurpose.CASH_COLLECTION, True),
    ("Branch Cash Desk", "Cash in Hand", FinanceAccountMappingPurpose.CASH_COLLECTION, False),
    ("Main Bank Account", "Bank Account", FinanceAccountMappingPurpose.BANK_COLLECTION, True),
    ("UPI Account", "UPI Collection Account", FinanceAccountMappingPurpose.UPI_COLLECTION, True),
    (
        "Payment Gateway Settlement Account",
        "Payment Gateway Settlement Account",
        FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "Accounts Receivable",
        FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "Rent/Lease Security Deposit Liability",
        FinanceAccountMappingPurpose.SECURITY_DEPOSIT_LIABILITY,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "Customer Advances and Unapplied Receipts",
        FinanceAccountMappingPurpose.CUSTOMER_ADVANCE_UNEARNED_REVENUE,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "Advance EMI Collection Income",
        FinanceAccountMappingPurpose.EMI_INCOME,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "Rent Income",
        FinanceAccountMappingPurpose.RENT_INCOME,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "Lease Income",
        FinanceAccountMappingPurpose.LEASE_INCOME,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "Sales Revenue",
        FinanceAccountMappingPurpose.DIRECT_SALE_INCOME,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "Delivery Charges Income",
        FinanceAccountMappingPurpose.DELIVERY_CHARGES_INCOME,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "Damage Recovery Income",
        FinanceAccountMappingPurpose.DAMAGE_RECOVERY,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "EMI Winner Waiver Expense",
        FinanceAccountMappingPurpose.WAIVER_LOSS,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "Partner Commission Payable",
        FinanceAccountMappingPurpose.COMMISSION_PAYABLE,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "Partner Commission Expense",
        FinanceAccountMappingPurpose.COMMISSION_EXPENSE,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "Inventory Asset",
        FinanceAccountMappingPurpose.INVENTORY_ASSET,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "Delivery Expense",
        FinanceAccountMappingPurpose.DELIVERY_EXPENSE,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "Salary Expense",
        FinanceAccountMappingPurpose.SALARY_EXPENSE,
        True,
    ),
]

REQUIRED_MAPPING_PURPOSES: tuple[str, ...] = tuple(sorted({row[2] for row in DEFAULT_MAPPINGS}))

PURPOSE_EXPECTED_ACCOUNT_TYPES: dict[str, tuple[str, ...]] = {
    FinanceAccountMappingPurpose.CASH_COLLECTION: (ChartOfAccountType.ASSET,),
    FinanceAccountMappingPurpose.UPI_COLLECTION: (ChartOfAccountType.ASSET,),
    FinanceAccountMappingPurpose.BANK_COLLECTION: (ChartOfAccountType.ASSET,),
    FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION: (ChartOfAccountType.ASSET,),
    FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE: (ChartOfAccountType.ASSET,),
    FinanceAccountMappingPurpose.SECURITY_DEPOSIT_LIABILITY: (ChartOfAccountType.LIABILITY,),
    FinanceAccountMappingPurpose.CUSTOMER_ADVANCE_UNEARNED_REVENUE: (ChartOfAccountType.LIABILITY,),
    FinanceAccountMappingPurpose.EMI_INCOME: (ChartOfAccountType.INCOME,),
    FinanceAccountMappingPurpose.RENT_INCOME: (ChartOfAccountType.INCOME,),
    FinanceAccountMappingPurpose.LEASE_INCOME: (ChartOfAccountType.INCOME,),
    FinanceAccountMappingPurpose.DIRECT_SALE_INCOME: (ChartOfAccountType.INCOME,),
    FinanceAccountMappingPurpose.DELIVERY_CHARGES_INCOME: (ChartOfAccountType.INCOME,),
    FinanceAccountMappingPurpose.WAIVER_LOSS: (ChartOfAccountType.EXPENSE,),
    FinanceAccountMappingPurpose.COMMISSION_PAYABLE: (ChartOfAccountType.LIABILITY,),
    FinanceAccountMappingPurpose.COMMISSION_EXPENSE: (ChartOfAccountType.EXPENSE,),
    FinanceAccountMappingPurpose.DAMAGE_RECOVERY: (ChartOfAccountType.INCOME,),
    FinanceAccountMappingPurpose.DELIVERY_EXPENSE: (ChartOfAccountType.EXPENSE,),
    FinanceAccountMappingPurpose.SALARY_EXPENSE: (ChartOfAccountType.EXPENSE,),
    FinanceAccountMappingPurpose.INVENTORY_ASSET: (ChartOfAccountType.ASSET,),
}


@dataclass
class SetupResult:
    created: int
    existing: int
    details: list[dict[str, Any]]


DEFAULT_CASH_IN_HAND_SYSTEM_CODE = "CASH_COLLECTION"
DEFAULT_BANK_ACCOUNT_SYSTEM_CODE = "BANK_COLLECTION"
DEFAULT_UPI_GATEWAY_SYSTEM_CODE = "UPI_COLLECTION"

# Warnings that remain visible but do not block readiness.
READINESS_INFORMATIONAL_WARNING_CODES: frozenset[str] = frozenset()


def _setup_issue(
    *,
    code: str,
    message: str,
    level: str = "WARNING",
    affected_ids: list[int] | None = None,
    repairable: bool = False,
    operator_action: str = "",
) -> dict[str, Any]:
    return {
        "level": level,
        "code": code,
        "message": message,
        "affected_ids": affected_ids or [],
        "repairable": repairable,
        "operator_action": operator_action,
    }


class AccountingSetupService:
    PURPOSE_TO_SYSTEM_CODE: dict[str, str] = {
        FinanceAccountMappingPurpose.CASH_COLLECTION: DEFAULT_CASH_IN_HAND_SYSTEM_CODE,
        FinanceAccountMappingPurpose.BANK_COLLECTION: DEFAULT_BANK_ACCOUNT_SYSTEM_CODE,
        FinanceAccountMappingPurpose.UPI_COLLECTION: DEFAULT_UPI_GATEWAY_SYSTEM_CODE,
        FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE: "CUSTOMER_RECEIVABLE",
        FinanceAccountMappingPurpose.DIRECT_SALE_INCOME: "SALES_REVENUE",
        FinanceAccountMappingPurpose.EMI_INCOME: "EMI_INCOME",
        FinanceAccountMappingPurpose.INVENTORY_ASSET: "INVENTORY_ASSET",
        FinanceAccountMappingPurpose.SECURITY_DEPOSIT_LIABILITY: "SECURITY_DEPOSIT_LIABILITY",
        FinanceAccountMappingPurpose.CUSTOMER_ADVANCE_UNEARNED_REVENUE: "CUSTOMER_ADVANCE_UNEARNED_REVENUE",
        FinanceAccountMappingPurpose.WAIVER_LOSS: "EMI_WAIVER_EXPENSE",
    }

    @staticmethod
    def _chart_is_cash_in_hand(chart: ChartOfAccount | None) -> bool:
        if chart is None:
            return False
        if chart.system_code == DEFAULT_CASH_IN_HAND_SYSTEM_CODE:
            return True
        return chart.name.strip().lower() == "cash in hand"

    @staticmethod
    def _resolve_chart_by_system_code(system_code: str) -> ChartOfAccount | None:
        return ChartOfAccount.objects.filter(system_code=system_code, is_active=True).first()

    @staticmethod
    def _primary_chart_for_seeded_finance_row(*, name: str, kind: str) -> ChartOfAccount | None:
        """Primary chart for default settlement / ledger-anchor finance rows (seed + repair)."""
        ledger_key = LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME.strip().lower()
        if name.strip().lower() == ledger_key:
            return (
                AccountingSetupService._resolve_chart_by_system_code(DEFAULT_BANK_ACCOUNT_SYSTEM_CODE)
                or AccountingSetupService._resolve_anchor_chart_account()
            )
        if kind == FinanceAccountKind.CASH:
            return AccountingSetupService._resolve_anchor_chart_account()
        if kind == FinanceAccountKind.UPI:
            return (
                AccountingSetupService._resolve_chart_by_system_code(DEFAULT_UPI_GATEWAY_SYSTEM_CODE)
                or AccountingSetupService._resolve_anchor_chart_account()
            )
        if kind == FinanceAccountKind.BANK:
            return (
                AccountingSetupService._resolve_chart_by_system_code(DEFAULT_BANK_ACCOUNT_SYSTEM_CODE)
                or AccountingSetupService._resolve_anchor_chart_account()
            )
        return AccountingSetupService._resolve_anchor_chart_account()

    @staticmethod
    def _mapping_notes_allow_auto_repair(notes: str | None) -> bool:
        n = (notes or "").strip().lower()
        if not n:
            return True
        if "default day-one mapping" in n:
            return True
        if "suggested repair" in n:
            return True
        if n.startswith("auto-mapped"):
            return True
        return False

    @staticmethod
    def resolve_expected_chart_for_purpose(purpose: str) -> ChartOfAccount | None:
        system_code = AccountingSetupService.PURPOSE_TO_SYSTEM_CODE.get(purpose)
        if not system_code:
            return None
        return AccountingSetupService._resolve_chart_by_system_code(system_code)

    @staticmethod
    def validate_finance_account_primary_chart_alignment(
        *,
        kind: str,
        chart_account: ChartOfAccount,
        finance_account: FinanceAccount | None = None,
    ) -> None:
        """
        Enforce sensible primary chart links for finance accounts (API / master updates).

        Ledger posting profile anchor is excluded from bank-vs-cash strictness.
        """
        from django.core.exceptions import ValidationError as DjangoValidationError

        ledger_key = LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME.strip().lower()
        if finance_account is not None:
            if finance_account.name.strip().lower() == ledger_key and not finance_account.is_real_settlement_account:
                return

        kind_norm = (kind or "").strip().upper()
        if chart_account.account_type != ChartOfAccountType.ASSET:
            raise DjangoValidationError(
                {"chart_account": "Finance accounts must map to an ASSET chart account."},
            )

        bank_chart = AccountingSetupService._resolve_chart_by_system_code(DEFAULT_BANK_ACCOUNT_SYSTEM_CODE)
        upi_chart = AccountingSetupService._resolve_chart_by_system_code(DEFAULT_UPI_GATEWAY_SYSTEM_CODE)

        if kind_norm == FinanceAccountKind.BANK and AccountingSetupService._chart_is_cash_in_hand(chart_account):
            if bank_chart and chart_account.pk != bank_chart.pk:
                raise DjangoValidationError(
                    {
                        "chart_account": (
                            "Bank finance accounts cannot use Cash in Hand as the primary chart account "
                            "when a Bank Account ledger exists on the chart."
                        ),
                    },
                )
        if kind_norm == FinanceAccountKind.UPI and AccountingSetupService._chart_is_cash_in_hand(chart_account):
            if upi_chart and chart_account.pk != upi_chart.pk:
                raise DjangoValidationError(
                    {
                        "chart_account": (
                            "UPI finance accounts cannot use Cash in Hand as the primary chart account "
                            "when a UPI / payment gateway asset ledger exists."
                        ),
                    },
                )

    @staticmethod
    def _resolve_anchor_chart_account():
        anchor = ChartOfAccount.objects.filter(system_code=DEFAULT_CASH_IN_HAND_SYSTEM_CODE, is_active=True).first()
        if anchor:
            return anchor
        return ChartOfAccount.objects.filter(account_type=ChartOfAccountType.ASSET, is_active=True).order_by("id").first()

    @staticmethod
    def seed_default_chart_of_accounts(*, actor=None, dry_run: bool = False) -> SetupResult:
        created = 0
        existing = 0
        details: list[dict[str, Any]] = []
        for account_type, name, system_code in REQUIRED_COA:
            instance = ChartOfAccount.objects.filter(system_code=system_code).first()
            if instance:
                existing += 1
                details.append({"name": name, "status": "existing"})
                continue
            created += 1
            details.append({"name": name, "status": "created"})
            if dry_run:
                continue
            instance = ChartOfAccount.objects.create(
                name=name,
                account_type=account_type,
                system_code=system_code,
                is_active=True,
                allow_manual_posting=True,
            )
            log_audit(
                action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                instance=instance,
                performed_by=actor,
                metadata={"event": "ACCOUNTING_SETUP_COA_CREATED", "system_code": system_code},
            )
        return SetupResult(created=created, existing=existing, details=details)

    @staticmethod
    def seed_default_finance_accounts(*, actor=None, dry_run: bool = False) -> SetupResult:
        created = 0
        existing = 0
        details: list[dict[str, Any]] = []
        if not dry_run and AccountingSetupService._resolve_anchor_chart_account() is None:
            raise ValueError("No ASSET chart account available. Seed chart of accounts first.")

        for name, kind in SETTLEMENT_FINANCE_ACCOUNTS:
            instance = FinanceAccount.objects.filter(name__iexact=name).first()
            if instance:
                existing += 1
                details.append({"name": name, "status": "existing"})
                continue
            created += 1
            details.append({"name": name, "status": "created"})
            if dry_run:
                continue
            primary = AccountingSetupService._primary_chart_for_seeded_finance_row(name=name, kind=kind)
            if primary is None:
                raise ValueError("No suitable chart account for default finance account seeding.")
            instance = FinanceAccount.objects.create(
                name=name,
                kind=kind,
                chart_account=primary,
                is_active=True,
                is_real_settlement_account=True,
            )
            log_audit(
                action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                instance=instance,
                performed_by=actor,
                metadata={"event": "ACCOUNTING_SETUP_FINANCE_ACCOUNT_CREATED", "settlement": True},
            )

        ledger_name = LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME
        ledger = FinanceAccount.objects.filter(name__iexact=ledger_name).first()
        if ledger:
            existing += 1
            details.append({"name": ledger_name, "status": "existing"})
        else:
            created += 1
            details.append({"name": ledger_name, "status": "created"})
            if not dry_run:
                ledger_primary = AccountingSetupService._primary_chart_for_seeded_finance_row(
                    name=ledger_name,
                    kind=FinanceAccountKind.BANK,
                )
                if ledger_primary is None:
                    raise ValueError("No suitable chart account for ledger profile anchor.")
                ledger = FinanceAccount.objects.create(
                    name=ledger_name,
                    kind=FinanceAccountKind.BANK,
                    chart_account=ledger_primary,
                    is_active=True,
                    is_real_settlement_account=False,
                    notes="System ledger-profile anchor — not a settlement desk.",
                )
                log_audit(
                    action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                    instance=ledger,
                    performed_by=actor,
                    metadata={"event": "ACCOUNTING_SETUP_FINANCE_ACCOUNT_CREATED", "settlement": False},
                )

        return SetupResult(created=created, existing=existing, details=details)

    @staticmethod
    def create_default_mappings(*, actor=None, dry_run: bool = False) -> SetupResult:
        created = 0
        existing = 0
        details: list[dict[str, Any]] = []
        for finance_name, chart_name, purpose, is_default in DEFAULT_MAPPINGS:
            finance = FinanceAccount.objects.filter(name__iexact=finance_name).first()
            chart = ChartOfAccount.objects.filter(name__iexact=chart_name).first()
            if not finance or not chart:
                details.append({"purpose": purpose, "status": "skipped_missing_prerequisite"})
                continue
            mapping = FinanceAccountCoaMapping.objects.filter(
                finance_account=finance,
                purpose=purpose,
                is_active=True,
            ).first()
            if mapping:
                existing += 1
                details.append({"purpose": purpose, "finance_account": finance_name, "status": "existing"})
                continue
            created += 1
            details.append({"purpose": purpose, "finance_account": finance_name, "status": "created"})
            if dry_run:
                continue
            mapping = FinanceAccountCoaMapping.objects.create(
                finance_account=finance,
                chart_account=chart,
                purpose=purpose,
                is_default=is_default,
                is_active=True,
                created_by=actor,
                updated_by=actor,
                notes="Default day-one mapping",
            )
            log_audit(
                action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                instance=mapping,
                performed_by=actor,
                metadata={"event": "ACCOUNTING_SETUP_MAPPING_CREATED", "purpose": purpose},
            )
        return SetupResult(created=created, existing=existing, details=details)

    @staticmethod
    @transaction.atomic
    def repair_suggested_mappings(*, actor=None, dry_run: bool = False) -> dict[str, Any]:
        """
        Repair default finance-account primary charts and auto-repairable COA mappings.

        Does not change historical ledger lines. Mapping rows with non-default user notes are skipped.
        """
        finance_repairs = 0
        mapping_repairs = 0
        details: list[dict[str, Any]] = []

        name_targets: list[tuple[str, str]] = [
            ("Main Cash Desk", DEFAULT_CASH_IN_HAND_SYSTEM_CODE),
            ("Branch Cash Desk", DEFAULT_CASH_IN_HAND_SYSTEM_CODE),
            ("Main Bank Account", DEFAULT_BANK_ACCOUNT_SYSTEM_CODE),
            ("UPI Account", DEFAULT_UPI_GATEWAY_SYSTEM_CODE),
            ("Payment Gateway Settlement Account", DEFAULT_BANK_ACCOUNT_SYSTEM_CODE),
            (LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME, DEFAULT_BANK_ACCOUNT_SYSTEM_CODE),
        ]
        for name, code in name_targets:
            fa = FinanceAccount.objects.filter(name__iexact=name.strip()).select_for_update().first()
            chart = AccountingSetupService._resolve_chart_by_system_code(code)
            if not fa or not chart or fa.chart_account_id == chart.id:
                continue
            details.append(
                {
                    "type": "finance_account_primary",
                    "finance_account_id": fa.pk,
                    "name": fa.name,
                    "old_chart_account_id": fa.chart_account_id,
                    "new_chart_account_id": chart.pk,
                }
            )
            finance_repairs += 1
            if not dry_run:
                old_id = fa.chart_account_id
                fa.chart_account = chart
                fa.save(update_fields=["chart_account", "updated_at"])
                log_audit(
                    action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                    instance=fa,
                    performed_by=actor,
                    metadata={
                        "event": "ACCOUNTING_SETUP_SUGGESTED_REPAIR",
                        "source": "SUGGESTED_REPAIR",
                        "finance_account_id": fa.pk,
                        "old_chart_account_id": old_id,
                        "new_chart_account_id": chart.pk,
                    },
                )

        for finance_name, chart_name, purpose, _ in DEFAULT_MAPPINGS:
            finance = FinanceAccount.objects.filter(name__iexact=finance_name.strip()).first()
            chart = AccountingSetupService.resolve_expected_chart_for_purpose(purpose) or ChartOfAccount.objects.filter(
                name__iexact=chart_name.strip(),
                is_active=True,
            ).first()
            if not finance or not chart:
                continue
            mapping = FinanceAccountCoaMapping.objects.filter(
                finance_account=finance,
                purpose=purpose,
                is_active=True,
            ).select_for_update().first()
            if not mapping or mapping.chart_account_id == chart.id:
                continue
            if not AccountingSetupService._mapping_notes_allow_auto_repair(mapping.notes):
                details.append(
                    {
                        "type": "mapping_skipped_user_notes",
                        "finance_account_id": finance.pk,
                        "purpose": purpose,
                    }
                )
                continue
            details.append(
                {
                    "type": "finance_coa_mapping",
                    "finance_account_id": finance.pk,
                    "purpose": purpose,
                    "old_chart_account_id": mapping.chart_account_id,
                    "new_chart_account_id": chart.pk,
                }
            )
            mapping_repairs += 1
            if not dry_run:
                old_c = mapping.chart_account_id
                mapping.chart_account = chart
                prior = (mapping.notes or "").strip()
                if not prior:
                    mapping.notes = "Default day-one mapping (Suggested repair)"
                elif "suggested repair" not in prior.lower():
                    mapping.notes = f"{prior} (Suggested repair)".strip()
                mapping.updated_by = actor
                mapping.save(update_fields=["chart_account", "notes", "updated_by", "updated_at"])
                log_audit(
                    action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                    instance=mapping,
                    performed_by=actor,
                    metadata={
                        "event": "ACCOUNTING_SETUP_MAPPING_SUGGESTED_REPAIR",
                        "source": "SUGGESTED_REPAIR",
                        "finance_account_id": finance.pk,
                        "purpose": purpose,
                        "old_chart_account_id": old_c,
                        "new_chart_account_id": chart.pk,
                    },
                )

        validation = AccountingSetupService.validate_accounting_setup()
        return {
            "dry_run": dry_run,
            "finance_primary_repairs": finance_repairs,
            "mapping_repairs": mapping_repairs,
            "details": details,
            "validation": validation,
        }

    @staticmethod
    def missing_required_coa_codes() -> list[str]:
        missing: list[str] = []
        for _, _, code in REQUIRED_COA:
            if not ChartOfAccount.objects.filter(system_code=code, is_active=True).exists():
                missing.append(code)
        return missing

    @staticmethod
    def missing_required_mapping_purposes() -> list[str]:
        active_purposes = set(
            FinanceAccountCoaMapping.objects.filter(is_active=True).values_list("purpose", flat=True)
        )
        return [p for p in REQUIRED_MAPPING_PURPOSES if p not in active_purposes]

    @staticmethod
    def get_setup_warnings() -> list[dict[str, Any]]:
        warnings: list[dict[str, Any]] = []
        ledger_key = LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME.strip().lower()

        settlement_present = FinanceAccount.objects.filter(is_active=True, is_real_settlement_account=True).exists()
        if not settlement_present:
            warnings.append(
                _setup_issue(
                    code="MISSING_ACTIVE_SETTLEMENT_ACCOUNT",
                    message="No active finance account flagged as a real settlement desk (cash/bank/UPI/gateway).",
                    level="ERROR",
                    operator_action="Create or activate at least one real settlement finance account.",
                )
            )

        ledger_anchor = FinanceAccount.objects.filter(name__iexact=LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME).first()
        if ledger_anchor is None or not ledger_anchor.is_active:
            warnings.append(
                _setup_issue(
                    code="MISSING_LEDGER_PROFILE_ANCHOR",
                    message="Ledger posting profile anchor finance account is missing or inactive.",
                    level="ERROR",
                    operator_action="Run Accounting Setup defaults to recreate the system posting profile anchor.",
                )
            )

        active_finance_accounts = FinanceAccount.objects.filter(is_active=True)
        for account in active_finance_accounts:
            chart = account.chart_account
            name_lower = account.name.strip().lower()
            if account.kind == FinanceAccountKind.BANK and AccountingSetupService._chart_is_cash_in_hand(chart):
                if name_lower == ledger_key and not account.is_real_settlement_account:
                    continue
                warnings.append(
                    _setup_issue(
                        code="BANK_FINANCE_ANCHORED_TO_CASH_IN_HAND",
                        message=(
                            f"{account.name} is a bank finance account but its primary chart link is Cash in Hand; "
                            "use a dedicated bank/UPI ledger on the chart."
                        ),
                        affected_ids=[account.id],
                        repairable=True,
                        operator_action="Map this bank finance account to a posting-ready bank ASSET account.",
                    )
                )
            if account.kind == FinanceAccountKind.UPI and AccountingSetupService._chart_is_cash_in_hand(chart):
                if name_lower == ledger_key and not account.is_real_settlement_account:
                    continue
                warnings.append(
                    _setup_issue(
                        code="UPI_FINANCE_ANCHORED_TO_CASH_IN_HAND",
                        message=(
                            f"{account.name} is a UPI finance account but its primary chart link is Cash in Hand; "
                            "map it to the UPI/payment-gateway style asset ledger instead."
                        ),
                        affected_ids=[account.id],
                        repairable=True,
                        operator_action="Map this UPI finance account to a posting-ready UPI/payment-gateway ASSET account.",
                    )
                )

            has_mapping = FinanceAccountCoaMapping.objects.filter(finance_account=account, is_active=True).exists()
            if not has_mapping:
                warnings.append(
                    _setup_issue(
                        code="UNMAPPED_FINANCE_ACCOUNT",
                        message=f"{account.name} has no active COA mapping.",
                        affected_ids=[account.id],
                        repairable=bool(account.is_real_settlement_account),
                        operator_action="Repair blocked collection mappings or add the required COA mapping.",
                    )
                )

            if (
                account.is_real_settlement_account
                and has_mapping
                and not FinanceAccountCoaMapping.objects.filter(
                    finance_account=account,
                    is_active=True,
                    purpose__in=(
                        FinanceAccountMappingPurpose.CASH_COLLECTION,
                        FinanceAccountMappingPurpose.UPI_COLLECTION,
                        FinanceAccountMappingPurpose.BANK_COLLECTION,
                        FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION,
                    ),
                ).exists()
            ):
                warnings.append(
                    _setup_issue(
                        code="SETTLEMENT_ACCOUNT_WITHOUT_COLLECTION_MAPPING",
                        message=(
                            f"{account.name} is marked as a settlement desk but has no cash/UPI/bank/gateway "
                            "collection-purpose mapping."
                        ),
                        affected_ids=[account.id],
                        repairable=True,
                        operator_action="Create the matching collection-purpose mapping for this finance account.",
                    )
                )

            name_lower = account.name.strip().lower()
            looks_conceptual = any(
                token in name_lower
                for token in (
                    "income",
                    "receivable",
                    "payable",
                    "liability",
                    "emi collection",
                    "waiver",
                    "commission payable",
                    "inventory stock",
                    "damage deduction",
                )
            )
            if account.is_active and account.is_real_settlement_account and looks_conceptual and name_lower != ledger_key:
                warnings.append(
                    _setup_issue(
                        code="FINANCE_ACCOUNT_LOOKS_CONCEPTUAL",
                        message=(
                            f"{account.name} looks like an income/liability ledger concept but is flagged as a "
                            "settlement desk; income and liabilities belong on the chart via mappings."
                        ),
                        affected_ids=[account.id],
                        operator_action="Rename/reclassify the account or move ledger-only behavior to posting profiles.",
                    )
                )

            if (
                account.is_active
                and not account.is_real_settlement_account
                and name_lower != ledger_key
            ):
                warnings.append(
                    _setup_issue(
                        code="LEGACY_NON_SETTLEMENT_FINANCE_ACCOUNT",
                        message=(
                            f"{account.name} is not flagged as a settlement desk; verify it is intentional legacy "
                            "data or deactivate after migrating mappings."
                        ),
                        affected_ids=[account.id],
                        operator_action="Verify this legacy row is intentional and not exposed to collection selectors.",
                    )
                )

        active_mappings = FinanceAccountCoaMapping.objects.select_related("chart_account", "finance_account").filter(
            is_active=True
        )
        default_counts: dict[str, int] = {}
        mapped_purposes: set[str] = set()
        for mapping in active_mappings:
            purpose = mapping.purpose
            mapped_purposes.add(purpose)
            if mapping.is_default:
                default_counts[purpose] = default_counts.get(purpose, 0) + 1
            if not mapping.chart_account.is_active:
                warnings.append(
                    _setup_issue(
                        code="INACTIVE_CHART_ACCOUNT",
                        message=(
                            f"{mapping.finance_account.name} maps to inactive chart account "
                            f"{mapping.chart_account.name}."
                        ),
                        affected_ids=[mapping.finance_account_id, mapping.chart_account_id],
                        repairable=True,
                        operator_action="Map the finance account to an active chart account.",
                    )
                )
            expected_types = PURPOSE_EXPECTED_ACCOUNT_TYPES.get(mapping.purpose)
            if expected_types and mapping.chart_account.account_type not in expected_types:
                expected_types_label = ", ".join(expected_types)
                warnings.append(
                    _setup_issue(
                        code="MAPPING_ACCOUNT_TYPE_MISMATCH",
                        message=(
                            f"{mapping.finance_account.name} mapping for {mapping.purpose} "
                            f"uses {mapping.chart_account.account_type}, expected {expected_types_label}."
                        ),
                        affected_ids=[mapping.finance_account_id, mapping.chart_account_id],
                        repairable=True,
                        operator_action="Map this purpose to the expected chart account type.",
                    )
                )

            if (
                mapping.purpose == FinanceAccountMappingPurpose.BANK_COLLECTION
                and AccountingSetupService._chart_is_cash_in_hand(mapping.chart_account)
            ):
                warnings.append(
                    _setup_issue(
                        code="BANK_COLLECTION_MAPPED_TO_CASH_IN_HAND",
                        message=(
                            f"{mapping.finance_account.name}: bank collection is mapped to Cash in Hand; "
                            "use the bank ledger chart account instead."
                        ),
                        affected_ids=[mapping.finance_account_id, mapping.chart_account_id],
                        repairable=True,
                        operator_action="Map bank collection to a bank ASSET ledger.",
                    )
                )
            if (
                mapping.purpose == FinanceAccountMappingPurpose.UPI_COLLECTION
                and AccountingSetupService._chart_is_cash_in_hand(mapping.chart_account)
            ):
                warnings.append(
                    _setup_issue(
                        code="UPI_COLLECTION_MAPPED_TO_CASH_IN_HAND",
                        message=(
                            f"{mapping.finance_account.name}: UPI collection is mapped to Cash in Hand; "
                            "use the UPI / payment gateway asset ledger instead."
                        ),
                        affected_ids=[mapping.finance_account_id, mapping.chart_account_id],
                        repairable=True,
                        operator_action="Map UPI collection to a UPI/payment-gateway ASSET ledger.",
                    )
                )

            fa = mapping.finance_account
            exp_types = PURPOSE_EXPECTED_ACCOUNT_TYPES.get(mapping.purpose)
            if (
                fa.is_real_settlement_account
                and exp_types == (ChartOfAccountType.ASSET,)
                and mapping.purpose
                not in {
                    FinanceAccountMappingPurpose.CASH_COLLECTION,
                    FinanceAccountMappingPurpose.UPI_COLLECTION,
                    FinanceAccountMappingPurpose.BANK_COLLECTION,
                    FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION,
                }
            ):
                warnings.append(
                    _setup_issue(
                        code="SETTLEMENT_ACCOUNT_NON_COLLECTION_PURPOSE",
                        message=(
                            f"{fa.name} is a settlement desk but participates in mapping purpose "
                            f"{mapping.purpose}; prefer linking ledger-only purposes via "
                            f"{LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME}."
                        ),
                        affected_ids=[fa.id],
                        operator_action="Move ledger-only mappings to system posting profiles.",
                    )
                )

        for purpose, count in default_counts.items():
            if count > 1:
                warnings.append(
                    _setup_issue(
                        code="DUPLICATE_DEFAULT_MAPPING",
                        message=f"Purpose {purpose} has {count} default mappings.",
                        operator_action="Keep exactly one active default mapping per purpose.",
                    )
                )

        for purpose in REQUIRED_MAPPING_PURPOSES:
            if purpose not in mapped_purposes:
                warnings.append(
                    _setup_issue(
                        code="MISSING_REQUIRED_PURPOSE",
                        message=f"No active mapping configured for required purpose {purpose}.",
                        repairable=True,
                        operator_action="Run Accounting Setup defaults or create the required mapping.",
                    )
                )

        return warnings

    @staticmethod
    def validate_accounting_setup() -> dict[str, Any]:
        warnings = AccountingSetupService.get_setup_warnings()
        missing_coa = AccountingSetupService.missing_required_coa_codes()
        missing_mappings = AccountingSetupService.missing_required_mapping_purposes()
        ledger_anchor_present = FinanceAccount.objects.filter(
            name__iexact=LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
            is_active=True,
        ).exists()
        settlement_ready = FinanceAccount.objects.filter(is_active=True, is_real_settlement_account=True).exists()

        blocking_warnings = [w for w in warnings if w.get("code") not in READINESS_INFORMATIONAL_WARNING_CODES]

        coa_ready = len(missing_coa) == 0
        finance_accounts_ready = settlement_ready and ledger_anchor_present
        mappings_complete = (
            len(missing_mappings) == 0
            and len(blocking_warnings) == 0
            and coa_ready
            and finance_accounts_ready
        )

        status = "READY"
        if missing_coa or missing_mappings or blocking_warnings:
            status = "NEEDS_ATTENTION"

        return {
            "status": status,
            "warnings_count": len(warnings),
            "warnings": warnings,
            "last_validated_at": timezone.now().isoformat(),
            "coa_ready": coa_ready,
            "finance_accounts_ready": finance_accounts_ready,
            "mappings_complete": mappings_complete,
            "missing_required_accounts": missing_coa,
            "missing_required_mappings": missing_mappings,
            "required_coa_system_codes": list(REQUIRED_COA_SYSTEM_CODES),
            "required_mapping_purposes": list(REQUIRED_MAPPING_PURPOSES),
            "ledger_anchor_present": ledger_anchor_present,
            "real_settlement_accounts_present": settlement_ready,
        }

    @staticmethod
    @transaction.atomic
    def bootstrap(*, actor=None, dry_run: bool = False) -> dict[str, Any]:
        coa = AccountingSetupService.seed_default_chart_of_accounts(actor=actor, dry_run=dry_run)
        finance = AccountingSetupService.seed_default_finance_accounts(actor=actor, dry_run=dry_run)
        mappings = AccountingSetupService.create_default_mappings(actor=actor, dry_run=dry_run)
        validation = AccountingSetupService.validate_accounting_setup()
        if not dry_run:
            anchor = ChartOfAccount.objects.order_by("id").first()
            log_audit(
                action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                instance=anchor,
                performed_by=actor,
                metadata={"event": "ACCOUNTING_SETUP_BOOTSTRAP_RUN", "validation_status": validation["status"]},
            )
        return {
            "dry_run": dry_run,
            "chart_of_accounts": coa.__dict__,
            "finance_accounts": finance.__dict__,
            "mappings": mappings.__dict__,
            "validation": validation,
        }
