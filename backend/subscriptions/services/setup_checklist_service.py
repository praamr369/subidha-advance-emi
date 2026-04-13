from subscriptions.models_business_setup import (
    Branch,
    BusinessProfile,
    CashDesk,
    ChartAccount,
    FinanceAccount,
    FinanceAccountType,
    StaffOperationalAssignment,
)


def _item(*, key: str, label: str, is_complete: bool, detail: str, route: str, is_warning: bool = False):
    status = "complete" if is_complete else ("warning" if is_warning else "missing")
    return {
        "key": key,
        "label": label,
        "status": status,
        "detail": detail,
        "route": route,
    }


def compute_setup_checklist():
    active_profile = BusinessProfile.objects.filter(is_active=True).exists()
    active_branches = Branch.objects.filter(is_active=True)
    active_finance_accounts = FinanceAccount.objects.filter(is_active=True)
    active_cash_desks = CashDesk.objects.filter(is_active=True)
    active_assignments = StaffOperationalAssignment.objects.filter(is_active=True)
    collectible_assignments = active_assignments.filter(can_collect_payments=True)
    verifiable_assignments = active_assignments.filter(can_verify_payments=True)
    chart_accounts = ChartAccount.objects.filter(is_active=True)

    has_cash_account = active_finance_accounts.filter(account_type=FinanceAccountType.CASH).exists()
    has_bank_or_upi = active_finance_accounts.filter(account_type__in=[FinanceAccountType.BANK, FinanceAccountType.UPI]).exists()
    has_payment_operator = collectible_assignments.exists() or verifiable_assignments.exists()

    items = [
        _item(
            key="business_profile",
            label="Business profile configured",
            is_complete=active_profile,
            detail="Active business profile is available." if active_profile else "Create the legal and operational business profile.",
            route="/admin/settings/business-setup/profile",
        ),
        _item(
            key="branch",
            label="Active branch available",
            is_complete=active_branches.exists(),
            detail=f"{active_branches.count()} active branch(es) configured." if active_branches.exists() else "Create at least one active branch.",
            route="/admin/settings/business-setup/branches",
        ),
        _item(
            key="finance_accounts",
            label="Active finance account available",
            is_complete=active_finance_accounts.exists(),
            detail=f"{active_finance_accounts.count()} active finance account(s) configured." if active_finance_accounts.exists() else "Create at least one active finance account.",
            route="/admin/settings/business-setup/finance-accounts",
        ),
        _item(
            key="cash_finance_account",
            label="Cash finance account available",
            is_complete=has_cash_account,
            detail="At least one active cash account exists." if has_cash_account else "Create at least one active cash finance account.",
            route="/admin/settings/business-setup/finance-accounts",
        ),
        _item(
            key="bank_or_upi_finance_account",
            label="Bank or UPI finance account available",
            is_complete=has_bank_or_upi,
            detail="At least one bank or UPI account exists." if has_bank_or_upi else "Create at least one bank or UPI finance account.",
            route="/admin/settings/business-setup/finance-accounts",
        ),
        _item(
            key="cash_desk",
            label="Active cash desk available",
            is_complete=active_cash_desks.exists(),
            detail=f"{active_cash_desks.count()} active cash desk(s) configured." if active_cash_desks.exists() else "Create at least one active cash desk.",
            route="/admin/settings/business-setup/cash-desks",
        ),
        _item(
            key="staff_assignment",
            label="Staff operational assignment available",
            is_complete=active_assignments.exists(),
            detail=f"{active_assignments.count()} active assignment(s) configured." if active_assignments.exists() else "Assign at least one staff member operationally.",
            route="/admin/settings/business-setup/staff",
        ),
        _item(
            key="payment_operator",
            label="Payment collection or verification operator available",
            is_complete=has_payment_operator,
            detail="At least one active assignment can collect or verify payments." if has_payment_operator else "Grant collection or verification permissions to at least one active assignment.",
            route="/admin/settings/business-setup/staff",
        ),
        _item(
            key="chart_accounts",
            label="Chart of accounts minimally configured",
            is_complete=chart_accounts.count() >= 3,
            detail=f"{chart_accounts.count()} active chart account(s) configured." if chart_accounts.exists() else "Create the minimum chart of accounts classification heads.",
            route="/admin/settings/business-setup/chart-accounts",
        ),
    ]

    completed = sum(1 for item in items if item["status"] == "complete")
    percent_complete = int(round((completed / len(items)) * 100)) if items else 0
    is_ready_for_go_live = all(item["status"] == "complete" for item in items)

    return {
        "is_ready_for_go_live": is_ready_for_go_live,
        "percent_complete": percent_complete,
        "items": items,
    }
