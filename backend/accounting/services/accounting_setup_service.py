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
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


REQUIRED_COA: list[tuple[str, str, str]] = [
    ("ASSET", "Cash in Hand", "DEFAULT_ASSET_CASH_IN_HAND"),
    ("ASSET", "Bank Account", "DEFAULT_ASSET_BANK_ACCOUNT"),
    ("ASSET", "UPI/Payment Gateway", "DEFAULT_ASSET_UPI_GATEWAY"),
    ("ASSET", "Customer Receivables", "DEFAULT_ASSET_CUSTOMER_RECEIVABLES"),
    ("ASSET", "Inventory Asset", "DEFAULT_ASSET_INVENTORY"),
    ("LIABILITY", "Rent/Lease Security Deposit Liability", "DEFAULT_LIAB_SECURITY_DEPOSIT"),
    ("LIABILITY", "Partner Commission Payable", "DEFAULT_LIAB_PARTNER_COMMISSION"),
    ("LIABILITY", "Vendor Payable", "DEFAULT_LIAB_VENDOR_PAYABLE"),
    ("LIABILITY", "Tax Payable", "DEFAULT_LIAB_TAX_PAYABLE"),
    ("INCOME", "Advance EMI Collection Income", "DEFAULT_INC_EMI"),
    ("INCOME", "Rent Income", "DEFAULT_INC_RENT"),
    ("INCOME", "Lease Income", "DEFAULT_INC_LEASE"),
    ("INCOME", "Direct Sale Revenue", "DEFAULT_INC_DIRECT_SALE"),
    ("INCOME", "Damage Recovery Income", "DEFAULT_INC_DAMAGE_RECOVERY"),
    ("EXPENSE", "Lucky Winner Waiver/Loss", "DEFAULT_EXP_WAIVER_LOSS"),
    ("EXPENSE", "Discount/Adjustment", "DEFAULT_EXP_DISCOUNT_ADJ"),
    ("EXPENSE", "Inventory Damage/Loss", "DEFAULT_EXP_INVENTORY_DAMAGE"),
    ("EXPENSE", "Maintenance Expense", "DEFAULT_EXP_MAINTENANCE"),
    ("EXPENSE", "Commission Expense", "DEFAULT_EXP_COMMISSION"),
]

REQUIRED_FINANCE_ACCOUNTS: list[tuple[str, str]] = [
    ("Main Cash Desk", "CASH"),
    ("UPI Account", "UPI"),
    ("Main Bank Account", "BANK"),
    ("Customer Receivable", "CASH"),
    ("Security Deposit Liability", "BANK"),
    ("Advance EMI Collection", "BANK"),
    ("Rent Income", "BANK"),
    ("Lease Income", "BANK"),
    ("Direct Sale Income", "BANK"),
    ("Waiver/Loss", "BANK"),
    ("Partner Commission Payable", "BANK"),
    ("Damage Deduction/Recovery", "BANK"),
    ("Inventory Stock Value", "BANK"),
]

DEFAULT_MAPPINGS: list[tuple[str, str, str]] = [
    ("Main Cash Desk", "Cash in Hand", "CASH_COLLECTION"),
    ("UPI Account", "UPI/Payment Gateway", "UPI_COLLECTION"),
    ("Main Bank Account", "Bank Account", "BANK_COLLECTION"),
    ("Customer Receivable", "Customer Receivables", "CUSTOMER_RECEIVABLE"),
    ("Security Deposit Liability", "Rent/Lease Security Deposit Liability", "SECURITY_DEPOSIT_LIABILITY"),
    ("Advance EMI Collection", "Advance EMI Collection Income", "EMI_INCOME"),
    ("Rent Income", "Rent Income", "RENT_INCOME"),
    ("Lease Income", "Lease Income", "LEASE_INCOME"),
    ("Direct Sale Income", "Direct Sale Revenue", "DIRECT_SALE_INCOME"),
    ("Waiver/Loss", "Lucky Winner Waiver/Loss", "WAIVER_LOSS"),
    ("Partner Commission Payable", "Partner Commission Payable", "COMMISSION_PAYABLE"),
    ("Damage Deduction/Recovery", "Damage Recovery Income", "DAMAGE_RECOVERY"),
    ("Inventory Stock Value", "Inventory Asset", "INVENTORY_ASSET"),
]

REQUIRED_PURPOSES: tuple[str, ...] = tuple(purpose for _, _, purpose in DEFAULT_MAPPINGS)

PURPOSE_EXPECTED_ACCOUNT_TYPES: dict[str, tuple[str, ...]] = {
    FinanceAccountMappingPurpose.CASH_COLLECTION: (ChartOfAccountType.ASSET,),
    FinanceAccountMappingPurpose.UPI_COLLECTION: (ChartOfAccountType.ASSET,),
    FinanceAccountMappingPurpose.BANK_COLLECTION: (ChartOfAccountType.ASSET,),
    FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE: (ChartOfAccountType.ASSET,),
    FinanceAccountMappingPurpose.SECURITY_DEPOSIT_LIABILITY: (ChartOfAccountType.LIABILITY,),
    FinanceAccountMappingPurpose.EMI_INCOME: (ChartOfAccountType.INCOME,),
    FinanceAccountMappingPurpose.RENT_INCOME: (ChartOfAccountType.INCOME,),
    FinanceAccountMappingPurpose.LEASE_INCOME: (ChartOfAccountType.INCOME,),
    FinanceAccountMappingPurpose.DIRECT_SALE_INCOME: (ChartOfAccountType.INCOME,),
    FinanceAccountMappingPurpose.WAIVER_LOSS: (ChartOfAccountType.EXPENSE, ChartOfAccountType.EQUITY),
    FinanceAccountMappingPurpose.COMMISSION_PAYABLE: (ChartOfAccountType.LIABILITY,),
    FinanceAccountMappingPurpose.DAMAGE_RECOVERY: (ChartOfAccountType.INCOME,),
    FinanceAccountMappingPurpose.INVENTORY_ASSET: (ChartOfAccountType.ASSET,),
}


@dataclass
class SetupResult:
    created: int
    existing: int
    details: list[dict[str, Any]]


class AccountingSetupService:
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
        fallback_asset = ChartOfAccount.objects.filter(account_type=ChartOfAccountType.ASSET, is_active=True).order_by("id").first()
        for name, kind in REQUIRED_FINANCE_ACCOUNTS:
            instance = FinanceAccount.objects.filter(name__iexact=name).first()
            if instance:
                existing += 1
                details.append({"name": name, "status": "existing"})
                continue
            created += 1
            details.append({"name": name, "status": "created"})
            if dry_run:
                continue
            if fallback_asset is None:
                raise ValueError("No ASSET chart account available. Seed chart of accounts first.")
            instance = FinanceAccount.objects.create(
                name=name,
                kind=kind,
                chart_account=fallback_asset,
                is_active=True,
            )
            log_audit(
                action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                instance=instance,
                performed_by=actor,
                metadata={"event": "ACCOUNTING_SETUP_FINANCE_ACCOUNT_CREATED"},
            )
        return SetupResult(created=created, existing=existing, details=details)

    @staticmethod
    def create_default_mappings(*, actor=None, dry_run: bool = False) -> SetupResult:
        created = 0
        existing = 0
        details: list[dict[str, Any]] = []
        for finance_name, chart_name, purpose in DEFAULT_MAPPINGS:
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
                details.append({"purpose": purpose, "status": "existing"})
                continue
            created += 1
            details.append({"purpose": purpose, "status": "created"})
            if dry_run:
                continue
            mapping = FinanceAccountCoaMapping.objects.create(
                finance_account=finance,
                chart_account=chart,
                purpose=purpose,
                is_default=True,
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
    def get_setup_warnings() -> list[dict[str, str]]:
        warnings: list[dict[str, str]] = []
        active_finance_accounts = FinanceAccount.objects.filter(is_active=True)
        for account in active_finance_accounts:
            has_mapping = FinanceAccountCoaMapping.objects.filter(finance_account=account, is_active=True).exists()
            if not has_mapping:
                warnings.append({"code": "UNMAPPED_FINANCE_ACCOUNT", "message": f"{account.name} has no active COA mapping."})

        active_mappings = FinanceAccountCoaMapping.objects.select_related("chart_account", "finance_account").filter(is_active=True)
        default_counts: dict[str, int] = {}
        mapped_purposes: set[str] = set()
        for mapping in active_mappings:
            purpose = mapping.purpose
            mapped_purposes.add(purpose)
            if mapping.is_default:
                default_counts[purpose] = default_counts.get(purpose, 0) + 1
            if not mapping.chart_account.is_active:
                warnings.append({"code": "INACTIVE_CHART_ACCOUNT", "message": f"{mapping.finance_account.name} maps to inactive chart account {mapping.chart_account.name}."})
            expected_types = PURPOSE_EXPECTED_ACCOUNT_TYPES.get(mapping.purpose)
            if expected_types and mapping.chart_account.account_type not in expected_types:
                expected_types_label = ", ".join(expected_types)
                warnings.append(
                    {
                        "code": "MAPPING_ACCOUNT_TYPE_MISMATCH",
                        "message": (
                            f"{mapping.finance_account.name} mapping for {mapping.purpose} "
                            f"uses {mapping.chart_account.account_type}, expected {expected_types_label}."
                        ),
                    }
                )

        for purpose, count in default_counts.items():
            if count > 1:
                warnings.append({"code": "DUPLICATE_DEFAULT_MAPPING", "message": f"Purpose {purpose} has {count} default mappings."})
        for purpose in REQUIRED_PURPOSES:
            if purpose not in mapped_purposes:
                warnings.append(
                    {
                        "code": "MISSING_REQUIRED_PURPOSE",
                        "message": f"No active mapping configured for required purpose {purpose}.",
                    }
                )
        return warnings

    @staticmethod
    def validate_accounting_setup() -> dict[str, Any]:
        warnings = AccountingSetupService.get_setup_warnings()
        return {
            "status": "READY" if not warnings else "NEEDS_ATTENTION",
            "warnings_count": len(warnings),
            "warnings": warnings,
            "last_validated_at": timezone.now().isoformat(),
            "coa_ready": ChartOfAccount.objects.filter(is_active=True).exists(),
            "finance_accounts_ready": FinanceAccount.objects.filter(is_active=True).exists(),
            "mappings_complete": len(warnings) == 0,
        }

    @staticmethod
    @transaction.atomic
    def bootstrap(*, actor=None, dry_run: bool = False) -> dict[str, Any]:
        coa = AccountingSetupService.seed_default_chart_of_accounts(actor=actor, dry_run=dry_run)
        finance = AccountingSetupService.seed_default_finance_accounts(actor=actor, dry_run=dry_run)
        mappings = AccountingSetupService.create_default_mappings(actor=actor, dry_run=dry_run)
        validation = AccountingSetupService.validate_accounting_setup()
        if not dry_run:
            log_audit(
                action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                instance=ChartOfAccount.objects.order_by("id").first(),
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
