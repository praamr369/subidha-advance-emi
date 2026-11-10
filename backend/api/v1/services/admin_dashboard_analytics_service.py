from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation

from django.db.models import (
    Count,
    DecimalField,
    F,
    Q,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce
from django.utils import timezone

from accounting.models import (
    AttendanceStatus,
    EmployeeAttendance,
    EmployeeProfile,
    SalarySheet,
    SalarySheetStatus,
    StaffAdvance,
    StaffAdvanceStatus,
)
from billing.models import DirectSale, DirectSaleReturn, DirectSaleReturnStatus
from core.services.operational_visibility import filter_active_payments, get_payment_collection_totals
from inventory.models import (
    GoodsReceipt,
    GoodsReceiptStatus,
    InventoryItem,
    PurchaseOrder,
    PurchaseOrderStatus,
    SOFT_HOLD_MOVEMENT_TYPES,
    StockLedger,
    VendorBill,
    VendorBillStatus,
)
from manufacturing.models import (
    ProductionJob,
    ProductionJobStatus,
    ProductionLaborLine,
)
from subscriptions.models import (
    Emi,
    EmiStatus,
    Payment,
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
)


DECIMAL_OUTPUT = DecimalField(max_digits=14, decimal_places=2)
QUANTITY_OUTPUT = DecimalField(max_digits=12, decimal_places=3)


def _money(value) -> Decimal:
    try:
        return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0.00")


def _money_str(value) -> str:
    return f"{_money(value):.2f}"


def _quantity(value) -> Decimal:
    try:
        return Decimal(str(value or "0.000")).quantize(Decimal("0.001"))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0.000")


def _pct(numerator, denominator) -> float:
    try:
        den = Decimal(str(denominator or "0"))
        if den <= Decimal("0.00"):
            return 0.0
        num = Decimal(str(numerator or "0"))
        val = (num / den) * Decimal("100")
        return round(float(val), 2)
    except Exception:
        return 0.0


def _month_bounds(d: date) -> tuple[date, date]:
    first_day = d.replace(day=1)
    if d.month == 12:
        next_month = d.replace(year=d.year + 1, month=1, day=1)
    else:
        next_month = d.replace(month=d.month + 1, day=1)
    last_day = next_month - timedelta(days=1)
    return first_day, last_day


def _prev_month_bounds(d: date) -> tuple[date, date]:
    current_first = d.replace(day=1)
    prev_last = current_first - timedelta(days=1)
    prev_first = prev_last.replace(day=1)
    return prev_first, prev_last


def build_dashboard_business_analytics(today: date | None = None) -> dict:
    """
    Computes rigorous business metrics, mathematical ratios, and trend series
    across Sales, Inventory & Purchasing, and Staff & Manufacturing.
    """
    if today is None:
        today = timezone.localdate()

    month_start, month_end = _month_bounds(today)
    prev_month_start, prev_month_end = _prev_month_bounds(today)
    thirty_days_ago = today - timedelta(days=29)

    cancelled_sale_statuses = [
        "CANCELLED",
        "CANCELLED_PRE_INVOICE",
        "CANCELLED_AFTER_DELIVERY",
        "REVERSED_POST_INVOICE",
        "RETURNED",
        "ARCHIVED",
        "EXCHANGED_CLOSED",
    ]

    # =========================================================================
    # 1. SALES & BUSINESS REVENUE ANALYTICS
    # =========================================================================

    # Active payments (reversals excluded via canonical filter)
    active_payments_qs = filter_active_payments(Payment.objects.all())

    # Current month SFEMI payments
    sfemi_month_qs = active_payments_qs.filter(
        payment_date__gte=month_start,
        payment_date__lte=today,
        subscription__plan_type=PlanType.EMI,
    )
    sfemi_month_tot = _money(sfemi_month_qs.aggregate(t=Sum("amount"))["t"])
    sfemi_month_count = sfemi_month_qs.count()

    # Previous month SFEMI payments
    sfemi_prev_month_tot = _money(
        active_payments_qs.filter(
            payment_date__gte=prev_month_start,
            payment_date__lte=prev_month_end,
            subscription__plan_type=PlanType.EMI,
        ).aggregate(t=Sum("amount"))["t"]
    )

    # Today SFEMI
    sfemi_today_tot = _money(
        active_payments_qs.filter(
            payment_date=today,
            subscription__plan_type=PlanType.EMI,
        ).aggregate(t=Sum("amount"))["t"]
    )

    # Direct Sales (net of posted returns and allowances)
    live_direct_sales = DirectSale.objects.exclude(status__in=cancelled_sale_statuses)
    direct_sales_month = live_direct_sales.filter(sale_date__gte=month_start, sale_date__lte=today)
    direct_sales_month_aggs = direct_sales_month.aggregate(
        grand_total=Sum("grand_total"),
        received_total=Sum("received_total"),
        balance_total=Sum("balance_total"),
        count=Count("id"),
    )
    month_returns_tot = _money(
        DirectSaleReturn.objects.filter(
            status=DirectSaleReturnStatus.POSTED,
            direct_sale__sale_date__gte=month_start,
            direct_sale__sale_date__lte=today,
        ).aggregate(t=Sum("grand_total"))["t"]
    )
    direct_sales_month_grand = max(
        Decimal("0.00"),
        _money(direct_sales_month_aggs["grand_total"]) - month_returns_tot,
    )
    direct_sales_month_received = _money(direct_sales_month_aggs["received_total"])
    direct_sales_month_balance = _money(direct_sales_month_aggs["balance_total"])
    direct_sales_month_count = int(direct_sales_month_aggs["count"] or 0)

    prev_month_returns_tot = _money(
        DirectSaleReturn.objects.filter(
            status=DirectSaleReturnStatus.POSTED,
            direct_sale__sale_date__gte=prev_month_start,
            direct_sale__sale_date__lte=prev_month_end,
        ).aggregate(t=Sum("grand_total"))["t"]
    )
    direct_sales_prev_month_grand = max(
        Decimal("0.00"),
        _money(
            live_direct_sales.filter(
                sale_date__gte=prev_month_start,
                sale_date__lte=prev_month_end,
            ).aggregate(t=Sum("grand_total"))["t"]
        ) - prev_month_returns_tot,
    )

    today_returns_tot = _money(
        DirectSaleReturn.objects.filter(
            status=DirectSaleReturnStatus.POSTED,
            direct_sale__sale_date=today,
        ).aggregate(t=Sum("grand_total"))["t"]
    )
    direct_sales_today_grand = max(
        Decimal("0.00"),
        _money(
            live_direct_sales.filter(sale_date=today).aggregate(t=Sum("grand_total"))["t"]
        ) - today_returns_tot,
    )

    # Rent & Lease
    rent_demands_month = RentLeaseBillingDemand.objects.filter(
        demand_type=RentLeaseDemandType.RENT_MONTHLY,
        due_date__gte=month_start,
        due_date__lte=today,
    ).aggregate(t=Sum("collected_amount"), c=Count("id"))
    rent_month_tot = _money(rent_demands_month["t"])
    rent_month_count = int(rent_demands_month["c"] or 0)

    lease_demands_month = RentLeaseBillingDemand.objects.filter(
        demand_type=RentLeaseDemandType.LEASE_MONTHLY,
        due_date__gte=month_start,
        due_date__lte=today,
    ).aggregate(t=Sum("collected_amount"), c=Count("id"))
    lease_month_tot = _money(lease_demands_month["t"])
    lease_month_count = int(lease_demands_month["c"] or 0)

    rent_demands_prev_month = RentLeaseBillingDemand.objects.filter(
        demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY],
        due_date__gte=prev_month_start,
        due_date__lte=prev_month_end,
    ).aggregate(t=Sum("collected_amount"))["t"]
    rent_lease_prev_tot = _money(rent_demands_prev_month)

    rent_lease_today_tot = _money(
        RentLeaseBillingDemand.objects.filter(
            demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY],
            due_date=today,
        ).aggregate(t=Sum("collected_amount"))["t"]
    )

    # Aggregated month net and prev month net
    current_month_net = sfemi_month_tot + direct_sales_month_grand + rent_month_tot + lease_month_tot
    prev_month_net = sfemi_prev_month_tot + direct_sales_prev_month_grand + rent_lease_prev_tot
    today_net = sfemi_today_tot + direct_sales_today_grand + rent_lease_today_tot

    if prev_month_net > Decimal("0.00"):
        growth_rate_pct = _pct(current_month_net - prev_month_net, prev_month_net)
        growth_direction = "up" if growth_rate_pct > 0 else ("down" if growth_rate_pct < 0 else "flat")
    else:
        growth_rate_pct = 100.0 if current_month_net > Decimal("0.00") else 0.0
        growth_direction = "up" if current_month_net > Decimal("0.00") else "flat"

    total_transactions_month = (
        sfemi_month_count + direct_sales_month_count + rent_month_count + lease_month_count
    )
    aov = (
        _money(current_month_net / Decimal(total_transactions_month))
        if total_transactions_month > 0
        else Decimal("0.00")
    )

    # Collection Efficiency (EMIs due this month vs collected)
    emis_due_month = Emi.objects.filter(due_date__gte=month_start, due_date__lte=today)
    total_due_amount = _money(emis_due_month.aggregate(t=Sum("amount"))["t"])
    total_collected_emis = _money(
        emis_due_month.filter(status=EmiStatus.PAID).aggregate(t=Sum("amount"))["t"]
    )
    collection_efficiency_pct = _pct(total_collected_emis, total_due_amount)

    # Streams breakdown
    streams_total = current_month_net if current_month_net > Decimal("0.00") else Decimal("1.00")
    streams_breakdown = {
        "sfemi": {
            "label": "SFEMI Collections",
            "amount": _money_str(sfemi_month_tot),
            "count": sfemi_month_count,
            "pct": _pct(sfemi_month_tot, streams_total),
        },
        "direct_sales": {
            "label": "Direct Sales",
            "amount": _money_str(direct_sales_month_grand),
            "count": direct_sales_month_count,
            "pct": _pct(direct_sales_month_grand, streams_total),
        },
        "rent": {
            "label": "Furniture Rental",
            "amount": _money_str(rent_month_tot),
            "count": rent_month_count,
            "pct": _pct(rent_month_tot, streams_total),
        },
        "lease": {
            "label": "Furniture Leasing",
            "amount": _money_str(lease_month_tot),
            "count": lease_month_count,
            "pct": _pct(lease_month_tot, streams_total),
        },
    }

    # 30-Day Daily Trends (Indexed aggregation for sub-second performance)
    daily_payments = (
        active_payments_qs.filter(payment_date__gte=thirty_days_ago, payment_date__lte=today)
        .values("payment_date")
        .annotate(total=Sum("amount"))
    )
    payment_map = {row["payment_date"]: _money(row["total"]) for row in daily_payments}

    daily_sales = (
        live_direct_sales.filter(sale_date__gte=thirty_days_ago, sale_date__lte=today)
        .values("sale_date")
        .annotate(total=Sum("grand_total"))
    )
    sale_map = {row["sale_date"]: _money(row["total"]) for row in daily_sales}

    daily_rent_lease = (
        RentLeaseBillingDemand.objects.filter(
            demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY],
            due_date__gte=thirty_days_ago,
            due_date__lte=today,
        )
        .values("due_date")
        .annotate(total=Sum("collected_amount"))
    )
    rent_lease_map = {row["due_date"]: _money(row["total"]) for row in daily_rent_lease}

    daily_trends = []
    curr = thirty_days_ago
    while curr <= today:
        sfemi_val = payment_map.get(curr, Decimal("0.00"))
        sale_val = sale_map.get(curr, Decimal("0.00"))
        rl_val = rent_lease_map.get(curr, Decimal("0.00"))
        tot_val = sfemi_val + sale_val + rl_val
        daily_trends.append({
            "date": curr.isoformat(),
            "label": curr.strftime("%d %b"),
            "sfemi": float(sfemi_val),
            "direct_sales": float(sale_val),
            "rent_lease": float(rl_val),
            "total_net": float(tot_val),
        })
        curr += timedelta(days=1)

    # 6-Month Monthly Trends
    monthly_trends = []
    # Build list of 6 month start dates
    m_cur = month_start
    m_starts = []
    for _ in range(6):
        m_starts.append(m_cur)
        m_cur, _ = _prev_month_bounds(m_cur)
    m_starts.reverse()

    for m_st in m_starts:
        _, m_en = _month_bounds(m_st)
        m_all_payments = Payment.objects.filter(payment_date__gte=m_st, payment_date__lte=m_en)
        m_pay_totals = get_payment_collection_totals(m_all_payments)
        m_payments = _money(m_pay_totals["active_amount"])
        m_payment_reversals = _money(m_pay_totals["reversed_amount"])

        m_sales_raw = _money(
            live_direct_sales.filter(
                sale_date__gte=m_st,
                sale_date__lte=m_en,
            ).aggregate(t=Sum("grand_total"))["t"]
        )
        m_returns = _money(
            DirectSaleReturn.objects.filter(
                status=DirectSaleReturnStatus.POSTED,
                direct_sale__sale_date__gte=m_st,
                direct_sale__sale_date__lte=m_en,
            ).aggregate(t=Sum("grand_total"))["t"]
        )
        m_sales = max(Decimal("0.00"), m_sales_raw - m_returns)

        m_rl = _money(
            RentLeaseBillingDemand.objects.filter(
                demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY],
                due_date__gte=m_st,
                due_date__lte=m_en,
            ).aggregate(t=Sum("collected_amount"))["t"]
        )

        # Invariant: Net = Payments + Sales + Rent/Lease
        m_net = m_payments + m_sales + m_rl
        # Total reversals = Payment cancellations + Sales returns
        m_rev = m_payment_reversals + m_returns
        # Invariant: Gross = Net + Reversals (or Gross - Reversals = Net)
        m_gross = m_net + m_rev

        monthly_trends.append({
            "month": m_st.strftime("%b %Y"),
            "sfemi": float(m_payments),
            "direct_sales": float(m_sales),
            "rent_lease": float(m_rl),
            "gross": float(m_gross),
            "reversals": float(m_rev),
            "net": float(m_net),
        })

    # =========================================================================
    # 2. INVENTORY & PURCHASING ANALYTICS
    # =========================================================================

    stock_aggregates = (
        StockLedger.objects.values("inventory_item_id")
        .annotate(
            total_in=Coalesce(Sum("quantity_in"), Value(Decimal("0.000"), output_field=QUANTITY_OUTPUT)),
            total_out=Coalesce(Sum("quantity_out"), Value(Decimal("0.000"), output_field=QUANTITY_OUTPUT)),
        )
    )
    stock_map = {
        row["inventory_item_id"]: _quantity(row["total_in"] - row["total_out"])
        for row in stock_aggregates
    }

    active_items = list(
        InventoryItem.objects.filter(is_active=True).select_related("product")
    )

    total_skus = len(active_items)
    total_valuation = Decimal("0.00")
    total_units_on_hand = Decimal("0.000")
    healthy_count = 0
    low_stock_count = 0
    out_of_stock_count = 0
    stock_at_risk_list = []

    for item in active_items:
        on_hand = stock_map.get(item.id, Decimal("0.000"))
        total_units_on_hand += max(on_hand, Decimal("0.000"))
        unit_cost = item.purchase_unit_cost or item.standard_unit_cost
        if not unit_cost or unit_cost <= Decimal("0.00"):
            if item.manufacturing_cost_enabled:
                unit_cost = (
                    (item.manufacturing_raw_material_cost or Decimal("0.00"))
                    + (item.manufacturing_labour_cost or Decimal("0.00"))
                    + (item.manufacturing_overhead_cost or Decimal("0.00"))
                )
            elif item.product_id and getattr(item.product, "base_price", None):
                unit_cost = item.product.base_price
            else:
                unit_cost = Decimal("0.00")
        unit_cost = _money(unit_cost)
        if on_hand > Decimal("0.000"):
            total_valuation += on_hand * unit_cost

        reorder = Decimal(str(item.reorder_level_qty or "0.000"))
        if on_hand <= Decimal("0.000"):
            out_of_stock_count += 1
            if len(stock_at_risk_list) < 5:
                stock_at_risk_list.append({
                    "item_id": item.id,
                    "product_code": item.product.product_code if item.product_id else "N/A",
                    "product_name": item.product.name if item.product_id else "Item",
                    "on_hand": float(on_hand),
                    "reorder_level": float(reorder),
                    "status": "OUT_OF_STOCK",
                })
        elif reorder > Decimal("0.000") and on_hand <= reorder:
            low_stock_count += 1
            if len(stock_at_risk_list) < 5:
                stock_at_risk_list.append({
                    "item_id": item.id,
                    "product_code": item.product.product_code if item.product_id else "N/A",
                    "product_name": item.product.name if item.product_id else "Item",
                    "on_hand": float(on_hand),
                    "reorder_level": float(reorder),
                    "status": "LOW_STOCK",
                })
        else:
            healthy_count += 1

    # Fast Moving Items (outflow in last 30 days)
    fast_movers_qs = (
        StockLedger.objects.filter(
            movement_date__gte=thirty_days_ago,
            movement_date__lte=today,
            quantity_out__gt=Decimal("0.000"),
        )
        .exclude(movement_type__in=SOFT_HOLD_MOVEMENT_TYPES)
        .values("inventory_item_id", "inventory_item__product__product_code", "inventory_item__product__name")
        .annotate(total_out=Sum("quantity_out"))
        .order_by("-total_out")[:5]
    )
    fast_moving_items = [
        {
            "product_code": row["inventory_item__product__product_code"] or "N/A",
            "product_name": row["inventory_item__product__name"] or "Product",
            "quantity_out_30d": float(_quantity(row["total_out"])),
            "current_stock": float(stock_map.get(row["inventory_item_id"], Decimal("0.000"))),
        }
        for row in fast_movers_qs
    ]

    # Inward vs Outward Quantity (last 30 days)
    movement_30d = StockLedger.objects.filter(
        movement_date__gte=thirty_days_ago,
        movement_date__lte=today,
    ).aggregate(
        inward=Coalesce(Sum("quantity_in"), Value(Decimal("0.000"), output_field=QUANTITY_OUTPUT)),
        outward=Coalesce(Sum("quantity_out"), Value(Decimal("0.000"), output_field=QUANTITY_OUTPUT)),
    )
    inward_qty_30d = float(_quantity(movement_30d["inward"]))
    outward_qty_30d = float(_quantity(movement_30d["outward"]))

    # Purchasing KPIs
    open_pos_count = PurchaseOrder.objects.filter(
        status__in=[PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED]
    ).count()

    po_lines_month = PurchaseOrder.objects.filter(
        po_date__gte=month_start,
        po_date__lte=today,
    ).aggregate(c=Count("id"))
    month_po_count = int(po_lines_month["c"] or 0)

    pending_grn_count = GoodsReceipt.objects.filter(status=GoodsReceiptStatus.DRAFT).count()

    vendor_bills_agg = VendorBill.objects.filter(
        status__in=[VendorBillStatus.DRAFT, VendorBillStatus.POSTED]
    ).aggregate(c=Count("id"), t=Sum("grand_total"))
    unpaid_bills_count = int(vendor_bills_agg["c"] or 0)
    unpaid_bills_amount = _money(vendor_bills_agg["t"])

    draft_bills_count = VendorBill.objects.filter(status=VendorBillStatus.DRAFT).count()

    # =========================================================================
    # 3. STAFF, MANUFACTURING & PAYROLL ANALYTICS
    # =========================================================================

    active_staff_qs = EmployeeProfile.objects.filter(is_active=True)
    active_staff_count = active_staff_qs.count()

    # Attendance
    today_attendance = EmployeeAttendance.objects.filter(attendance_date=today)
    att_present = today_attendance.filter(status=AttendanceStatus.PRESENT).count()
    att_half = today_attendance.filter(status=AttendanceStatus.HALF_DAY).count()
    att_absent = today_attendance.filter(status=AttendanceStatus.ABSENT).count()
    att_leave = today_attendance.filter(status=AttendanceStatus.LEAVE).count()
    marked_total = att_present + att_half + att_absent + att_leave
    att_not_marked = max(0, active_staff_count - marked_total)
    attendance_rate_pct = (
        round(((att_present + (att_half * 0.5)) / active_staff_count) * 100, 1)
        if active_staff_count > 0
        else 0.0
    )

    # Monthly Payroll
    month_salary_sheets = SalarySheet.objects.filter(year=today.year, month=today.month)
    salary_sheets_agg = month_salary_sheets.aggregate(
        total=Sum("net_amount"),
        unpaid=Count("id", filter=~Q(status=SalarySheetStatus.PAID)),
    )
    monthly_payroll_cost = _money(salary_sheets_agg["total"])
    unpaid_salary_sheets_count = int(salary_sheets_agg["unpaid"] or 0)

    # If salary sheets for current month not generated yet, estimate from base_salary of active staff
    if monthly_payroll_cost == Decimal("0.00") and active_staff_count > 0:
        monthly_payroll_cost = _money(active_staff_qs.aggregate(t=Sum("base_salary"))["t"])

    avg_salary_per_staff = (
        _money(monthly_payroll_cost / Decimal(active_staff_count))
        if active_staff_count > 0
        else Decimal("0.00")
    )
    labor_to_revenue_ratio_pct = (
        _pct(monthly_payroll_cost, current_month_net)
        if current_month_net > Decimal("0.00")
        else 0.0
    )

    # Department distribution
    dept_rows = (
        active_staff_qs.values("department")
        .annotate(
            staff_count=Count("id"),
            total_salary=Coalesce(Sum("base_salary"), Value(Decimal("0.00"), output_field=DECIMAL_OUTPUT)),
        )
        .order_by("-total_salary")
    )
    departments = [
        {
            "department": row["department"] or "General",
            "staff_count": int(row["staff_count"] or 0),
            "total_salary": _money_str(row["total_salary"]),
            "pct_of_payroll": _pct(row["total_salary"], monthly_payroll_cost),
        }
        for row in dept_rows
    ]

    # Manufacturing Labor Accruals (Strict Rule 4f)
    # Exclude cancelled jobs so abandoned prototypes do not accrue liabilities
    unposted_lines_qs = ProductionLaborLine.objects.filter(
        is_posted=False
    ).exclude(
        production_job__status=ProductionJobStatus.CANCELLED
    )
    unposted_labor_lines_count = unposted_lines_qs.count()

    total_accrual = Decimal("0.00")
    for line in unposted_lines_qs.select_related("employee"):
        if line.wage_amount and line.wage_amount > Decimal("0.00"):
            total_accrual += line.wage_amount
        elif line.hours_worked and line.employee and line.employee.hourly_wage_rate:
            total_accrual += _money(line.hours_worked * line.employee.hourly_wage_rate)

    unposted_labor_accrual_amount = _money(total_accrual)

    month_start_dt = timezone.make_aware(datetime.combine(month_start, time.min))
    today_end_dt = timezone.make_aware(datetime.combine(today, time.max))

    posted_labor_month = _money(
        ProductionLaborLine.objects.filter(
            is_posted=True,
            posted_at__gte=month_start_dt,
            posted_at__lte=today_end_dt,
        ).aggregate(t=Sum("wage_amount"))["t"]
    )

    active_production_jobs_count = ProductionJob.objects.filter(
        status__in=[
            ProductionJobStatus.IN_PROGRESS,
            ProductionJobStatus.RELEASED,
            ProductionJobStatus.DRAFT,
        ]
    ).count()

    total_labor_hours_month = float(
        _quantity(
            ProductionLaborLine.objects.filter(
                created_at__gte=month_start_dt,
                created_at__lte=today_end_dt,
            ).aggregate(t=Sum("hours_worked"))["t"]
        )
    )

    # Staff Advances
    advances_agg = StaffAdvance.objects.filter(
        status__in=[StaffAdvanceStatus.DISBURSED, StaffAdvanceStatus.PARTIALLY_RECOVERED]
    ).aggregate(
        c=Count("id"),
        t=Sum(F("amount") - F("recovered_amount")),
    )
    outstanding_advances_count = int(advances_agg["c"] or 0)
    outstanding_advances_amount = _money(advances_agg["t"])

    # =========================================================================
    # ASSEMBLE COMPLETE ANALYTICS PAYLOAD
    # =========================================================================

    return {
        "as_of": timezone.now().isoformat(),
        "sales": {
            "current_month_net": _money_str(current_month_net),
            "prev_month_net": _money_str(prev_month_net),
            "growth_rate_pct": growth_rate_pct,
            "growth_direction": growth_direction,
            "today_net": _money_str(today_net),
            "month_due_amount": _money_str(total_due_amount),
            "month_collected_amount": _money_str(total_collected_emis),
            "collection_efficiency_pct": collection_efficiency_pct,
            "aov": _money_str(aov),
            "total_transactions_month": total_transactions_month,
            "streams_breakdown": streams_breakdown,
            "daily_trends": daily_trends,
            "monthly_trends": monthly_trends,
            "direct_sales_summary": {
                "month_invoiced": _money_str(direct_sales_month_grand),
                "month_collected": _money_str(direct_sales_month_received),
                "month_outstanding": _money_str(direct_sales_month_balance),
                "recovery_rate_pct": _pct(direct_sales_month_received, direct_sales_month_grand),
                "sale_count": direct_sales_month_count,
            },
        },
        "inventory": {
            "total_valuation": _money_str(total_valuation),
            "total_skus": total_skus,
            "total_units_on_hand": float(total_units_on_hand),
            "stock_health": {
                "healthy_count": healthy_count,
                "healthy_pct": _pct(healthy_count, total_skus),
                "low_stock_count": low_stock_count,
                "low_stock_pct": _pct(low_stock_count, total_skus),
                "out_of_stock_count": out_of_stock_count,
                "out_of_stock_pct": _pct(out_of_stock_count, total_skus),
            },
            "purchasing": {
                "month_po_count": month_po_count,
                "open_pos_count": open_pos_count,
                "pending_grn_count": pending_grn_count,
                "draft_bills_count": draft_bills_count,
                "unpaid_bills_count": unpaid_bills_count,
                "unpaid_bills_amount": _money_str(unpaid_bills_amount),
                "inward_qty_30d": inward_qty_30d,
                "outward_qty_30d": outward_qty_30d,
            },
            "fast_moving_items": fast_moving_items,
            "stock_at_risk": stock_at_risk_list,
        },
        "staff": {
            "active_staff_count": active_staff_count,
            "attendance": {
                "present": att_present,
                "half_day": att_half,
                "absent": att_absent,
                "on_leave": att_leave,
                "not_marked": att_not_marked,
                "attendance_rate_pct": attendance_rate_pct,
            },
            "payroll": {
                "monthly_payroll_cost": _money_str(monthly_payroll_cost),
                "unpaid_salary_sheets_count": unpaid_salary_sheets_count,
                "avg_salary_per_staff": _money_str(avg_salary_per_staff),
                "labor_to_revenue_ratio_pct": labor_to_revenue_ratio_pct,
            },
            "departments": departments,
            "manufacturing": {
                "unposted_labor_lines_count": unposted_labor_lines_count,
                "unposted_labor_accrual_amount": _money_str(unposted_labor_accrual_amount),
                "posted_labor_amount_month": _money_str(posted_labor_month),
                "active_production_jobs_count": active_production_jobs_count,
                "total_labor_hours_month": total_labor_hours_month,
            },
            "advances": {
                "outstanding_count": outstanding_advances_count,
                "outstanding_amount": _money_str(outstanding_advances_amount),
            },
        },
    }
