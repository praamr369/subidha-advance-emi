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

# Profiles-only finance row used exclusively for FinanceAccountCoaMapping FK (not a cash desk).
LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME = "Ledger posting profiles (system)"

REQUIRED_COA: list[tuple[str, str, str]] = [
    ("ASSET", "Cash in Hand", "DEFAULT_ASSET_CASH_IN_HAND"),
    ("ASSET", "Bank Account", "DEFAULT_ASSET_BANK_ACCOUNT"),
    ("ASSET", "UPI/Payment Gateway", "DEFAULT_ASSET_UPI_GATEWAY"),
    ("ASSET", "Customer Receivables", "DEFAULT_ASSET_CUSTOMER_RECEIVABLES"),
    ("ASSET", "Inventory Asset", "DEFAULT_ASSET_INVENTORY"),
    ("ASSET", "Rental & Lease Assets", "DEFAULT_ASSET_RENTAL_LEASE"),
    ("ASSET", "Security Deposit Receivable", "DEFAULT_ASSET_SEC_DEP_RECEIVABLE"),
    ("ASSET", "Advance to Vendors", "DEFAULT_ASSET_ADVANCE_VENDOR"),
    ("LIABILITY", "Rent/Lease Security Deposit Liability", "DEFAULT_LIAB_SECURITY_DEPOSIT"),
    ("LIABILITY", "Partner Commission Payable", "DEFAULT_LIAB_PARTNER_COMMISSION"),
    ("LIABILITY", "Vendor Payable", "DEFAULT_LIAB_VENDOR_PAYABLE"),
    ("LIABILITY", "Tax Payable", "DEFAULT_LIAB_TAX_PAYABLE"),
    ("LIABILITY", "Customer Advance / Unearned Revenue", "DEFAULT_LIAB_CUSTOMER_ADVANCE"),
    ("INCOME", "Advance EMI Collection Income", "DEFAULT_INC_EMI"),
    ("INCOME", "Rent Income", "DEFAULT_INC_RENT"),
    ("INCOME", "Lease Income", "DEFAULT_INC_LEASE"),
    ("INCOME", "Direct Sale Revenue", "DEFAULT_INC_DIRECT_SALE"),
    ("INCOME", "Delivery Charges Income", "DEFAULT_INC_DELIVERY_CHARGES"),
    ("INCOME", "Damage Recovery Income", "DEFAULT_INC_DAMAGE_RECOVERY"),
    ("EXPENSE", "Lucky Winner Waiver/Loss", "DEFAULT_EXP_WAIVER_LOSS"),
    ("EXPENSE", "Discount/Adjustment", "DEFAULT_EXP_DISCOUNT_ADJ"),
    ("EXPENSE", "Inventory Damage/Loss", "DEFAULT_EXP_INVENTORY_DAMAGE"),
    ("EXPENSE", "Maintenance Expense", "DEFAULT_EXP_MAINTENANCE"),
    ("EXPENSE", "Commission Expense", "DEFAULT_EXP_COMMISSION"),
    ("EXPENSE", "Delivery Expense", "DEFAULT_EXP_DELIVERY"),
    ("EXPENSE", "Staff Salary Expense", "DEFAULT_EXP_SALARY"),
    ("EQUITY", "Owner Capital", "DEFAULT_EQ_OWNER_CAPITAL"),
    ("EQUITY", "Retained Earnings / Opening Balance Adjustment", "DEFAULT_EQ_RETAINED_EARNINGS"),
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
    ("UPI Account", "UPI/Payment Gateway", FinanceAccountMappingPurpose.UPI_COLLECTION, True),
    (
        "Payment Gateway Settlement Account",
        "UPI/Payment Gateway",
        FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION,
        True,
    ),
    (
        LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
        "Customer Receivables",
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
        "Customer Advance / Unearned Revenue",
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
        "Direct Sale Revenue",
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
        "Lucky Winner Waiver/Loss",
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
        "Commission Expense",
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
        "Staff Salary Expense",
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
    FinanceAccountMappingPurpose.WAIVER_LOSS: (ChartOfAccountType.EXPENSE, ChartOfAccountType.EQUITY),
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


class AccountingSetupService:
    @staticmethod
    def _resolve_anchor_chart_account():
        anchor = ChartOfAccount.objects.filter(system_code="DEFAULT_ASSET_CASH_IN_HAND", is_active=True).first()
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
        fallback_asset = AccountingSetupService._resolve_anchor_chart_account()
        if fallback_asset is None and not dry_run:
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
            instance = FinanceAccount.objects.create(
                name=name,
                kind=kind,
                chart_account=fallback_asset,
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
                ledger = FinanceAccount.objects.create(
                    name=ledger_name,
                    kind=FinanceAccountKind.BANK,
                    chart_account=fallback_asset,
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
    def get_setup_warnings() -> list[dict[str, str]]:
        warnings: list[dict[str, str]] = []
        ledger_key = LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME.strip().lower()

        settlement_present = FinanceAccount.objects.filter(is_active=True, is_real_settlement_account=True).exists()
        if not settlement_present:
            warnings.append(
                {
                    "code": "MISSING_ACTIVE_SETTLEMENT_ACCOUNT",
                    "message": "No active finance account flagged as a real settlement desk (cash/bank/UPI/gateway).",
                }
            )

        ledger_anchor = FinanceAccount.objects.filter(name__iexact=LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME).first()
        if ledger_anchor is None or not ledger_anchor.is_active:
            warnings.append(
                {
                    "code": "MISSING_LEDGER_PROFILE_ANCHOR",
                    "message": "Ledger posting profile anchor finance account is missing or inactive.",
                }
            )

        active_finance_accounts = FinanceAccount.objects.filter(is_active=True)
        for account in active_finance_accounts:
            has_mapping = FinanceAccountCoaMapping.objects.filter(finance_account=account, is_active=True).exists()
            if not has_mapping:
                warnings.append({"code": "UNMAPPED_FINANCE_ACCOUNT", "message": f"{account.name} has no active COA mapping."})

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
                    {
                        "code": "SETTLEMENT_ACCOUNT_WITHOUT_COLLECTION_MAPPING",
                        "message": (
                            f"{account.name} is marked as a settlement desk but has no cash/UPI/bank/gateway "
                            "collection-purpose mapping."
                        ),
                    }
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
                    {
                        "code": "FINANCE_ACCOUNT_LOOKS_CONCEPTUAL",
                        "message": (
                            f"{account.name} looks like an income/liability ledger concept but is flagged as a "
                            "settlement desk; income and liabilities belong on the chart via mappings."
                        ),
                    }
                )

            if (
                account.is_active
                and not account.is_real_settlement_account
                and name_lower != ledger_key
            ):
                warnings.append(
                    {
                        "code": "LEGACY_NON_SETTLEMENT_FINANCE_ACCOUNT",
                        "message": (
                            f"{account.name} is not flagged as a settlement desk; verify it is intentional legacy "
                            "data or deactivate after migrating mappings."
                        ),
                    }
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
                    {
                        "code": "INACTIVE_CHART_ACCOUNT",
                        "message": (
                            f"{mapping.finance_account.name} maps to inactive chart account "
                            f"{mapping.chart_account.name}."
                        ),
                    }
                )
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
                    {
                        "code": "SETTLEMENT_ACCOUNT_NON_COLLECTION_PURPOSE",
                        "message": (
                            f"{fa.name} is a settlement desk but participates in mapping purpose "
                            f"{mapping.purpose}; prefer linking ledger-only purposes via "
                            f"{LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME}."
                        ),
                    }
                )

        for purpose, count in default_counts.items():
            if count > 1:
                warnings.append(
                    {
                        "code": "DUPLICATE_DEFAULT_MAPPING",
                        "message": f"Purpose {purpose} has {count} default mappings.",
                    }
                )

        for purpose in REQUIRED_MAPPING_PURPOSES:
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
        missing_coa = AccountingSetupService.missing_required_coa_codes()
        missing_mappings = AccountingSetupService.missing_required_mapping_purposes()
        ledger_anchor_present = FinanceAccount.objects.filter(
            name__iexact=LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
            is_active=True,
        ).exists()
        settlement_ready = FinanceAccount.objects.filter(is_active=True, is_real_settlement_account=True).exists()

        blocking_codes = {
            "MISSING_REQUIRED_PURPOSE",
            "MAPPING_ACCOUNT_TYPE_MISMATCH",
            "DUPLICATE_DEFAULT_MAPPING",
            "MISSING_ACTIVE_SETTLEMENT_ACCOUNT",
            "MISSING_LEDGER_PROFILE_ANCHOR",
        }
        blocking_warnings = [w for w in warnings if w.get("code") in blocking_codes]

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
