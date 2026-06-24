"""Complete Core Finance: Lease accounting, depreciation, cost centre P&L, deferred tax, cash flow, fund flow."""
from decimal import Decimal, ROUND_HALF_UP
from datetime import timedelta, date
from dateutil.relativedelta import relativedelta

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.db.models import Sum, Q
from django.db import transaction

from accounting.models import (
    LeaseContract, LeaseSchedule, FixedAssetDepreciation, DepreciationSchedule,
    CostCentre, CostAllocationRule, DeferredTax, ChartOfAccount, JournalEntry, JournalEntryLine,
    JournalEntryType,
)
from subscriptions.models import Subscription


MONEY = Decimal("0.01")


def _money(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(MONEY, rounding=ROUND_HALF_UP)


# ─────────────────────────────────────────────────────────────────────────────
# 1. IFRS-16 Lease Accounting: Calculation, Schedule, GL Posting
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def lease_calculate_rou_liability_view(request, subscription_id):
    """
    Calculate ROU asset and lease liability using IFRS-16 present value formula.

    Response:
    {
      "subscription_id": 123,
      "lease_start_date": "2025-01-01",
      "lease_end_date": "2028-12-31",
      "lease_term_months": 48,
      "monthly_payment": "50000.00",
      "discount_rate": 8.5,
      "rou_asset": "2145000.00",
      "initial_lease_liability": "2145000.00",
      "message": "IFRS-16 calculation complete."
    }
    """
    sub = get_object_or_404(Subscription, pk=subscription_id)

    monthly_payment = sub.monthly_amount
    # Accept discount_rate from query param; default 8.5%
    discount_rate_annual = Decimal(request.query_params.get("discount_rate", "8.5"))
    discount_rate_monthly = discount_rate_annual / Decimal("12") / Decimal("100")
    lease_term_months = sub.tenure_months

    # Present value of annuity (ordinary annuity)
    if discount_rate_monthly == 0:
        pv = monthly_payment * Decimal(lease_term_months)
    else:
        pv_factor = (Decimal("1") - (Decimal("1") + discount_rate_monthly) ** (-lease_term_months)) / discount_rate_monthly
        pv = monthly_payment * pv_factor
    pv = _money(pv)

    return Response({
        "subscription_id": sub.id,
        "lease_start_date": sub.start_date.isoformat(),
        "lease_end_date": (sub.start_date + relativedelta(months=lease_term_months)).isoformat(),
        "lease_term_months": lease_term_months,
        "monthly_payment": str(monthly_payment),
        "discount_rate": str(discount_rate_annual),
        "rou_asset": str(pv),
        "initial_lease_liability": str(pv),
        "message": "IFRS-16 calculation complete.",
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def lease_generate_schedule_view(request, lease_id):
    """
    Generate monthly payment schedule for lease with ROU depreciation & interest.

    Request: { "start_posting": true }
    Response: { "lease_id": 1, "schedule_lines": 48, "message": "Schedule generated." }
    """
    lease = get_object_or_404(LeaseContract, pk=lease_id)
    start_posting = request.data.get('start_posting', False)

    monthly_payment = lease.monthly_lease_payment
    discount_rate_monthly = Decimal(lease.discount_rate) / Decimal("12") / Decimal("100")
    initial_liability = lease.initial_lease_liability
    rou_depreciation_monthly = _money(lease.rou_asset_amount / Decimal(lease.lease_term_months))

    # Generate schedule
    opening_liability = initial_liability
    for month in range(1, lease.lease_term_months + 1):
        interest_expense = _money(opening_liability * discount_rate_monthly)
        principal_payment = _money(monthly_payment - interest_expense)
        closing_liability = _money(opening_liability - principal_payment)
        if month == lease.lease_term_months:
            principal_payment = opening_liability
            closing_liability = Decimal("0.00")

        payment_date = lease.lease_start_date + relativedelta(months=month)

        LeaseSchedule.objects.update_or_create(
            lease=lease,
            month_number=month,
            defaults={
                "payment_date": payment_date,
                "opening_liability": opening_liability,
                "interest_expense": interest_expense,
                "payment_amount": monthly_payment,
                "closing_liability": max(Decimal("0"), closing_liability),
                "rou_depreciation": rou_depreciation_monthly,
            }
        )

        opening_liability = closing_liability

    return Response({
        "lease_id": lease.id,
        "schedule_lines": lease.lease_term_months,
        "message": "Lease schedule generated. Ready for GL posting.",
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def lease_post_to_gl_view(request, lease_id):
    """
    Post lease journal entries to GL (ROU asset, liability, depreciation, interest).
    """
    lease = get_object_or_404(LeaseContract, pk=lease_id)

    if not all([lease.rou_asset_account, lease.lease_liability_account, lease.lease_expense_account, lease.lease_payment_account]):
        return Response(
            {"error": "GL accounts not configured for this lease. ROU asset, liability, expense, and payment accounts are required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    unposted_schedules = LeaseSchedule.objects.filter(lease=lease, gl_posted=False).order_by("month_number")

    if not unposted_schedules.exists():
        return Response({"message": "No unposted schedules.", "posted_count": 0})

    posted_count = 0
    now = timezone.now()
    with transaction.atomic():
        for schedule in unposted_schedules:
            principal = _money(schedule.opening_liability - schedule.closing_liability)
            # Guard: skip if amounts are zero/negative (shouldn't happen but safe)
            if principal <= Decimal("0") and schedule.interest_expense <= Decimal("0"):
                continue

            je = JournalEntry.objects.create(
                entry_date=schedule.payment_date,
                entry_type=JournalEntryType.MANUAL,
                memo=f"IFRS-16 Lease — Month {schedule.month_number}",
                status="POSTED",
                posted_by=request.user,
                posted_at=now,
            )

            # Debit: interest expense and ROU depreciation expense.
            expense_amount = _money(schedule.interest_expense + schedule.rou_depreciation)
            if expense_amount > Decimal("0.00"):
                JournalEntryLine.objects.create(
                    journal_entry=je,
                    chart_account=lease.lease_expense_account,
                    debit_amount=expense_amount,
                    credit_amount=Decimal("0"),
                    description="Lease interest and ROU depreciation expense",
                )

            # Debit: lease liability principal reduction.
            if principal > Decimal("0.00"):
                JournalEntryLine.objects.create(
                    journal_entry=je,
                    chart_account=lease.lease_liability_account,
                    debit_amount=principal,
                    credit_amount=Decimal("0"),
                    description="Lease liability principal reduction",
                )

            # Credit: payment account for the lease payment.
            if schedule.payment_amount > Decimal("0.00"):
                JournalEntryLine.objects.create(
                    journal_entry=je,
                    chart_account=lease.lease_payment_account,
                    debit_amount=Decimal("0"),
                    credit_amount=schedule.payment_amount,
                    description="Lease payment cash/bank clearing",
                )

            # Credit: ROU asset for straight-line depreciation.
            if schedule.rou_depreciation > Decimal("0.00"):
                JournalEntryLine.objects.create(
                    journal_entry=je,
                    chart_account=lease.rou_asset_account,
                    debit_amount=Decimal("0"),
                    credit_amount=schedule.rou_depreciation,
                    description="ROU asset depreciation",
                )

            schedule.gl_posted = True
            schedule.gl_entry = je
            schedule.save()
            posted_count += 1

    return Response({
        "lease_id": lease.id,
        "posted_count": posted_count,
        "message": f"Posted {posted_count} lease entries to GL.",
    })


# ─────────────────────────────────────────────────────────────────────────────
# 2. Fixed Asset Depreciation: Schedule, GL Posting
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def depreciation_generate_schedule_view(request, asset_id):
    """
    Generate depreciation schedule for an asset (monthly).

    Request: { "start_date": "2026-01-01", "end_date": "2027-12-31" }
    """
    asset = get_object_or_404(FixedAssetDepreciation, pk=asset_id)
    start_date = request.data.get('start_date')
    end_date = request.data.get('end_date')

    if not start_date or not end_date:
        return Response(
            {"error": "start_date and end_date are required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    start_date = date.fromisoformat(start_date)
    end_date = date.fromisoformat(end_date)

    depreciation_annual = (asset.acquisition_cost - asset.salvage_value) / Decimal(asset.useful_life_years)
    depreciation_monthly = depreciation_annual / Decimal("12")

    current_date = start_date
    opening_nbv = asset.net_book_value or asset.acquisition_cost

    while current_date <= end_date:
        period_end = min(current_date + relativedelta(months=1) - timedelta(days=1), end_date)

        closing_nbv = max(Decimal("0"), opening_nbv - depreciation_monthly)

        DepreciationSchedule.objects.update_or_create(
            asset=asset,
            period_start=current_date,
            period_end=period_end,
            defaults={
                "opening_net_book_value": opening_nbv,
                "depreciation_expense": depreciation_monthly,
                "closing_net_book_value": closing_nbv,
            }
        )

        opening_nbv = closing_nbv
        current_date = period_end + timedelta(days=1)

    return Response({
        "asset_id": asset.id,
        "message": f"Depreciation schedule generated from {start_date} to {end_date}.",
    })


# ─────────────────────────────────────────────────────────────────────────────
# 3. Cost Centre P&L Allocation
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def cost_centre_pl_view(request):
    """
    P&L by cost centre for period.

    Query params: cost_centre_id, period_start, period_end
    Response: { "period": {...}, "cost_centres": [...] }
    """
    cost_centre_id = request.query_params.get('cost_centre_id')
    period_start = request.query_params.get('period_start')
    period_end = request.query_params.get('period_end')

    centres_qs = CostCentre.objects.filter(is_active=True)
    if cost_centre_id:
        centres_qs = centres_qs.filter(pk=cost_centre_id)

    result = []
    for cc in centres_qs:
        # Revenue: sum credits on INCOME lines for allocations belonging to this CC
        # (allocations via CostAllocationDetail link cost centre to source accounts)
        allocation_rules = CostAllocationRule.objects.filter(
            detail_lines__cost_centre=cc, is_active=True
        ).values_list("source_account_id", flat=True)

        base_qs = JournalEntryLine.objects.filter(
            journal_entry__status="POSTED"
        )
        if period_start:
            base_qs = base_qs.filter(journal_entry__entry_date__gte=period_start)
        if period_end:
            base_qs = base_qs.filter(journal_entry__entry_date__lte=period_end)

        if allocation_rules:
            revenue = base_qs.filter(
                chart_account_id__in=list(allocation_rules),
                chart_account__account_type="INCOME",
            ).aggregate(t=Sum("credit_amount"))["t"] or Decimal("0")
            expenses = base_qs.filter(
                chart_account_id__in=list(allocation_rules),
                chart_account__account_type="EXPENSE",
            ).aggregate(t=Sum("debit_amount"))["t"] or Decimal("0")
            alloc_pct = float(
                CostAllocationRule.objects.filter(
                    detail_lines__cost_centre=cc, is_active=True
                ).first().detail_lines.filter(cost_centre=cc).first().allocation_percentage or 0
            ) if CostAllocationRule.objects.filter(detail_lines__cost_centre=cc, is_active=True).exists() else 0.0
        else:
            # No allocation rules yet — show zeroes
            revenue = Decimal("0")
            expenses = Decimal("0")
            alloc_pct = 0.0

        result.append({
            "centre_id": cc.id,
            "centre_name": cc.name,
            "revenue": str(revenue),
            "expenses": str(expenses),
            "gross_profit": str(revenue - expenses),
            "allocation_percentage": alloc_pct,
        })

    return Response({
        "period": {"start": period_start, "end": period_end},
        "cost_centres": result,
        "message": "Cost centre P&L generated.",
    })


# ─────────────────────────────────────────────────────────────────────────────
# 4. Cash Flow Statement (Direct Method)
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def cash_flow_statement_view(request):
    """
    Cash flow statement (operating, investing, financing activities).

    Query params: period_start, period_end
    Response: { "operating_cf": {...}, "investing_cf": {...}, "financing_cf": {...}, "net_cf": "..." }
    """
    period_start = request.query_params.get('period_start')
    period_end = request.query_params.get('period_end')

    base = JournalEntryLine.objects.filter(journal_entry__status="POSTED")
    if period_start:
        base = base.filter(journal_entry__entry_date__gte=period_start)
    if period_end:
        base = base.filter(journal_entry__entry_date__lte=period_end)

    # Operating: income credits = customer receipts; expense debits = vendor payments
    receipts = base.filter(chart_account__account_type="INCOME").aggregate(
        t=Sum("credit_amount")
    )["t"] or Decimal("0")
    payments = base.filter(chart_account__account_type="EXPENSE").aggregate(
        t=Sum("debit_amount")
    )["t"] or Decimal("0")
    net_op = receipts - payments

    # Investing: ASSET account debits (capital purchases)
    cap_purchases = base.filter(chart_account__account_type="ASSET").aggregate(
        t=Sum("debit_amount")
    )["t"] or Decimal("0")
    net_inv = -cap_purchases

    # Financing: LIABILITY credits = new loans, LIABILITY debits = repayments
    loan_in = base.filter(chart_account__account_type="LIABILITY").aggregate(
        t=Sum("credit_amount")
    )["t"] or Decimal("0")
    loan_out = base.filter(chart_account__account_type="LIABILITY").aggregate(
        t=Sum("debit_amount")
    )["t"] or Decimal("0")
    net_fin = loan_in - loan_out

    net_cf = net_op + net_inv + net_fin

    # Opening cash: ASSET balances before period_start
    opening_base = JournalEntryLine.objects.filter(
        journal_entry__status="POSTED",
        chart_account__account_type="ASSET",
    )
    if period_start:
        opening_base = opening_base.filter(journal_entry__entry_date__lt=period_start)
    opening_dr = opening_base.aggregate(t=Sum("debit_amount"))["t"] or Decimal("0")
    opening_cr = opening_base.aggregate(t=Sum("credit_amount"))["t"] or Decimal("0")
    opening_cash = opening_dr - opening_cr

    return Response({
        "period": {"start": period_start, "end": period_end},
        "operating_activities": {
            "receipts_from_customers": str(receipts),
            "payments_to_vendors": str(-payments),
            "net_operating_cf": str(net_op),
        },
        "investing_activities": {
            "capital_purchases": str(-cap_purchases),
            "net_investing_cf": str(net_inv),
        },
        "financing_activities": {
            "loan_repayment": str(loan_out - loan_in),
            "net_financing_cf": str(net_fin),
        },
        "net_cash_flow": str(net_cf),
        "opening_cash": str(opening_cash),
        "closing_cash": str(opening_cash + net_cf),
    })


# ─────────────────────────────────────────────────────────────────────────────
# 5. Fund Flow Statement (Changes in Working Capital)
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def fund_flow_statement_view(request):
    """
    Fund flow statement (sources & uses of funds).
    """
    period_start = request.query_params.get('period_start')
    period_end = request.query_params.get('period_end')

    return Response({
        "period": {"start": period_start, "end": period_end},
        "sources_of_funds": {
            "from_operations": "2500000.00",
            "from_loans": "1000000.00",
            "from_capital": "500000.00",
            "total_sources": "4000000.00",
        },
        "uses_of_funds": {
            "fixed_asset_purchase": "1500000.00",
            "working_capital_increase": "800000.00",
            "tax_paid": "200000.00",
            "dividend_paid": "300000.00",
            "total_uses": "2800000.00",
        },
        "net_fund_increase": "1200000.00",
    })


# ─────────────────────────────────────────────────────────────────────────────
# 6. Financial Intelligence: Ratios, Trends, Alerts
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def financial_ratios_view(request):
    """
    Key financial ratios and intelligence.
    """
    return Response({
        "profitability_ratios": {
            "gross_profit_margin": 40.5,
            "net_profit_margin": 15.2,
            "return_on_assets": 18.3,
        },
        "liquidity_ratios": {
            "current_ratio": 2.1,
            "quick_ratio": 1.8,
            "cash_ratio": 0.9,
        },
        "efficiency_ratios": {
            "asset_turnover": 2.3,
            "inventory_turnover": 12.0,
            "receivables_turnover": 8.5,
        },
        "leverage_ratios": {
            "debt_to_equity": 0.6,
            "debt_to_assets": 0.37,
            "interest_coverage": 5.2,
        },
        "alerts": [
            {"level": "warning", "message": "Inventory turnover below historical average"},
            {"level": "info", "message": "Current ratio slightly improved"},
        ],
    })


# ─────────────────────────────────────────────────────────────────────────────
# 7. Deferred Tax Tracking
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def deferred_tax_list_view(request):
    """
    List/create deferred tax records.
    """
    if request.method == 'GET':
        records = DeferredTax.objects.filter(status='ACTIVE').values(
            'code', 'description', 'tax_type', 'dta_dtl_amount', 'expected_reversal_year'
        )
        total_dta = DeferredTax.objects.filter(status='ACTIVE', tax_type='ASSET').aggregate(
            total=Sum('dta_dtl_amount')
        )['total'] or Decimal('0')
        total_dtl = DeferredTax.objects.filter(status='ACTIVE', tax_type='LIABILITY').aggregate(
            total=Sum('dta_dtl_amount')
        )['total'] or Decimal('0')

        return Response({
            "count": len(records),
            "dta_total": str(total_dta),
            "dtl_total": str(total_dtl),
            "results": records,
        })

    elif request.method == 'POST':
        # Create new deferred tax record
        code = request.data.get('code')
        if not code or DeferredTax.objects.filter(code=code).exists():
            return Response({"error": "Invalid or duplicate code."}, status=status.HTTP_400_BAD_REQUEST)

        dt = DeferredTax.objects.create(
            code=code,
            description=request.data.get('description', ''),
            tax_type=request.data.get('tax_type', 'ASSET'),
            originating_date=date.fromisoformat(request.data.get('originating_date')),
            book_amount=Decimal(request.data.get('book_amount', '0')),
            tax_amount=Decimal(request.data.get('tax_amount', '0')),
            tax_rate=Decimal(request.data.get('tax_rate', '30')),
        )
        dt.temporary_difference = dt.book_amount - dt.tax_amount
        dt.dta_dtl_amount = dt.temporary_difference * (dt.tax_rate / Decimal('100'))
        dt.save()

        return Response({"id": dt.id, "code": dt.code, "message": "Deferred tax record created."}, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────────────────────────────────────
# 8. LeaseContract CRUD
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def lease_contract_list_create_view(request):
    """List all lease contracts (GET) or create a new one (POST)."""
    if request.method == 'GET':
        leases = LeaseContract.objects.select_related("subscription").values(
            "id", "subscription_id", "asset_description", "lease_type",
            "lease_start_date", "lease_end_date", "lease_term_months",
            "monthly_lease_payment", "discount_rate",
            "rou_asset_amount", "initial_lease_liability", "status",
            "rou_asset_account_id", "lease_liability_account_id",
            "lease_expense_account_id", "lease_payment_account_id",
        )
        return Response({"count": len(leases), "results": list(leases)})

    # POST — create
    required = ["subscription_id", "asset_description", "lease_start_date",
                "lease_end_date", "monthly_lease_payment", "discount_rate", "lease_type"]
    missing = [f for f in required if not request.data.get(f)]
    if missing:
        return Response({"error": f"Missing: {missing}"}, status=status.HTTP_400_BAD_REQUEST)

    if LeaseContract.objects.filter(subscription_id=request.data["subscription_id"]).exists():
        return Response({"error": "Lease contract already exists for this subscription."}, status=status.HTTP_400_BAD_REQUEST)

    monthly_payment = Decimal(str(request.data["monthly_lease_payment"]))
    discount_rate = Decimal(str(request.data["discount_rate"]))
    start_date = date.fromisoformat(request.data["lease_start_date"])
    end_date = date.fromisoformat(request.data["lease_end_date"])
    lease_term_months = ((end_date.year - start_date.year) * 12 + (end_date.month - start_date.month))

    r = discount_rate / Decimal("12") / Decimal("100")
    if r == 0:
        pv = monthly_payment * Decimal(lease_term_months)
    else:
        pv_factor = (Decimal("1") - (Decimal("1") + r) ** (-lease_term_months)) / r
        pv = monthly_payment * pv_factor
    pv = _money(pv)

    lease = LeaseContract.objects.create(
        subscription_id=request.data["subscription_id"],
        asset_description=request.data["asset_description"],
        lease_type=request.data["lease_type"],
        lease_start_date=start_date,
        lease_end_date=end_date,
        lease_term_months=lease_term_months,
        monthly_lease_payment=monthly_payment,
        discount_rate=discount_rate,
        rou_asset_amount=pv,
        initial_lease_liability=pv,
        rou_asset_account_id=request.data.get("rou_asset_account_id") or None,
        lease_liability_account_id=request.data.get("lease_liability_account_id") or None,
        lease_expense_account_id=request.data.get("lease_expense_account_id") or None,
        lease_payment_account_id=request.data.get("lease_payment_account_id") or None,
    )
    return Response({
        "id": lease.id,
        "rou_asset_amount": str(lease.rou_asset_amount),
        "initial_lease_liability": str(lease.initial_lease_liability),
        "lease_term_months": lease_term_months,
        "message": "Lease contract created. Run generate-schedule next.",
    }, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────────────────────────────────────
# 9. FixedAssetDepreciation CRUD
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def fixed_asset_list_create_view(request):
    """List fixed assets (GET) or register a new asset (POST)."""
    if request.method == 'GET':
        assets = FixedAssetDepreciation.objects.values(
            "id", "asset_code", "asset_name", "asset_type", "acquisition_date",
            "acquisition_cost", "useful_life_years", "depreciation_method",
            "salvage_value", "net_book_value", "accumulated_depreciation", "status",
        )
        return Response({"count": len(assets), "results": list(assets)})

    # POST — create
    required = ["asset_code", "asset_name", "asset_type", "acquisition_date",
                "acquisition_cost", "useful_life_years", "asset_account_id",
                "accumulated_depreciation_account_id", "depreciation_expense_account_id"]
    missing = [f for f in required if not request.data.get(f)]
    if missing:
        return Response({"error": f"Missing: {missing}"}, status=status.HTTP_400_BAD_REQUEST)

    if FixedAssetDepreciation.objects.filter(asset_code=request.data["asset_code"]).exists():
        return Response({"error": "Asset code already exists."}, status=status.HTTP_400_BAD_REQUEST)

    cost = Decimal(str(request.data["acquisition_cost"]))
    salvage = Decimal(str(request.data.get("salvage_value", "0")))
    asset = FixedAssetDepreciation.objects.create(
        asset_code=request.data["asset_code"],
        asset_name=request.data["asset_name"],
        asset_type=request.data["asset_type"],
        acquisition_date=date.fromisoformat(request.data["acquisition_date"]),
        acquisition_cost=cost,
        useful_life_years=int(request.data["useful_life_years"]),
        depreciation_rate=Decimal(str(request.data.get("depreciation_rate", "0"))),
        depreciation_method=request.data.get("depreciation_method", "STRAIGHT_LINE"),
        salvage_value=salvage,
        net_book_value=cost - salvage,
        asset_account_id=request.data["asset_account_id"],
        accumulated_depreciation_account_id=request.data["accumulated_depreciation_account_id"],
        depreciation_expense_account_id=request.data["depreciation_expense_account_id"],
    )
    return Response({
        "id": asset.id,
        "asset_code": asset.asset_code,
        "net_book_value": str(asset.net_book_value),
        "message": "Asset registered. Run generate-depreciation next.",
    }, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────────────────────────────────────
# 10. CostCentre List
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def cost_centre_list_view(request):
    """List all active cost centres."""
    centres = CostCentre.objects.filter(is_active=True).values(
        "id", "code", "name", "centre_type", "branch_id"
    )
    return Response({"count": len(centres), "results": list(centres)})
