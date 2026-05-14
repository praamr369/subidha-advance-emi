from __future__ import annotations

from typing import Any

from accounting.models import (
    AccountingPostingProfile,
    BusinessTaxProfile,
    ChartOfAccount,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountMappingPurpose,
)
from branch_control.models import Branch, CashCounter
from inventory.models import Warehouse
from subscriptions.models import ProductCategoryMaster
from subscriptions.services.business_setup_service import get_active_business_profile


def get_setup_readiness() -> dict[str, Any]:
    blocking_issues: list[str] = []
    warnings: list[str] = []

    business_profile_configured = bool(get_active_business_profile())
    active_tax_profile = BusinessTaxProfile.objects.filter(is_active=True).order_by("-effective_from", "-id").first()
    active_tax_profile_exists = active_tax_profile is not None
    active_tax_profile_is_gst_unregistered = bool(active_tax_profile and active_tax_profile.mode == "GST_UNREGISTERED")
    coa_exists = ChartOfAccount.objects.filter(is_active=True).exists()
    finance_accounts_exist = FinanceAccount.objects.filter(is_active=True).exists()
    payment_collection_account_exists = FinanceAccountCoaMapping.objects.filter(
        is_active=True,
        purpose__in=[
            FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
            FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION,
        ],
    ).exists()
    operational_mappings_complete = FinanceAccountCoaMapping.objects.filter(is_active=True).exists()
    branch_exists = Branch.objects.exists()
    counter_exists = CashCounter.objects.filter(is_active=True).exists()
    warehouse_exists = Warehouse.objects.filter(is_active=True).exists()
    product_category_exists = ProductCategoryMaster.objects.filter(is_active=True).exists()
    posting_profiles_exist = AccountingPostingProfile.objects.filter(is_active=True).exists()

    if not business_profile_configured:
        blocking_issues.append("Business profile is missing.")
    if not active_tax_profile_exists:
        blocking_issues.append("Active business tax profile is missing.")
    if active_tax_profile_exists and not active_tax_profile_is_gst_unregistered:
        warnings.append("Active tax profile is not GST_UNREGISTERED.")
    if not coa_exists:
        blocking_issues.append("Chart of accounts is not configured.")
    if not finance_accounts_exist:
        blocking_issues.append("Finance accounts are missing.")
    if not payment_collection_account_exists:
        blocking_issues.append("Payment collection account mapping is missing.")
    if not branch_exists:
        blocking_issues.append("No branch exists.")
    if not counter_exists:
        blocking_issues.append("No active counter exists.")
    if not warehouse_exists:
        blocking_issues.append("No active warehouse exists.")
    if not product_category_exists:
        warnings.append("No active product category exists.")
    if not posting_profiles_exist:
        blocking_issues.append("Accounting posting profiles are missing.")

    ready_base = len(blocking_issues) == 0
    return {
        "business_profile_configured": business_profile_configured,
        "active_tax_profile_exists": active_tax_profile_exists,
        "active_tax_profile_is_gst_unregistered": active_tax_profile_is_gst_unregistered,
        "coa_exists": coa_exists,
        "finance_accounts_exist": finance_accounts_exist,
        "payment_collection_account_exists": payment_collection_account_exists,
        "operational_mappings_complete": operational_mappings_complete,
        "branch_exists": branch_exists,
        "counter_exists": counter_exists,
        "warehouse_exists": warehouse_exists,
        "product_category_exists": product_category_exists,
        "posting_profiles_exist": posting_profiles_exist,
        "ready_for_direct_sale": ready_base,
        "ready_for_advance_emi": ready_base,
        "ready_for_rent_lease": ready_base and posting_profiles_exist,
        "ready_for_purchase": ready_base and warehouse_exists,
        "blocking_issues": blocking_issues,
        "warnings": warnings,
    }
