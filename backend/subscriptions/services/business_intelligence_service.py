from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.db.models import Count, DecimalField, Max, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from accounting.models import EmployeeProfile, EmploymentType, SalarySheet
from billing.models import BillingDocumentStatus, DirectSale, DirectSaleStatus, ReceiptDocument, ReceiptType
from inventory.models import InventoryItem, SOFT_HOLD_MOVEMENT_TYPES, StockLedger
from subscriptions.models import (
    Batch,
    Customer,
    Emi,
    EmiStatus,
    LuckyDraw,
    LuckyIdStatus,
    MONEY_ZERO,
    Payment,
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.phase5_filter_service import AdminReportFilter


DECIMAL_OUTPUT = DecimalField(max_digits=14, decimal_places=2)


def _money(value) -> Decimal:
    try:
        return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0.00")


def _money_str(value) -> str:
    return f"{_money(value):.2f}"


def _quantity(value) -> Decimal:
    try:
        return Decimal(str(value or "0.000")).quantize(Decimal("0.001"))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0.000")


def _quantity_str(value) -> str:
    return f"{_quantity(value):.3f}"


def _percent(numerator, denominator) -> str:
    denominator_decimal = Decimal(str(denominator or 0))
    if denominator_decimal <= 0:
        return "0.00"
    value = (_money(numerator) / denominator_decimal * Decimal("100")).quantize(Decimal("0.01"))
    return f"{value:.2f}"


def _date_window(flt: AdminReportFilter) -> tuple[date, date]:
    today = timezone.localdate()
    return flt.date_from or today.replace(day=1), flt.date_to or today


def _previous_window(start: date, end: date) -> tuple[date, date]:
    days = max(1, (end - start).days + 1)
    previous_end = start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=days - 1)
    return previous_start, previous_end


def _month_starts(start: date, end: date) -> list[date]:
    current = start.replace(day=1)
    months: list[date] = []
    while current <= end:
        months.append(current)
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)
    return months


def _month_end(month_start: date) -> date:
    if month_start.month == 12:
        next_month = month_start.replace(year=month_start.year + 1, month=1)
    else:
        next_month = month_start.replace(month=month_start.month + 1)
    return next_month - timedelta(days=1)


def _decimal_sum(qs, field: str) -> Decimal:
    return _money(qs.aggregate(total=Coalesce(Sum(field), Value(Decimal("0.00"), output_field=DECIMAL_OUTPUT)))["total"])


def _filter_subscription_scope(qs, flt: AdminReportFilter):
    if flt.contract_type and flt.contract_type in PlanType.values:
        qs = qs.filter(plan_type=flt.contract_type)
    if flt.partner_id:
        qs = qs.filter(partner_id=flt.partner_id)
    if flt.product_id:
        qs = qs.filter(product_id=flt.product_id)
    if flt.customer_id:
        qs = qs.filter(customer_id=flt.customer_id)
    if flt.branch_id:
        qs = qs.filter(branch_id=flt.branch_id)
    return qs


def _payments_for_window(start: date, end: date, flt: AdminReportFilter):
    qs = Payment.objects.select_related("subscription").filter(payment_date__gte=start, payment_date__lte=end)
    if flt.payment_method:
        qs = qs.filter(method=flt.payment_method)
    if flt.contract_type and flt.contract_type in PlanType.values:
        qs = qs.filter(subscription__plan_type=flt.contract_type)
    if flt.partner_id:
        qs = qs.filter(subscription__partner_id=flt.partner_id)
    if flt.product_id:
        qs = qs.filter(subscription__product_id=flt.product_id)
    if flt.customer_id:
        qs = qs.filter(customer_id=flt.customer_id)
    if flt.branch_id:
        qs = qs.filter(branch_id=flt.branch_id)
    return qs


def _retail_receipts_for_window(start: date, end: date, flt: AdminReportFilter):
    qs = ReceiptDocument.objects.filter(
        receipt_type=ReceiptType.RETAIL_RECEIPT,
        status=BillingDocumentStatus.POSTED,
        receipt_date__gte=start,
        receipt_date__lte=end,
    )
    if flt.customer_id:
        qs = qs.filter(customer_id=flt.customer_id)
    if flt.branch_id:
        qs = qs.filter(branch_id=flt.branch_id)
    return qs


def _salary_sheets_for_window(start: date, end: date):
    period_filter = Q()
    for month_start in _month_starts(start, end):
        period_filter |= Q(year=month_start.year, month=month_start.month)
    if not period_filter:
        return SalarySheet.objects.none()
    return SalarySheet.objects.select_related("employee").filter(period_filter)


def _rent_lease_demands_for_window(start: date, end: date, flt: AdminReportFilter):
    qs = RentLeaseBillingDemand.objects.select_related("subscription").filter(due_date__gte=start, due_date__lte=end)
    if flt.contract_type in {PlanType.RENT, PlanType.LEASE}:
        qs = qs.filter(subscription__plan_type=flt.contract_type)
    if flt.partner_id:
        qs = qs.filter(subscription__partner_id=flt.partner_id)
    if flt.product_id:
        qs = qs.filter(subscription__product_id=flt.product_id)
    if flt.customer_id:
        qs = qs.filter(subscription__customer_id=flt.customer_id)
    if flt.branch_id:
        qs = qs.filter(subscription__branch_id=flt.branch_id)
    return qs


def _direct_sales_for_window(start: date, end: date, flt: AdminReportFilter):
    qs = DirectSale.objects.exclude(status=DirectSaleStatus.CANCELLED).filter(sale_date__gte=start, sale_date__lte=end)
    if flt.customer_id:
        qs = qs.filter(customer_id=flt.customer_id)
    if flt.branch_id:
        qs = qs.filter(branch_id=flt.branch_id)
    return qs


def _actual_inflow(start: date, end: date, flt: AdminReportFilter) -> Decimal:
    return _decimal_sum(_payments_for_window(start, end, flt), "amount") + _decimal_sum(
        _retail_receipts_for_window(start, end, flt),
        "amount",
    )


def _overdue_exposure(today: date, flt: AdminReportFilter) -> Decimal:
    emi_qs = Emi.objects.filter(status=EmiStatus.PENDING, due_date__lt=today)
    if flt.contract_type and flt.contract_type in PlanType.values:
        emi_qs = emi_qs.filter(subscription__plan_type=flt.contract_type)
    if flt.customer_id:
        emi_qs = emi_qs.filter(subscription__customer_id=flt.customer_id)
    if flt.product_id:
        emi_qs = emi_qs.filter(subscription__product_id=flt.product_id)
    if flt.partner_id:
        emi_qs = emi_qs.filter(subscription__partner_id=flt.partner_id)
    if flt.branch_id:
        emi_qs = emi_qs.filter(subscription__branch_id=flt.branch_id)

    rent_lease_qs = _rent_lease_demands_for_window(date(2000, 1, 1), today - timedelta(days=1), flt).exclude(
        demand_type=RentLeaseDemandType.SECURITY_DEPOSIT
    )
    rent_lease_outstanding = sum((row.outstanding_amount() for row in rent_lease_qs), Decimal("0.00"))

    direct_sale_balance_qs = DirectSale.objects.exclude(status=DirectSaleStatus.CANCELLED).filter(balance_total__gt=0)
    if flt.customer_id:
        direct_sale_balance_qs = direct_sale_balance_qs.filter(customer_id=flt.customer_id)
    if flt.branch_id:
        direct_sale_balance_qs = direct_sale_balance_qs.filter(branch_id=flt.branch_id)
    direct_sale_balance = _decimal_sum(direct_sale_balance_qs, "balance_total")
    return _decimal_sum(emi_qs, "amount") + _money(rent_lease_outstanding) + direct_sale_balance


def build_profitability_view(*, flt: AdminReportFilter) -> dict:
    start, end = _date_window(flt)
    payments = _payments_for_window(start, end, flt)
    emi_revenue = _decimal_sum(payments.filter(subscription__plan_type=PlanType.EMI), "amount")

    waived_qs = Emi.objects.filter(status=EmiStatus.WAIVED, due_date__gte=start, due_date__lte=end)
    if flt.customer_id:
        waived_qs = waived_qs.filter(subscription__customer_id=flt.customer_id)
    if flt.product_id:
        waived_qs = waived_qs.filter(subscription__product_id=flt.product_id)
    if flt.partner_id:
        waived_qs = waived_qs.filter(subscription__partner_id=flt.partner_id)
    if flt.branch_id:
        waived_qs = waived_qs.filter(subscription__branch_id=flt.branch_id)
    waived_amount = _decimal_sum(waived_qs, "amount")

    direct_sale_revenue = _decimal_sum(_direct_sales_for_window(start, end, flt), "grand_total")
    rent_lease_demands = _rent_lease_demands_for_window(start, end, flt)
    rent_income = _decimal_sum(rent_lease_demands.filter(demand_type=RentLeaseDemandType.RENT_MONTHLY), "collected_amount")
    lease_income = _decimal_sum(rent_lease_demands.filter(demand_type=RentLeaseDemandType.LEASE_MONTHLY), "collected_amount")
    deposit_liabilities = _decimal_sum(
        RentLeaseBillingDemand.objects.filter(demand_type=RentLeaseDemandType.SECURITY_DEPOSIT),
        "held_amount",
    )
    salary_cost = _decimal_sum(_salary_sheets_for_window(start, end), "net_amount")
    gross_income = emi_revenue + direct_sale_revenue + rent_income + lease_income
    operating_margin = gross_income - waived_amount - salary_cost

    monthly_rows = []
    for month_start in _month_starts(start, end):
        row_start = max(start, month_start)
        row_end = min(end, _month_end(month_start))
        row_filter = AdminReportFilter(
            date_from=row_start,
            date_to=row_end,
            contract_type=flt.contract_type,
            payment_method=flt.payment_method,
            status=flt.status,
            partner_id=flt.partner_id,
            product_id=flt.product_id,
            category_id=flt.category_id,
            customer_id=flt.customer_id,
            branch_id=flt.branch_id,
            overdue_only=flt.overdue_only,
            unreconciled_only=flt.unreconciled_only,
            ignored_filters=[],
        )
        row_payments = _payments_for_window(row_start, row_end, row_filter)
        row_rent_lease = _rent_lease_demands_for_window(row_start, row_end, row_filter)
        row_income = (
            _decimal_sum(row_payments.filter(subscription__plan_type=PlanType.EMI), "amount")
            + _decimal_sum(_direct_sales_for_window(row_start, row_end, row_filter), "grand_total")
            + _decimal_sum(row_rent_lease.exclude(demand_type=RentLeaseDemandType.SECURITY_DEPOSIT), "collected_amount")
        )
        row_waived = _decimal_sum(
            Emi.objects.filter(status=EmiStatus.WAIVED, due_date__gte=row_start, due_date__lte=row_end),
            "amount",
        )
        row_salary = _decimal_sum(_salary_sheets_for_window(row_start, row_end), "net_amount")
        monthly_rows.append(
            {
                "month": month_start.strftime("%Y-%m"),
                "income": _money_str(row_income),
                "waived_amount": _money_str(row_waived),
                "salary_cost": _money_str(row_salary),
                "operating_margin": _money_str(row_income - row_waived - row_salary),
            }
        )

    return {
        "summary": {
            "emi_revenue": _money_str(emi_revenue),
            "emi_waived_amount": _money_str(waived_amount),
            "direct_sale_revenue": _money_str(direct_sale_revenue),
            "rent_income": _money_str(rent_income),
            "lease_income": _money_str(lease_income),
            "deposit_liabilities": _money_str(deposit_liabilities),
            "salary_cost": _money_str(salary_cost),
            "gross_income": _money_str(gross_income),
            "operating_margin": _money_str(operating_margin),
        },
        "monthly_profit_summary": monthly_rows,
        "basis_note": "Operational BI summary from payments, direct-sale totals, rent/lease collected monthly demands, waived EMI rows, salary sheets, and security-deposit liability. This is read-only management intelligence, not a replacement for posted statutory P&L.",
        "sources": [
            "/api/v1/admin/payments/",
            "/api/v1/billing/direct-sales/",
            "/api/v1/admin/finance/deposits/",
            "/api/v1/admin/hr/payroll/",
        ],
    }


def build_customer_insights(*, flt: AdminReportFilter) -> dict:
    today = timezone.localdate()
    cutoff = today - timedelta(days=60)
    active_statuses = {
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.WON,
        SubscriptionStatus.APPROVED,
        SubscriptionStatus.PAYMENT_PENDING,
        SubscriptionStatus.DELIVERY_PENDING,
        SubscriptionStatus.HANDED_OVER,
    }
    total_customers = Customer.objects.count()
    active_customers = Customer.objects.filter(subscriptions__status__in=active_statuses).distinct().count()

    high_overdue_rows = (
        Emi.objects.filter(status=EmiStatus.PENDING, due_date__lt=today)
        .values("subscription__customer_id", "subscription__customer__name", "subscription__customer__phone")
        .annotate(
            overdue_count=Count("id"),
            overdue_amount=Coalesce(Sum("amount"), Value(Decimal("0.00"), output_field=DECIMAL_OUTPUT)),
        )
        .order_by("-overdue_amount", "-overdue_count")[:10]
    )

    repeat_rows = []
    repeat_queryset = Customer.objects.annotate(
        subscription_count=Count("subscriptions", distinct=True),
        direct_sale_count=Count("direct_sales", distinct=True),
    ).order_by("name", "id")
    for customer in repeat_queryset:
        total_relationships = int(customer.subscription_count or 0) + int(customer.direct_sale_count or 0)
        if total_relationships >= 2:
            repeat_rows.append(
                {
                    "customer_id": customer.id,
                    "name": customer.name,
                    "phone": customer.phone,
                    "subscription_count": customer.subscription_count,
                    "direct_sale_count": customer.direct_sale_count,
                    "relationship_count": total_relationships,
                }
            )
        if len(repeat_rows) >= 10:
            break

    churn_queryset = (
        Customer.objects.annotate(
            overdue_count=Count(
                "subscriptions__emis",
                filter=Q(subscriptions__emis__status=EmiStatus.PENDING, subscriptions__emis__due_date__lt=today),
                distinct=True,
            ),
            overdue_amount=Coalesce(
                Sum(
                    "subscriptions__emis__amount",
                    filter=Q(subscriptions__emis__status=EmiStatus.PENDING, subscriptions__emis__due_date__lt=today),
                ),
                Value(Decimal("0.00"), output_field=DECIMAL_OUTPUT),
            ),
            last_payment_date=Max("payments__payment_date"),
        )
        .filter(overdue_count__gt=0)
        .order_by("-overdue_amount", "last_payment_date")[:25]
    )
    churn_rows = [
        {
            "customer_id": customer.id,
            "name": customer.name,
            "phone": customer.phone,
            "overdue_count": customer.overdue_count,
            "overdue_amount": _money_str(customer.overdue_amount),
            "last_payment_date": customer.last_payment_date.isoformat() if customer.last_payment_date else None,
            "reason": "Overdue with no payment in last 60 days" if not customer.last_payment_date or customer.last_payment_date < cutoff else "Overdue balance needs follow-up",
        }
        for customer in churn_queryset
        if not customer.last_payment_date or customer.last_payment_date < cutoff
    ][:10]

    return {
        "summary": {
            "total_customers": total_customers,
            "active_customers": active_customers,
            "inactive_customers": max(total_customers - active_customers, 0),
            "high_overdue_customers": len(high_overdue_rows),
            "repeat_customers": len(repeat_rows),
            "churn_risk_customers": len(churn_rows),
        },
        "high_overdue_customers": [
            {
                "customer_id": row["subscription__customer_id"],
                "name": row["subscription__customer__name"],
                "phone": row["subscription__customer__phone"],
                "overdue_count": row["overdue_count"],
                "overdue_amount": _money_str(row["overdue_amount"]),
            }
            for row in high_overdue_rows
        ],
        "repeat_customers": repeat_rows,
        "churn_risk": churn_rows,
        "sources": ["/api/v1/admin/customers/", "/api/v1/admin/emis/", "/api/v1/admin/payments/"],
    }


def build_batch_performance(*, flt: AdminReportFilter) -> dict:
    today = timezone.localdate()
    qs = Batch.objects.all().order_by("-start_date", "-id")
    if flt.status:
        qs = qs.filter(status=flt.status)

    rows = []
    for batch in qs[:100]:
        sold_slots = batch.lucky_ids.exclude(status=LuckyIdStatus.AVAILABLE).count()
        subscriptions = Subscription.objects.filter(batch=batch, plan_type=PlanType.EMI)
        due_emis = Emi.objects.filter(subscription__batch=batch, due_date__lte=today)
        due_count = due_emis.count()
        paid_count = due_emis.filter(status=EmiStatus.PAID).count()
        overdue_count = due_emis.filter(status=EmiStatus.PENDING, due_date__lt=today).count()
        draw_count = LuckyDraw.objects.filter(batch=batch, is_revealed=True).count()
        default_rate = _percent(overdue_count, due_count)
        payment_discipline = _percent(paid_count, due_count)
        rows.append(
            {
                "batch_id": batch.id,
                "batch_code": batch.batch_code,
                "status": batch.status,
                "total_slots": batch.total_slots,
                "sold_slots": sold_slots,
                "subscription_count": subscriptions.count(),
                "fill_rate": _percent(sold_slots, batch.total_slots),
                "due_emi_count": due_count,
                "paid_emi_count": paid_count,
                "overdue_emi_count": overdue_count,
                "payment_discipline": payment_discipline,
                "default_rate": default_rate,
                "draws_completed": draw_count,
                "draw_completion": _percent(draw_count, batch.duration_months),
                "risk_level": "HIGH" if Decimal(default_rate) >= Decimal("20.00") else ("MEDIUM" if Decimal(payment_discipline) < Decimal("70.00") and due_count else "LOW"),
            }
        )

    return {
        "summary": {
            "batch_count": len(rows),
            "average_fill_rate": (
                f"{(sum(Decimal(row['fill_rate']) for row in rows) / Decimal(len(rows))).quantize(Decimal('0.01')):.2f}"
                if rows
                else "0.00"
            ),
            "high_risk_batches": sum(1 for row in rows if row["risk_level"] == "HIGH"),
        },
        "rows": rows,
        "sources": ["/api/v1/admin/batches/", "/api/v1/admin/emis/", "/api/v1/admin/lucky-draws/"],
    }


def build_cashflow_dashboard(*, flt: AdminReportFilter) -> dict:
    start, end = _date_window(flt)
    today = timezone.localdate()
    actual_inflow = _actual_inflow(start, end, flt)
    expected_emi = _decimal_sum(Emi.objects.filter(status=EmiStatus.PENDING, due_date__gte=start, due_date__lte=end), "amount")
    expected_rent_lease = sum(
        (row.outstanding_amount() for row in _rent_lease_demands_for_window(start, end, flt).exclude(demand_type=RentLeaseDemandType.SECURITY_DEPOSIT)),
        Decimal("0.00"),
    )
    expected_direct_sale = _decimal_sum(
        _direct_sales_for_window(start, end, flt).filter(balance_total__gt=0),
        "balance_total",
    )
    overdue_exposure = _overdue_exposure(today, flt)

    daily_rows = []
    current = start
    while current <= end:
        daily_rows.append(
            {
                "date": current.isoformat(),
                "inflow": _money_str(_actual_inflow(current, current, flt)),
            }
        )
        current += timedelta(days=1)

    return {
        "summary": {
            "daily_inflow": _money_str(_actual_inflow(today, today, flt)),
            "window_inflow": _money_str(actual_inflow),
            "expected_inflow": _money_str(expected_emi + _money(expected_rent_lease) + expected_direct_sale),
            "overdue_exposure": _money_str(overdue_exposure),
        },
        "daily_trend": daily_rows,
        "expected_breakdown": {
            "pending_emi": _money_str(expected_emi),
            "rent_lease_outstanding": _money_str(expected_rent_lease),
            "direct_sale_balance": _money_str(expected_direct_sale),
        },
        "sources": ["/api/v1/admin/payments/", "/api/v1/admin/emis/", "/api/v1/admin/finance/deposits/", "/api/v1/billing/direct-sales/"],
    }


def build_inventory_intelligence(*, flt: AdminReportFilter) -> dict:
    start, end = _date_window(flt)
    movement_qs = StockLedger.objects.select_related("inventory_item", "inventory_item__product").filter(
        movement_date__gte=start,
        movement_date__lte=end,
        quantity_out__gt=0,
    ).exclude(movement_type__in=SOFT_HOLD_MOVEMENT_TYPES)
    if flt.product_id:
        movement_qs = movement_qs.filter(inventory_item__product_id=flt.product_id)
    if flt.branch_id:
        movement_qs = movement_qs.filter(stock_location__branch_id=flt.branch_id)

    movement_rows = list(
        movement_qs.values("inventory_item_id", "inventory_item__product__product_code", "inventory_item__product__name")
        .annotate(quantity_out=Coalesce(Sum("quantity_out"), Value(Decimal("0.000"))))
        .order_by("-quantity_out")[:10]
    )
    movement_map = {row["inventory_item_id"]: _quantity(row["quantity_out"]) for row in movement_rows}

    item_qs = InventoryItem.objects.select_related("product", "default_stock_location").filter(is_active=True)
    if flt.product_id:
        item_qs = item_qs.filter(product_id=flt.product_id)
    if flt.branch_id:
        item_qs = item_qs.filter(default_stock_location__branch_id=flt.branch_id)

    slow_rows = []
    risk_rows = []
    for item in item_qs[:300]:
        on_hand = item.current_stock_quantity()
        moved_qty = movement_map.get(item.id, Decimal("0.000"))
        base_row = {
            "item_id": item.id,
            "product_id": item.product_id,
            "product_code": item.product.product_code,
            "product_name": item.product.name,
            "sku": item.sku or "",
            "on_hand_qty": _quantity_str(on_hand),
            "reorder_level_qty": _quantity_str(item.reorder_level_qty),
            "moved_out_qty": _quantity_str(moved_qty),
        }
        if on_hand > 0 and moved_qty <= 0:
            slow_rows.append(base_row)
        if item.stock_tracking_enabled and on_hand <= item.reorder_level_qty:
            risk_rows.append({**base_row, "reason": "On-hand stock is at or below reorder level."})

    return {
        "summary": {
            "fast_moving_count": len(movement_rows),
            "slow_moving_count": len(slow_rows),
            "stock_risk_count": len(risk_rows),
        },
        "fast_moving_items": [
            {
                "item_id": row["inventory_item_id"],
                "product_code": row["inventory_item__product__product_code"],
                "product_name": row["inventory_item__product__name"],
                "moved_out_qty": _quantity_str(row["quantity_out"]),
            }
            for row in movement_rows
        ],
        "slow_moving_items": slow_rows[:10],
        "stock_risk": risk_rows[:10],
        "sources": ["/api/v1/inventory/stock-summary/", "/api/v1/inventory/movements/"],
    }


def build_hr_cost_insights(*, flt: AdminReportFilter) -> dict:
    start, end = _date_window(flt)
    salary_sheets = _salary_sheets_for_window(start, end)
    salary_cost = _decimal_sum(salary_sheets, "net_amount")
    revenue = _actual_inflow(start, end, flt)
    ratio = None if revenue <= 0 else _percent(salary_cost, revenue)

    department_rows = (
        salary_sheets.values("employee__department")
        .annotate(cost=Coalesce(Sum("net_amount"), Value(Decimal("0.00"), output_field=DECIMAL_OUTPUT)), employee_count=Count("employee_id", distinct=True))
        .order_by("-cost", "employee__department")
    )
    temp_types = {
        EmploymentType.TEMPORARY,
        EmploymentType.DAILY_WAGE,
        EmploymentType.HOURLY,
        EmploymentType.PIECE_RATE,
    }
    temporary_cost = Decimal("0.00")
    permanent_cost = Decimal("0.00")
    for sheet in salary_sheets.select_related("employee"):
        if sheet.employee.employment_type in temp_types:
            temporary_cost += _money(sheet.net_amount)
        else:
            permanent_cost += _money(sheet.net_amount)

    return {
        "summary": {
            "salary_cost": _money_str(salary_cost),
            "revenue": _money_str(revenue),
            "salary_vs_revenue_ratio": ratio,
            "active_staff": EmployeeProfile.objects.filter(is_active=True).count(),
        },
        "cost_per_department": [
            {
                "department": row["employee__department"] or "Unassigned",
                "cost": _money_str(row["cost"]),
                "employee_count": row["employee_count"],
            }
            for row in department_rows
        ],
        "employment_type_split": {
            "temporary_cost": _money_str(temporary_cost),
            "permanent_cost": _money_str(permanent_cost),
        },
        "sources": ["/api/v1/admin/hr/payroll/", "/api/v1/admin/hr/staff/", "/api/v1/admin/payments/"],
    }


def build_business_intelligence_payload(*, flt: AdminReportFilter) -> dict:
    start, end = _date_window(flt)
    previous_start, previous_end = _previous_window(start, end)
    previous_filter = AdminReportFilter(
        date_from=previous_start,
        date_to=previous_end,
        contract_type=flt.contract_type,
        payment_method=flt.payment_method,
        status=flt.status,
        partner_id=flt.partner_id,
        product_id=flt.product_id,
        category_id=flt.category_id,
        customer_id=flt.customer_id,
        branch_id=flt.branch_id,
        overdue_only=flt.overdue_only,
        unreconciled_only=flt.unreconciled_only,
        ignored_filters=[],
    )
    current_inflow = _actual_inflow(start, end, flt)
    previous_inflow = _actual_inflow(previous_start, previous_end, previous_filter)
    current_overdue = _overdue_exposure(timezone.localdate(), flt)

    return {
        "as_of": timezone.now().isoformat(),
        "window": {
            "date_from": start.isoformat(),
            "date_to": end.isoformat(),
            "previous_date_from": previous_start.isoformat(),
            "previous_date_to": previous_end.isoformat(),
            "ignored_filters": flt.ignored_filters,
        },
        "safety": {
            "read_only": True,
            "financial_mutation_enabled": False,
            "ai_automation_enabled": False,
        },
        "profitability": build_profitability_view(flt=flt),
        "customer_insights": build_customer_insights(flt=flt),
        "batch_performance": build_batch_performance(flt=flt),
        "cashflow": build_cashflow_dashboard(flt=flt),
        "inventory_intelligence": build_inventory_intelligence(flt=flt),
        "hr_costs": build_hr_cost_insights(flt=flt),
        "comparisons": {
            "actual_inflow": {
                "current": _money_str(current_inflow),
                "previous": _money_str(previous_inflow),
                "delta": _money_str(current_inflow - previous_inflow),
            },
            "overdue_exposure": {
                "current": _money_str(current_overdue),
            },
        },
    }
