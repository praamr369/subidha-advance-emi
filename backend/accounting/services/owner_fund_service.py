"""Owner Fund Injection service — capital injections and owner loans."""
from __future__ import annotations

import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict

from django.db import transaction

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    JournalEntryType,
    OWNER_CAPITAL_SYSTEM_CODE,
    OWNER_LOAN_SYSTEM_CODE,
    OwnerFundInjection,
    OwnerFundInjectionStatus,
    OwnerFundInjectionType,
    OwnerLoanInterestType,
    OwnerLoanRepaymentFrequency,
    OwnerLoanRepayment,
)
from accounting.services.journal_posting_service import (
    create_journal_entry,
    post_journal_entry,
)


def _get_or_create_owner_coa(system_code: str, name: str, account_type: str) -> ChartOfAccount:
    obj, _ = ChartOfAccount.objects.get_or_create(
        system_code=system_code,
        defaults={
            "name": name,
            "account_type": account_type,
            "allow_manual_posting": True,
            "is_active": True,
        },
    )
    return obj


def _finance_account_coa(finance_account: FinanceAccount) -> ChartOfAccount:
    if finance_account.chart_account_id:
        return finance_account.chart_account
    raise ValueError(
        f"Finance account '{finance_account.name}' has no linked Chart of Account. "
        "Configure the finance account first."
    )


def _periods_per_year(frequency: str) -> int:
    return {"MONTHLY": 12, "QUARTERLY": 4, "LUMP_SUM": 1}.get(frequency, 12)


def compute_repayment_schedule(
    principal: Decimal,
    tenure_months: int,
    annual_rate: Decimal,
    interest_type: str,
    frequency: str,
    start_date: datetime.date,
) -> List[Dict]:
    """
    Returns a list of schedule line dicts:
      {installment, due_date, principal, interest, total, balance}
    """
    zero = Decimal("0.00")
    if tenure_months <= 0:
        return []

    periods_per_yr = _periods_per_year(frequency)
    months_per_period = 12 // periods_per_yr if frequency != "LUMP_SUM" else tenure_months
    total_periods = tenure_months // months_per_period if frequency != "LUMP_SUM" else 1

    rate_per_period = (annual_rate / Decimal("100") / Decimal(str(periods_per_yr))).quantize(
        Decimal("0.000001"), rounding=ROUND_HALF_UP
    ) if annual_rate else zero

    schedule = []
    balance = principal

    if frequency == "LUMP_SUM":
        if interest_type == OwnerLoanInterestType.FLAT or interest_type == OwnerLoanInterestType.NONE:
            total_interest = (principal * annual_rate / Decimal("100") * Decimal(str(tenure_months)) / Decimal("12")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            ) if annual_rate else zero
        else:
            total_interest = zero
        schedule.append({
            "installment": 1,
            "due_date": _add_months(start_date, tenure_months).isoformat(),
            "principal": str(principal),
            "interest": str(total_interest),
            "total": str(principal + total_interest),
            "balance": "0.00",
        })
        return schedule

    for i in range(1, total_periods + 1):
        due_date = _add_months(start_date, i * months_per_period)

        if interest_type == OwnerLoanInterestType.NONE:
            interest = zero
            principal_part = (principal / Decimal(str(total_periods))).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        elif interest_type == OwnerLoanInterestType.FLAT:
            interest = (principal * rate_per_period).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            principal_part = (principal / Decimal(str(total_periods))).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        else:  # REDUCING
            interest = (balance * rate_per_period).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            emi = _reducing_emi(principal, rate_per_period, total_periods)
            principal_part = (emi - interest).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        # Last period: clear rounding remainder
        if i == total_periods:
            principal_part = balance

        balance = max(zero, balance - principal_part)

        schedule.append({
            "installment": i,
            "due_date": due_date.isoformat(),
            "principal": str(principal_part),
            "interest": str(interest),
            "total": str(principal_part + interest),
            "balance": str(balance),
        })

    return schedule


def _reducing_emi(principal: Decimal, rate_per_period: Decimal, n: int) -> Decimal:
    if rate_per_period == 0:
        return (principal / Decimal(str(n))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    r = float(rate_per_period)
    p = float(principal)
    emi = p * r * (1 + r) ** n / ((1 + r) ** n - 1)
    return Decimal(str(round(emi, 2)))


def _add_months(d: datetime.date, months: int) -> datetime.date:
    m = d.month + months
    y = d.year + (m - 1) // 12
    m = (m - 1) % 12 + 1
    import calendar
    day = min(d.day, calendar.monthrange(y, m)[1])
    return datetime.date(y, m, day)


@transaction.atomic
def create_owner_fund_injection(
    *,
    injection_type: str,
    amount: Decimal,
    date: datetime.date,
    finance_account: FinanceAccount,
    description: str = "",
    reference: str = "",
    tenure_months: int | None = None,
    interest_rate: Decimal | None = None,
    interest_type: str = OwnerLoanInterestType.NONE,
    repayment_frequency: str = OwnerLoanRepaymentFrequency.MONTHLY,
    repayment_start_date: datetime.date | None = None,
    performed_by,
) -> OwnerFundInjection:
    asset_coa = _finance_account_coa(finance_account)

    if injection_type == OwnerFundInjectionType.CAPITAL:
        contra_coa = _get_or_create_owner_coa(
            OWNER_CAPITAL_SYSTEM_CODE, "Owner's Capital", ChartOfAccountType.EQUITY
        )
        memo = f"Capital injection by owner — {description or reference or 'fund transfer'}"
    else:
        contra_coa = _get_or_create_owner_coa(
            OWNER_LOAN_SYSTEM_CODE, "Owner's Loan Payable", ChartOfAccountType.LIABILITY
        )
        memo = f"Owner loan received — {description or reference or 'fund transfer'}"

    journal = create_journal_entry(
        entry_date=date,
        entry_type=JournalEntryType.MONEY_MOVEMENT,
        memo=memo,
        source_model="OwnerFundInjection",
        lines=[
            {"chart_account": asset_coa, "debit_amount": amount, "credit_amount": Decimal("0.00")},
            {"chart_account": contra_coa, "debit_amount": Decimal("0.00"), "credit_amount": amount},
        ],
    )
    post_journal_entry(journal_entry_id=journal.id, posted_by=performed_by)

    # Compute total interest for loan profile
    total_interest = Decimal("0.00")
    if injection_type == OwnerFundInjectionType.LOAN and tenure_months and interest_rate:
        schedule = compute_repayment_schedule(
            principal=amount,
            tenure_months=tenure_months,
            annual_rate=interest_rate,
            interest_type=interest_type,
            frequency=repayment_frequency,
            start_date=repayment_start_date or date,
        )
        total_interest = sum(Decimal(s["interest"]) for s in schedule)

    injection = OwnerFundInjection.objects.create(
        injection_type=injection_type,
        amount=amount,
        date=date,
        finance_account=finance_account,
        description=description,
        reference=reference,
        status=OwnerFundInjectionStatus.POSTED,
        posted_journal_entry=journal,
        loan_outstanding=amount if injection_type == OwnerFundInjectionType.LOAN else Decimal("0.00"),
        tenure_months=tenure_months if injection_type == OwnerFundInjectionType.LOAN else None,
        interest_rate=interest_rate if injection_type == OwnerFundInjectionType.LOAN else None,
        interest_type=interest_type if injection_type == OwnerFundInjectionType.LOAN else OwnerLoanInterestType.NONE,
        repayment_frequency=repayment_frequency if injection_type == OwnerFundInjectionType.LOAN else OwnerLoanRepaymentFrequency.MONTHLY,
        repayment_start_date=repayment_start_date if injection_type == OwnerFundInjectionType.LOAN else None,
        total_interest=total_interest,
        performed_by=performed_by,
    )
    return injection


@transaction.atomic
def create_owner_loan_repayment(
    *,
    injection: OwnerFundInjection,
    amount: Decimal,
    date: datetime.date,
    finance_account: FinanceAccount,
    notes: str = "",
    performed_by,
) -> OwnerLoanRepayment:
    if injection.injection_type != OwnerFundInjectionType.LOAN:
        raise ValueError("Repayments can only be recorded against Owner Loan injections.")
    if amount > injection.loan_outstanding:
        raise ValueError(
            f"Repayment ₹{amount} exceeds outstanding loan balance ₹{injection.loan_outstanding}."
        )

    asset_coa = _finance_account_coa(finance_account)
    loan_coa = _get_or_create_owner_coa(
        OWNER_LOAN_SYSTEM_CODE, "Owner's Loan Payable", ChartOfAccountType.LIABILITY
    )

    journal = create_journal_entry(
        entry_date=date,
        entry_type=JournalEntryType.MONEY_MOVEMENT,
        memo=f"Owner loan repayment — {notes or 'repayment'}",
        source_model="OwnerLoanRepayment",
        lines=[
            {"chart_account": loan_coa, "debit_amount": amount, "credit_amount": Decimal("0.00")},
            {"chart_account": asset_coa, "debit_amount": Decimal("0.00"), "credit_amount": amount},
        ],
    )
    post_journal_entry(journal_entry_id=journal.id, posted_by=performed_by)

    repayment = OwnerLoanRepayment.objects.create(
        injection=injection,
        amount=amount,
        date=date,
        finance_account=finance_account,
        notes=notes,
        posted_journal_entry=journal,
        performed_by=performed_by,
    )

    injection.loan_outstanding -= amount
    injection.save(update_fields=["loan_outstanding", "updated_at"])

    return repayment


def get_owner_funds_summary(business=None) -> dict:
    injections = OwnerFundInjection.objects.filter(status=OwnerFundInjectionStatus.POSTED)

    capital_total = sum(
        i.amount for i in injections.filter(injection_type=OwnerFundInjectionType.CAPITAL)
    )
    loan_total = sum(
        i.amount for i in injections.filter(injection_type=OwnerFundInjectionType.LOAN)
    )
    loan_outstanding = sum(
        i.loan_outstanding for i in injections.filter(injection_type=OwnerFundInjectionType.LOAN)
    )
    loan_repaid = loan_total - loan_outstanding

    return {
        "total_capital_injected": str(capital_total),
        "total_loan_injected": str(loan_total),
        "total_loan_outstanding": str(loan_outstanding),
        "total_loan_repaid": str(loan_repaid),
        "total_funds_in": str(capital_total + loan_total),
    }
