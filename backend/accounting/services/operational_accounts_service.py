from __future__ import annotations

from accounting.models import ChartOfAccountType
from accounting.services.accounting_setup_catalog import CANONICAL_CHART_ACCOUNTS
from accounting.services.gst_document_posting_service import _ensure_system_account


def ensure_phase3_system_accounts():
    """
    Ensures canonical system accounts exist with stable codes.

    Compatibility:
    - Existing keys like ACCOUNTS_RECEIVABLE remain available, but now point to the
      canonical CUSTOMER_RECEIVABLE (AR-1000) account.
    """

    accounts = {}

    for spec in CANONICAL_CHART_ACCOUNTS:
        accounts[spec.key] = _ensure_system_account(
            system_code=spec.key,
            code=spec.code,
            name=spec.name,
            account_type=spec.account_type,
        )

    # Legacy return-key compatibility (do not break existing callers).
    ar = accounts["CUSTOMER_RECEIVABLE"]
    accounts["ACCOUNTS_RECEIVABLE"] = ar

    adv = accounts["CUSTOMER_ADVANCE_UNEARNED_REVENUE"]
    accounts["CUSTOMER_ADVANCES"] = adv

    wip = accounts["WORK_IN_PROGRESS_INVENTORY"]
    accounts["WIP_INVENTORY"] = wip

    # Non-catalog accounts that remain required by existing operational flows.
    accounts["MANUFACTURING_SCRAP_EXPENSE"] = _ensure_system_account(
        system_code="MANUFACTURING_SCRAP_EXPENSE",
        code="MFG-5200",
        name="Manufacturing Scrap Expense",
        account_type=ChartOfAccountType.EXPENSE,
    )

    return accounts
