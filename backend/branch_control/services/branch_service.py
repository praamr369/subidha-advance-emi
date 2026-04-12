from __future__ import annotations

from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone

from branch_control.models import Branch, BranchStatus, CashCounter


def get_primary_branch() -> Branch | None:
    return (
        Branch.objects.filter(is_primary=True).order_by("id").first()
        or Branch.objects.filter(status=BranchStatus.ACTIVE).order_by("id").first()
    )


def get_primary_branch_id() -> int | None:
    branch = get_primary_branch()
    return branch.id if branch else None


def default_branch_for_model() -> Branch | None:
    return get_primary_branch()


def active_counter_queryset():
    return CashCounter.objects.select_related("branch", "finance_account").filter(is_active=True)


def assigned_branch_ids_for_user(user) -> list[int]:
    if not user or not getattr(user, "is_authenticated", False):
        return []
    if getattr(user, "role", "") == "ADMIN":
        return []
    ids = list(
        active_counter_queryset()
        .filter(assigned_user=user)
        .values_list("branch_id", flat=True)
        .distinct()
    )
    if ids:
        return ids
    primary_branch_id = get_primary_branch_id()
    active_branch_count = Branch.objects.filter(status=BranchStatus.ACTIVE).count()
    if getattr(user, "role", "") == "CASHIER" and active_branch_count > 1:
        return []
    return [primary_branch_id] if primary_branch_id else []


def assigned_counter_for_user(user) -> CashCounter | None:
    if not user or not getattr(user, "is_authenticated", False):
        return None
    return active_counter_queryset().filter(assigned_user=user).order_by("id").first()


def assert_user_branch_access(*, user, branch_id: int | None):
    if not branch_id or not user or not getattr(user, "is_authenticated", False):
        return
    if getattr(user, "role", "") == "ADMIN":
        return
    allowed_branch_ids = assigned_branch_ids_for_user(user)
    if not allowed_branch_ids:
        raise ValueError("User is not assigned to any branch.")
    if allowed_branch_ids and int(branch_id) not in {int(value) for value in allowed_branch_ids}:
        raise ValueError("User is not assigned to the selected branch.")


def assert_user_counter_access(*, user, counter: CashCounter | None):
    if counter is None or not user or not getattr(user, "is_authenticated", False):
        return
    if getattr(user, "role", "") == "ADMIN":
        return
    if counter.assigned_user_id and counter.assigned_user_id != user.id:
        raise ValueError("User is not assigned to the selected counter.")
    assert_user_branch_access(user=user, branch_id=counter.branch_id)


def scope_queryset_to_user_branches(queryset, *, user, field_name: str):
    if not user or not getattr(user, "is_authenticated", False):
        return queryset.none()
    if getattr(user, "role", "") == "ADMIN":
        return queryset
    branch_ids = assigned_branch_ids_for_user(user)
    if not branch_ids:
        return queryset.none()
    return queryset.filter(**{f"{field_name}__in": branch_ids})


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def build_branch_reporting_overview(*, branch_id: int | None = None, start_date=None, end_date=None) -> dict:
    from accounting.models import ExpenseVoucher, SalaryPayment, EmployeeExpenseClaimPayment
    from billing.models import DirectSale
    from inventory.models import StockLedger, StockLocation
    from subscriptions.models import Emi, EmiStatus, Payment, Subscription, SubscriptionStatus

    branch_queryset = Branch.objects.all()
    if branch_id:
        branch_queryset = branch_queryset.filter(pk=branch_id)
    selected_branch = branch_queryset.order_by("name", "id").first() if branch_id else None

    payment_queryset = Payment.objects.select_related("branch", "cash_counter").all()
    direct_sale_queryset = DirectSale.objects.select_related("branch").all()
    subscription_queryset = Subscription.objects.select_related("branch").all()
    emi_queryset = Emi.objects.select_related("subscription", "subscription__branch").all()
    stock_queryset = StockLedger.objects.select_related("stock_location", "stock_location__branch").all()
    expense_queryset = ExpenseVoucher.objects.select_related("branch").all()
    salary_payment_queryset = SalaryPayment.objects.select_related("branch").all()
    reimbursement_queryset = EmployeeExpenseClaimPayment.objects.select_related("branch").all()

    if branch_id:
        payment_queryset = payment_queryset.filter(branch_id=branch_id)
        direct_sale_queryset = direct_sale_queryset.filter(branch_id=branch_id)
        subscription_queryset = subscription_queryset.filter(branch_id=branch_id)
        emi_queryset = emi_queryset.filter(subscription__branch_id=branch_id)
        stock_queryset = stock_queryset.filter(stock_location__branch_id=branch_id)
        expense_queryset = expense_queryset.filter(branch_id=branch_id)
        salary_payment_queryset = salary_payment_queryset.filter(branch_id=branch_id)
        reimbursement_queryset = reimbursement_queryset.filter(branch_id=branch_id)

    if start_date:
        payment_queryset = payment_queryset.filter(payment_date__gte=start_date)
        direct_sale_queryset = direct_sale_queryset.filter(sale_date__gte=start_date)
        expense_queryset = expense_queryset.filter(expense_date__gte=start_date)
        salary_payment_queryset = salary_payment_queryset.filter(payment_date__gte=start_date)
        reimbursement_queryset = reimbursement_queryset.filter(payment_date__gte=start_date)
    if end_date:
        payment_queryset = payment_queryset.filter(payment_date__lte=end_date)
        direct_sale_queryset = direct_sale_queryset.filter(sale_date__lte=end_date)
        expense_queryset = expense_queryset.filter(expense_date__lte=end_date)
        salary_payment_queryset = salary_payment_queryset.filter(payment_date__lte=end_date)
        reimbursement_queryset = reimbursement_queryset.filter(payment_date__lte=end_date)

    today = timezone.localdate()
    overdue_qs = emi_queryset.filter(status=EmiStatus.PENDING, due_date__lt=today)
    stock_locations = StockLocation.objects.select_related("branch").all()
    if branch_id:
        stock_locations = stock_locations.filter(branch_id=branch_id)

    cash_total = payment_queryset.filter(method="CASH").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    upi_total = payment_queryset.filter(method="UPI").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    bank_total = payment_queryset.filter(Q(method="BANK") | Q(method="CARD")).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    stock_balance = stock_queryset.aggregate(
        qty_in=Sum("quantity_in"),
        qty_out=Sum("quantity_out"),
    )
    on_hand_qty = _money(stock_balance["qty_in"]) - _money(stock_balance["qty_out"])
    if on_hand_qty < Decimal("0.00"):
        on_hand_qty = Decimal("0.00")

    branches_payload = [
        {
            "id": branch.id,
            "code": branch.code,
            "name": branch.name,
            "status": branch.status,
            "is_primary": branch.is_primary,
        }
        for branch in Branch.objects.order_by("name", "id")
    ]

    return {
        "branch": (
            {
                "id": selected_branch.id,
                "code": selected_branch.code,
                "name": selected_branch.name,
                "status": selected_branch.status,
                "is_primary": selected_branch.is_primary,
            }
            if selected_branch
            else None
        ),
        "branches": branches_payload,
        "filters": {
            "branch_id": branch_id,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
        },
        "collections": {
            "count": payment_queryset.count(),
            "gross_amount": f"{_money(payment_queryset.aggregate(total=Sum('amount'))['total']):.2f}",
            "cash_total": f"{_money(cash_total):.2f}",
            "bank_total": f"{_money(bank_total):.2f}",
            "upi_total": f"{_money(upi_total):.2f}",
        },
        "direct_sales": {
            "count": direct_sale_queryset.count(),
            "gross_total": f"{_money(direct_sale_queryset.aggregate(total=Sum('grand_total'))['total']):.2f}",
        },
        "subscriptions": {
            "active_contracts": subscription_queryset.filter(status=SubscriptionStatus.ACTIVE).count(),
            "completed_contracts": subscription_queryset.filter(status=SubscriptionStatus.COMPLETED).count(),
            "overdue_emi_count": overdue_qs.count(),
            "overdue_emi_amount": f"{_money(overdue_qs.aggregate(total=Sum('amount'))['total']):.2f}",
        },
        "stock": {
            "location_count": stock_locations.count(),
            "movement_count": stock_queryset.count(),
            "on_hand_qty": f"{on_hand_qty.quantize(Decimal('0.01')):.2f}",
        },
        "people_costs": {
            "salary_paid_total": f"{_money(salary_payment_queryset.aggregate(total=Sum('amount'))['total']):.2f}",
            "expense_total": f"{_money(expense_queryset.aggregate(total=Sum('net_amount'))['total']):.2f}",
            "reimbursement_total": f"{_money(reimbursement_queryset.aggregate(total=Sum('amount'))['total']):.2f}",
        },
    }
