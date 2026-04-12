from __future__ import annotations

from accounting.services.reporting_service import (
    build_finance_book,
    build_purchase_book,
    build_sales_book,
)


def build_daily_billing_book(*, start_date=None, end_date=None, branch_id=None):
    return build_sales_book(start_date=start_date, end_date=end_date, branch_id=branch_id)


def build_cash_book(*, start_date=None, end_date=None, finance_account_id=None, branch_id=None):
    payload = build_finance_book(kinds=["CASH"], start_date=start_date, end_date=end_date, branch_id=branch_id)
    if finance_account_id is None:
        return payload

    rows = [
        row
        for row in payload["rows"]
        if int(row["finance_account_id"]) == int(finance_account_id)
    ]
    return {
        **payload,
        "rows": rows,
    }


def build_purchase_register(*, start_date=None, end_date=None, branch_id=None):
    return build_purchase_book(start_date=start_date, end_date=end_date, branch_id=branch_id)
