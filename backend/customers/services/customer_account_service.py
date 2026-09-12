from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone

from billing.models import BillingInvoice, DirectSale, ReceiptDocument
from subscriptions.models import PublicLead, PublicLeadStatus
from customers.models import Customer

from subscriptions.models import ContractReference, DeliveryStatus, EmiStatus, FinancialLedger, Payment, PlanType, SubscriptionDelivery, SupportRequestStatus, SubscriptionDocument

from contracts.services.contract_reference_service import build_receivable_result
from subscriptions.services.subscription_financial_service import (
    build_customer_dashboard_summary,
    get_subscription_detail_queryset,
)
from lucky_plan.services.winner_state_service import get_subscription_winner_evidence
from core.services.operational_visibility import (
    direct_sale_active_q,
    invoice_active_q,
    get_payment_collection_totals,
    is_subscription_active_receivable,
    is_subscription_history_only,
    is_payment_active_collection,
    receipt_active_q,
)


def _money(value) -> str:
    return f"{Decimal(str(value or '0.00')).quantize(Decimal('0.01')):.2f}"


def _support_subject(category: str, message: str) -> str:
    category_label = str(category or "").strip().replace("_", " ").title()
    if category_label:
        return category_label
    cleaned = " ".join((message or "").strip().split())
    return cleaned[:80]


def sync_customer_login_identity(
    customer: Customer,
    *,
    name: str,
    phone: str,
    email: str,
    address: str,
    city: str,
) -> Customer:
    normalized_name = (name or "").strip()
    normalized_phone = (phone or "").strip()
    normalized_email = (email or "").strip()
    normalized_address = (address or "").strip()
    normalized_city = (city or "").strip()

    customer.name = normalized_name
    customer.phone = normalized_phone
    customer.address = normalized_address
    customer.city = normalized_city
    customer.save()

    user = customer.user
    user.phone = normalized_phone
    user.email = normalized_email
    user.first_name = normalized_name
    user.save()
    return customer


def build_customer_profile_summary(customer: Customer) -> dict[str, object]:
    subscriptions = list(
        get_subscription_detail_queryset()
        .filter(customer=customer)
        .order_by("-created_at", "-id")
    )
    summary = build_customer_dashboard_summary(subscriptions)

    lucky_plan_draw = []
    for sub in subscriptions:
        if sub.plan_type != PlanType.EMI or not sub.batch_id:
            continue
        evidence = get_subscription_winner_evidence(sub)
        winning_draw = evidence.get("winning_draw")
        if not winning_draw or not getattr(winning_draw, "is_revealed", False):
            continue
        dc = getattr(winning_draw, "draw_commit", None)
        public_hash = (
            dc.public_commit_hash if dc else winning_draw.committed_hash
        )
        lucky_plan_draw.append(
            {
                "subscription_id": sub.id,
                "batch_code": sub.batch.batch_code if sub.batch_id else None,
                "winner_lucky_number": getattr(sub.lucky_id, "lucky_number", None),
                "draw_month": winning_draw.draw_month,
                "draw_date": winning_draw.draw_date,
                "revealed_at": winning_draw.revealed_at,
                "public_commit_hash": public_hash,
                "verification_status": "coordinated" if dc else "legacy",
                "waived_emi_count": sub.emis.filter(status=EmiStatus.WAIVED).count(),
                "waived_amount": _money(sub.waived_amount),
            }
        )

    return {
        "total_subscriptions": summary["subscription_count"],
        "active_subscriptions": summary["active_subscriptions"],
        "won_subscriptions": summary["winner_subscriptions"],
        "completed_subscriptions": summary["completed_subscriptions"],
        "pending_emis": summary["pending_emis"],
        "paid_emis": summary["paid_emis"],
        "waived_emis": summary["waived_emis"],
        "total_paid_amount": summary["total_paid_amount"],
        "lucky_plan_draw": lucky_plan_draw,
    }


def get_customer_historical_subscription_contract_value(customer: Customer) -> Decimal:
    """
    Historical contract value is counted once per non-active subscription.
    Never aggregate this from EMI joins.
    """
    subscriptions = (
        get_subscription_detail_queryset()
        .filter(customer=customer)
        .order_by("-created_at", "-id")
    )
    return sum(
        (subscription.total_amount or Decimal("0.00"))
        for subscription in subscriptions
        if is_subscription_history_only(subscription)
    )


def build_customer_product_posture(customer: Customer) -> dict[str, object]:
    from subscriptions.models import Subscription

    return build_product_posture(
        subscriptions=Subscription.objects.filter(customer=customer),
        direct_sales=DirectSale.objects.filter(customer=customer),
    )


def build_product_posture(*, subscriptions, direct_sales) -> dict[str, object]:
    """One money summary per product line — Advance EMI, rent/lease, direct sale.

    Rent/lease money lives on RentLeaseBillingDemand/RentLeaseCollection, never
    on Payment/FinancialLedger, so each line reads its own source. Takes any
    subscription/direct-sale querysets, so the same summary serves a customer
    (admin page + portal) and a party 360 (e.g. a partner's referred contracts).
    """
    from django.db.models import F, Max, Min, DecimalField, ExpressionWrapper

    from core.services.operational_visibility import (
        ACTIVE_BATCH_SUBSCRIPTION_STATUSES,
        LIVE_RENT_LEASE_SUBSCRIPTION_STATUSES,
    )
    from payments.models import RentLeaseBillingDemand, RentLeaseCollection
    from subscriptions.models import Emi, LedgerEntryType, Subscription

    today = timezone.localdate()
    zero = Decimal("0.00")
    outstanding = ExpressionWrapper(
        F("amount") - F("collected_amount"),
        output_field=DecimalField(max_digits=12, decimal_places=2),
    )

    # --- Advance EMI -------------------------------------------------------
    emi_subs = subscriptions.filter(
        plan_type=PlanType.EMI,
        status__in=list(ACTIVE_BATCH_SUBSCRIPTION_STATUSES),
    )
    pending_emis = Emi.objects.filter(subscription__in=emi_subs, status=EmiStatus.PENDING)
    emi_pending = pending_emis.aggregate(
        due=Sum("amount"),
        overdue=Sum("amount", filter=Q(due_date__lt=today)),
        next_due=Min("due_date"),
    )
    ledger = FinancialLedger.objects.filter(emi__subscription__in=emi_subs).aggregate(
        paid=Sum("amount", filter=Q(entry_type=LedgerEntryType.EMI_PAYMENT)),
        reversed=Sum("amount", filter=Q(entry_type=LedgerEntryType.PAYMENT_REVERSAL)),
    )
    last_emi_payment = (
        Payment.objects.filter(subscription__in=subscriptions.filter(plan_type=PlanType.EMI))
        .exclude(allocation_metadata__reversal__is_reversed=True)
        .aggregate(last=Max("payment_date"))["last"]
    )
    emi = {
        "count": emi_subs.count(),
        "value": _money(emi_subs.aggregate(total=Sum("total_amount"))["total"]),
        "paid": _money((ledger["paid"] or zero) - (ledger["reversed"] or zero)),
        "due": _money(emi_pending["due"]),
        "overdue": _money(emi_pending["overdue"]),
        "next_due_date": emi_pending["next_due"],
        "last_collection_date": last_emi_payment,
    }

    # --- Rent / lease ------------------------------------------------------
    rl_subs = subscriptions.filter(
        plan_type__in=[PlanType.RENT, PlanType.LEASE],
        status__in=list(LIVE_RENT_LEASE_SUBSCRIPTION_STATUSES),
    )
    rl_monthly = (
        RentLeaseBillingDemand.objects.filter(subscription__in=rl_subs)
        .exclude(demand_type="SECURITY_DEPOSIT")
        .exclude(status="CANCELLED")
    )
    rl_open = rl_monthly.exclude(status__in=["WAIVED", "PAID"])
    rl_open_totals = rl_open.aggregate(
        due=Sum(outstanding),
        overdue=Sum(outstanding, filter=Q(due_date__lt=today)),
        next_due=Min("due_date"),
    )
    rent_lease = {
        "count": rl_subs.count(),
        "rent_count": rl_subs.filter(plan_type=PlanType.RENT).count(),
        "lease_count": rl_subs.filter(plan_type=PlanType.LEASE).count(),
        "value": _money(rl_subs.aggregate(total=Sum("total_amount"))["total"]),
        "paid": _money(rl_monthly.aggregate(total=Sum("collected_amount"))["total"]),
        "due": _money(rl_open_totals["due"]),
        "overdue": _money(rl_open_totals["overdue"]),
        "next_due_date": rl_open_totals["next_due"],
        "deposit_held": _money(
            RentLeaseBillingDemand.objects.filter(
                subscription__in=rl_subs, demand_type="SECURITY_DEPOSIT"
            ).aggregate(total=Sum("held_amount"))["total"]
        ),
        "last_collection_date": RentLeaseCollection.objects.filter(
            subscription__in=subscriptions, status="ACTIVE"
        ).aggregate(last=Max("payment_date"))["last"],
    }

    # --- Direct sale -------------------------------------------------------
    active_direct_sales = direct_sales.filter(direct_sale_active_q())
    ds_totals = active_direct_sales.aggregate(
        value=Sum("grand_total"),
        received=Sum("received_total"),
        outstanding=Sum("balance_total"),
    )
    direct_sale = {
        "count": active_direct_sales.count(),
        "value": _money(ds_totals["value"]),
        "paid": _money(ds_totals["received"]),
        "due": _money(ds_totals["outstanding"]),
        "overdue": _money(zero),  # direct sales carry no due date
        "next_due_date": None,
        "last_sale_date": direct_sales.aggregate(
            last=Max("sale_date")
        )["last"],
        "last_collection_date": ReceiptDocument.objects.filter(direct_sale__in=direct_sales)
        .filter(receipt_active_q())
        .aggregate(last=Max("receipt_date"))["last"],
    }

    lines = (emi, rent_lease, direct_sale)
    dates = [line["last_collection_date"] for line in lines if line["last_collection_date"]]
    next_dates = [line["next_due_date"] for line in lines if line["next_due_date"]]
    return {
        "advance_emi": emi,
        "rent_lease": rent_lease,
        "direct_sale": direct_sale,
        "totals": {
            "active_count": emi["count"] + rent_lease["count"] + direct_sale["count"],
            "value": _money(sum(Decimal(line["value"]) for line in lines)),
            "paid": _money(sum(Decimal(line["paid"]) for line in lines)),
            "due": _money(sum(Decimal(line["due"]) for line in lines)),
            "overdue": _money(sum(Decimal(line["overdue"]) for line in lines)),
            "next_due_date": min(next_dates) if next_dates else None,
            "last_collection_date": max(dates) if dates else None,
        },
    }


def build_catalog_product_posture(product_id) -> dict[str, object]:
    """One catalog product across Advance EMI, rent/lease and direct sale.

    Contracts are single-product (``Subscription.product``), so the EMI and
    rent/lease lines reuse ``build_product_posture``. A direct sale can hold
    several products, so its line is built from this product's own sale lines:
    value = Σ its ``line_total``; paid/due are the sale's received/balance
    allocated pro-rata by this product's share of the sale's grand total.
    """
    from django.db.models import Max

    from subscriptions.models import Subscription
    from billing.models import DirectSaleLine

    posture = build_product_posture(
        subscriptions=Subscription.objects.filter(product_id=product_id),
        direct_sales=DirectSale.objects.none(),
    )

    active_sales = DirectSale.objects.filter(direct_sale_active_q())
    per_sale = list(
        DirectSaleLine.objects.filter(product_id=product_id, direct_sale__in=active_sales)
        .values("direct_sale_id")
        .annotate(product_total=Sum("line_total"), units=Sum("quantity"))
    )
    sale_ids = [row["direct_sale_id"] for row in per_sale]
    sales = {
        row["id"]: row
        for row in DirectSale.objects.filter(id__in=sale_ids).values(
            "id", "grand_total", "received_total", "balance_total", "sale_date"
        )
    }
    value = paid = due = Decimal("0")
    units = Decimal("0")
    last_sale = None
    for row in per_sale:
        sale = sales.get(row["direct_sale_id"])
        if not sale:
            continue
        product_total = Decimal(str(row["product_total"] or "0"))
        grand_total = Decimal(str(sale["grand_total"] or "0"))
        share = (product_total / grand_total) if grand_total > 0 else Decimal("0")
        value += product_total
        paid += Decimal(str(sale["received_total"] or "0")) * share
        due += Decimal(str(sale["balance_total"] or "0")) * share
        units += Decimal(str(row["units"] or "0"))
        if sale["sale_date"] and (last_sale is None or sale["sale_date"] > last_sale):
            last_sale = sale["sale_date"]
    last_receipt = (
        ReceiptDocument.objects.filter(direct_sale_id__in=sale_ids)
        .filter(receipt_active_q())
        .aggregate(last=Max("receipt_date"))["last"]
        if sale_ids
        else None
    )
    posture["direct_sale"] = {
        "count": len(sales),
        "value": _money(value),
        "paid": _money(paid),
        "due": _money(due),
        "overdue": _money(0),  # direct sales carry no due date
        "next_due_date": None,
        "last_sale_date": last_sale,
        "last_collection_date": last_receipt,
        "units_sold": f"{units.normalize():f}" if units else "0",
        "allocation": "PRO_RATA_BY_LINE_VALUE",
    }

    lines = (posture["advance_emi"], posture["rent_lease"], posture["direct_sale"])
    dates = [line["last_collection_date"] for line in lines if line["last_collection_date"]]
    next_dates = [line["next_due_date"] for line in lines if line["next_due_date"]]
    posture["totals"] = {
        "active_count": sum(int(line["count"]) for line in lines),
        "value": _money(sum(Decimal(line["value"]) for line in lines)),
        "paid": _money(sum(Decimal(line["paid"]) for line in lines)),
        "due": _money(sum(Decimal(line["due"]) for line in lines)),
        "overdue": _money(sum(Decimal(line["overdue"]) for line in lines)),
        "next_due_date": min(next_dates) if next_dates else None,
        "last_collection_date": max(dates) if dates else None,
    }
    return posture


def build_vendor_payable_posture(vendor_ids) -> dict[str, object] | None:
    """What we owe the given vendors, read from the vendor ledger.

    Ledger convention (procurement_service): a posted bill is a debit and a
    payment/settlement is a credit, so the payable balance is debit − credit.
    Vendor bills carry no due date, so there is no overdue figure.
    """
    from django.db.models import Max

    from accounting.models import VendorLedgerEntry

    ids = [vendor_id for vendor_id in (vendor_ids or []) if vendor_id]
    if not ids:
        return None
    # Aliases must not reuse the field names: Django would resolve the later
    # Sum("debit", filter=...) against the "debit" aggregate and raise FieldError.
    totals = VendorLedgerEntry.objects.filter(vendor_id__in=ids).aggregate(
        debit_total=Sum("debit"),
        credit_total=Sum("credit"),
        billed=Sum("debit", filter=Q(entry_type="PURCHASE_BILL")),
        paid=Sum("credit", filter=Q(entry_type="PAYMENT_TO_VENDOR")),
        last_bill=Max("posted_at", filter=Q(entry_type="PURCHASE_BILL")),
        last_payment=Max("posted_at", filter=Q(entry_type="PAYMENT_TO_VENDOR")),
    )
    balance = Decimal(str(totals["debit_total"] or "0")) - Decimal(str(totals["credit_total"] or "0"))

    def _day(value):
        return timezone.localtime(value).date() if value else None

    return {
        "vendor_count": len(ids),
        "billed": _money(totals["billed"]),
        "paid": _money(totals["paid"]),
        "payable": _money(max(balance, Decimal("0"))),
        "advance": _money(max(-balance, Decimal("0"))),
        "last_bill_date": _day(totals["last_bill"]),
        "last_payment_date": _day(totals["last_payment"]),
    }


def build_staff_money_posture(employee_ids) -> dict[str, object] | None:
    """Money around staff: what they collected per product line, and the salary,
    advances and expense claims owed to or by them.

    Staff own no contracts, so this is the staff counterpart of the customer
    product posture. Collections are attributed by login user (Payment.collected_by,
    RentLeaseCollection/RentLeaseDepositTransaction.created_by,
    DirectSale.confirmed_by) via the StaffIdentity employee↔user link.
    """
    from django.db.models import Count, Max

    from accounting.models import EmployeeExpenseClaim, EmployeeProfile, SalarySheet, StaffAdvance
    from accounts.models import StaffIdentity
    from payments.models import RentLeaseCollection
    from subscriptions.models import RentLeaseDepositTransaction

    ids = [employee_id for employee_id in (employee_ids or []) if employee_id]
    if not ids:
        return None
    user_ids = list(
        StaffIdentity.objects.filter(employee_id__in=ids).values_list("user_id", flat=True)
    )

    def _line(queryset, amount_field: str, date_field: str) -> dict[str, object]:
        agg = queryset.aggregate(total=Sum(amount_field), count=Count("id"), last=Max(date_field))
        return {"count": agg["count"] or 0, "amount": _money(agg["total"]), "last_date": agg["last"]}

    emi = _line(
        Payment.objects.filter(collected_by_id__in=user_ids).exclude(
            allocation_metadata__reversal__is_reversed=True
        ),
        "amount",
        "payment_date",
    )
    rent_lease = _line(
        RentLeaseCollection.objects.filter(created_by_id__in=user_ids, status="ACTIVE"),
        "amount",
        "payment_date",
    )
    deposit = _line(
        RentLeaseDepositTransaction.objects.filter(
            created_by_id__in=user_ids, transaction_type="DEPOSIT_RECEIPT", status="ACTIVE"
        ),
        "amount",
        "transaction_date",
    )
    direct_sales = _line(
        DirectSale.objects.filter(confirmed_by_id__in=user_ids).filter(direct_sale_active_q()),
        "grand_total",
        "sale_date",
    )

    sheets = SalarySheet.objects.filter(employee_id__in=ids)
    salary = sheets.aggregate(
        paid=Sum("net_amount", filter=Q(status="PAID")),
        pending=Sum("net_amount", filter=Q(status__in=["APPROVED", "POSTED", "PAID_PARTIAL"])),
    )
    last_paid = sheets.filter(status="PAID").order_by("-year", "-month").values("year", "month").first()
    advances = StaffAdvance.objects.filter(
        employee_id__in=ids, status__in=["DISBURSED", "PARTIALLY_RECOVERED"]
    ).aggregate(amount=Sum("amount"), recovered=Sum("recovered_amount"))
    advance_outstanding = Decimal(str(advances["amount"] or "0")) - Decimal(
        str(advances["recovered"] or "0")
    )
    claims_pending = EmployeeExpenseClaim.objects.filter(
        employee_id__in=ids, status__in=["APPROVED", "POSTED", "PAID_PARTIAL"]
    ).aggregate(total=Sum("approved_amount"))["total"]
    base_salary = EmployeeProfile.objects.filter(id__in=ids).aggregate(total=Sum("base_salary"))["total"]

    return {
        "staff_count": len(ids),
        "has_login": bool(user_ids),
        "collections": {
            "advance_emi": emi,
            "rent_lease": rent_lease,
            "deposit": deposit,
            "total": _money(
                sum(Decimal(line["amount"]) for line in (emi, rent_lease, deposit))
            ),
        },
        "direct_sales_confirmed": direct_sales,
        "payroll": {
            "base_salary": _money(base_salary),
            "salary_paid": _money(salary["paid"]),
            "salary_pending": _money(salary["pending"]),
            "last_paid_period": (
                f"{last_paid['year']}-{last_paid['month']:02d}" if last_paid else None
            ),
            "advance_outstanding": _money(max(advance_outstanding, Decimal("0"))),
            "expense_claims_pending": _money(claims_pending),
        },
    }


def build_customer_operational_profile(customer: Customer) -> dict[str, object]:
    from accounting.models import CustomerOpeningOutstanding, LegacyReceivableCollection

    opening_outstanding_qs = CustomerOpeningOutstanding.objects.select_related("migration_row", "migration_row__batch").filter(customer=customer)
    unsettled_qs = opening_outstanding_qs.filter(is_settled=False)
    opening_outstanding_totals = unsettled_qs.aggregate(
        total_count=Count("id"),
        remaining_total=Sum("outstanding_amount") - Sum("collected_amount"),
    )
    raw_remaining = opening_outstanding_totals["remaining_total"]
    legacy_outstanding_amount = raw_remaining if raw_remaining and raw_remaining > Decimal("0.00") else Decimal("0.00")
    legacy_outstanding_count = opening_outstanding_totals["total_count"] or 0

    legacy_receivable_rows = [
        {
            "id": obj.id,
            "customer_name": obj.customer_name,
            "phone": obj.phone,
            "outstanding_amount": _money(obj.outstanding_amount),
            "collected_amount": _money(obj.collected_amount),
            "balance_remaining": _money(obj.balance_remaining),
            "entry_date": obj.entry_date,
            "notes": obj.notes,
            "is_settled": obj.is_settled,
            "settled_at": obj.settled_at,
            "admin_verified": obj.admin_verified,
            "admin_verified_at": obj.admin_verified_at,
            "admin_verification_notes": obj.admin_verification_notes,
            "migration_row_id": obj.migration_row_id,
            "migration_batch_id": obj.migration_row.batch_id if obj.migration_row else None,
            "migration_batch_number": obj.migration_row.batch.batch_number if obj.migration_row else None,
        }
        for obj in opening_outstanding_qs.order_by("-entry_date", "-id")[:20]
    ]

    legacy_collection_rows = [
        {
            "id": col.id,
            "collection_no": col.collection_no,
            "receivable_id": col.receivable_id,
            "customer_name": col.receivable.customer_name,
            "amount": _money(col.amount),
            "payment_method": col.payment_method,
            "finance_account_name": getattr(col.finance_account, "name", None),
            "receipt_date": col.receipt_date,
            "reference_no": col.reference_no,
            "notes": col.notes,
            "journal_entry_no": getattr(col.posted_journal_entry, "entry_no", None),
            "collected_by_username": getattr(col.collected_by, "username", None),
            "created_at": col.created_at,
        }
        for col in LegacyReceivableCollection.objects.select_related(
            "receivable", "finance_account", "posted_journal_entry", "collected_by"
        ).filter(receivable__customer=customer).order_by("-created_at", "-id")[:20]
    ]

    subscriptions = list(
        get_subscription_detail_queryset()
        .filter(customer=customer)
        .order_by("-created_at", "-id")
    )
    subscription_summary = build_customer_dashboard_summary(subscriptions)
    active_subscriptions = [
        sub for sub in subscriptions if is_subscription_active_receivable(sub)
    ]
    active_subscription_summary = build_customer_dashboard_summary(active_subscriptions)
    historical_subscriptions = [
        sub for sub in subscriptions if is_subscription_history_only(sub)
    ]
    active_contract_value = sum((sub.total_amount or Decimal("0.00")) for sub in active_subscriptions)
    historical_contract_value = get_customer_historical_subscription_contract_value(
        customer
    )
    cancelled_subscription_count = sum(
        1 for sub in subscriptions if str(getattr(sub, "status", "")) == "CANCELLED"
    )
    history_badges: list[str] = []
    if cancelled_subscription_count > 0:
        history_badges.append("CANCELLED")
    if len(historical_subscriptions) > 0:
        history_badges.append("HISTORY")

    direct_sales_qs = (
        DirectSale.objects.select_related("branch", "cash_counter", "finance_account")
        .filter(customer=customer)
        .order_by("-sale_date", "-id")
    )
    active_direct_sales_qs = direct_sales_qs.filter(direct_sale_active_q())
    history_direct_sales_qs = direct_sales_qs.exclude(direct_sale_active_q())
    direct_sales_totals = direct_sales_qs.aggregate(
        total_count=Count("id"),
        invoiced_count=Count("id", filter=Q(status="INVOICED")),
        outstanding_count=Count("id", filter=Q(balance_total__gt=Decimal("0.00"))),
        gross_total=Sum("grand_total"),
        received_total=Sum("received_total"),
        outstanding_total=Sum("balance_total"),
    )
    direct_sales_active_totals = active_direct_sales_qs.aggregate(
        total_count=Count("id"),
        outstanding_count=Count("id", filter=Q(balance_total__gt=Decimal("0.00"))),
        gross_total=Sum("grand_total"),
        received_total=Sum("received_total"),
        outstanding_total=Sum("balance_total"),
    )
    direct_sales_history_totals = history_direct_sales_qs.aggregate(
        total_count=Count("id"),
        gross_total=Sum("grand_total"),
    )

    payment_qs = (
        Payment.objects.select_related("subscription", "subscription__partner")
        .filter(customer=customer)
        .order_by("-payment_date", "-id")
    )
    payment_totals = get_payment_collection_totals(payment_qs)
    active_payment_amount = payment_totals["active_amount"]
    reversed_payment_amount = payment_totals["reversed_amount"]

    receipt_qs = (
        ReceiptDocument.objects.select_related("finance_account", "billing_invoice")
        .filter(customer=customer)
        .order_by("-receipt_date", "-id")
    )
    active_receipt_qs = receipt_qs.filter(receipt_active_q())
    receipt_totals = receipt_qs.aggregate(
        total_count=Count("id"),
        total_amount=Sum("amount"),
    )
    active_receipt_totals = active_receipt_qs.aggregate(
        total_count=Count("id"),
        total_amount=Sum("amount"),
    )
    invoice_qs = (
        BillingInvoice.objects.select_related("branch", "direct_sale")
        .filter(customer=customer)
        .order_by("-invoice_date", "-id")
    )
    active_invoice_qs = invoice_qs.filter(invoice_active_q())
    history_invoice_qs = invoice_qs.exclude(invoice_active_q())
    invoice_totals = invoice_qs.aggregate(
        total_count=Count("id"),
        posted_count=Count("id", filter=Q(status="POSTED")),
        grand_total=Sum("grand_total"),
        outstanding_total=Sum("balance_total"),
    )
    active_invoice_totals = active_invoice_qs.aggregate(
        total_count=Count("id"),
        outstanding_total=Sum("balance_total"),
    )
    history_invoice_totals = history_invoice_qs.aggregate(
        total_count=Count("id"),
        grand_total=Sum("grand_total"),
    )

    lead_filters = Q(converted_customer=customer)
    if customer.phone:
        lead_filters = lead_filters | Q(phone=customer.phone)
    customer_email = (getattr(customer.user, "email", "") or "").strip()
    if customer_email:
        lead_filters = lead_filters | Q(email__iexact=customer_email)

    lead_qs = (
        PublicLead.objects.select_related(
            "product",
            "assigned_to",
            "converted_subscription",
            "converted_direct_sale",
            "converted_by",
        )
        .filter(lead_filters)
        .distinct()
        .order_by("-created_at", "-id")
    )
    lead_totals = lead_qs.aggregate(
        total_count=Count("id"),
        open_count=Count(
            "id",
            filter=Q(
                status__in=[
                    PublicLeadStatus.NEW,
                    PublicLeadStatus.IN_PROGRESS,
                    PublicLeadStatus.CONTACTED,
                ]
            ),
        ),
        converted_count=Count("id", filter=Q(status=PublicLeadStatus.CONVERTED)),
        quotation_count=Count("id", filter=Q(intent="QUOTATION")),
        estimate_count=Count("id", filter=Q(intent="ESTIMATE")),
        follow_up_required_count=Count("id", filter=Q(follow_up_required=True)),
        follow_up_due_count=Count(
            "id",
            filter=Q(
                follow_up_required=True,
                follow_up_on__isnull=False,
                follow_up_on__lte=timezone.localdate(),
            )
            & ~Q(status__in=[PublicLeadStatus.CONVERTED, PublicLeadStatus.CLOSED]),
        ),
    )

    document_qs = (
        SubscriptionDocument.objects.select_related("subscription")
        .filter(subscription__customer=customer)
        .order_by("-created_at", "-id")
    )
    active_subscription_ids = [sub.id for sub in active_subscriptions]
    ledger_qs = FinancialLedger.objects.filter(emi__subscription__customer=customer)
    active_ledger_qs = FinancialLedger.objects.filter(
        emi__subscription__customer=customer,
        emi__subscription_id__in=active_subscription_ids,
    )
    ledger_summary = ledger_qs.aggregate(
        entry_count=Count("id"),
        total_credits=Sum("amount", filter=Q(entry_direction="CREDIT")),
        total_debits=Sum("amount", filter=Q(entry_direction="DEBIT")),
    )
    active_ledger_summary = active_ledger_qs.aggregate(
        entry_count=Count("id"),
        total_credits=Sum("amount", filter=Q(entry_direction="CREDIT")),
        total_debits=Sum("amount", filter=Q(entry_direction="DEBIT")),
    )

    partner_rows = {}
    for subscription in subscriptions:
        partner = getattr(subscription, "partner", None)
        if partner is None:
            continue
        existing = partner_rows.get(partner.id)
        if existing is None:
            partner_rows[partner.id] = {
                "partner_id": partner.id,
                "partner_name": getattr(partner, "name", "") or f"Partner {partner.id}",
                "subscription_count": 1,
            }
            continue
        existing["subscription_count"] += 1

    recent_direct_sales = [
        {
            "id": sale.id,
            "sale_no": sale.sale_no,
            "sale_date": sale.sale_date,
            "status": sale.status,
            "is_history_only": sale.status
            in {
                "CANCELLED",
                "CANCELLED_PRE_INVOICE",
                "CANCELLED_AFTER_DELIVERY",
                "REVERSED_POST_INVOICE",
                "RETURNED",
                "EXCHANGED_CLOSED",
                "ARCHIVED",
            },
            "active_outstanding_total": _money(sale.balance_total if sale.status not in {"CANCELLED", "CANCELLED_PRE_INVOICE", "CANCELLED_AFTER_DELIVERY", "REVERSED_POST_INVOICE", "RETURNED", "EXCHANGED_CLOSED", "ARCHIVED"} else Decimal("0.00")),
            "branch_id": sale.branch_id,
            "branch_code": getattr(sale.branch, "code", None),
            "branch_name": getattr(sale.branch, "name", None),
            "cash_counter_id": sale.cash_counter_id,
            "cash_counter_code": getattr(sale.cash_counter, "code", None),
            "cash_counter_name": getattr(sale.cash_counter, "name", None),
            "finance_account_id": sale.finance_account_id,
            "finance_account_name": getattr(sale.finance_account, "name", None),
            "grand_total": _money(sale.grand_total),
            "received_total": _money(sale.received_total),
            "balance_total": _money(sale.balance_total),
            "billing_invoice_id": sale.billing_invoices.order_by("-id").values_list("id", flat=True).first(),
            "billing_invoice_no": sale.billing_invoices.order_by("-id").values_list("document_no", flat=True).first(),
            "billing_invoice_status": sale.billing_invoices.order_by("-id").values_list("status", flat=True).first(),
            "delivery_required": sale.delivery_required,
        }
        for sale in direct_sales_qs[:10]
    ]

    recent_subscriptions = [
        {
            "id": subscription.id,
            "subscription_number": f"SUB-{subscription.id}",
            "status": subscription.status,
            "is_history_only": subscription.status not in {"ACTIVE", "APPROVED", "PAYMENT_PENDING", "DELIVERY_PENDING"},
            "is_collectible": subscription.status in {"ACTIVE", "DEFAULTED", "PAYMENT_PENDING", "DELIVERY_PENDING"},
            "plan_type": subscription.plan_type,
            "product_name": getattr(subscription.product, "name", "") if getattr(subscription, "product", None) else "",
            "batch_code": getattr(subscription.batch, "batch_code", None),
            "lucky_number": getattr(subscription.lucky_id, "lucky_number", None),
            "total_amount": _money(subscription.total_amount),
            "monthly_amount": _money(subscription.monthly_amount),
            "next_due_date": next(
                (emi.due_date for emi in subscription.emis.all() if getattr(emi, "status", "") == "PENDING"),
                None,
            ),
            "next_due_amount": _money(
                next(
                    (emi.amount for emi in subscription.emis.all() if getattr(emi, "status", "") == "PENDING"),
                    Decimal("0.00"),
                )
            ),
            "partner_id": getattr(subscription.partner, "id", None),
            "partner_name": getattr(subscription.partner, "name", None),
        }
        for subscription in subscriptions[:10]
    ]

    recent_payments = [
        {
            "id": payment.id,
            "subscription_id": payment.subscription_id,
            "subscription_number": f"SUB-{payment.subscription_id}",
            "amount": _money(payment.amount),
            "method": payment.method,
            "reference_no": payment.reference_no,
            "payment_date": payment.payment_date,
            "is_reversed": bool(
                (getattr(payment, "allocation_metadata", {}) or {})
                .get("reversal", {})
                .get("is_reversed")
            ),
            "is_active_collection": is_payment_active_collection(payment),
            "partner_name": getattr(getattr(payment.subscription, "partner", None), "name", None),
        }
        for payment in payment_qs[:15]
    ]

    recent_receipts = [
        {
            "id": receipt.id,
            "receipt_no": receipt.receipt_no,
            "receipt_type": receipt.receipt_type,
            "status": receipt.status,
            "receipt_date": receipt.receipt_date,
            "amount": _money(receipt.amount),
            "direct_sale_id": receipt.direct_sale_id,
            "billing_invoice_id": receipt.billing_invoice_id,
            "payment_id": receipt.payment_id,
            "finance_account_name": getattr(receipt.finance_account, "name", None),
            "source_reference": receipt.source_reference,
        }
        for receipt in receipt_qs[:10]
    ]
    recent_invoices = [
        {
            "id": invoice.id,
            "document_no": invoice.document_no,
            "invoice_date": invoice.invoice_date,
            "status": invoice.status,
            "billing_channel": invoice.billing_channel,
            "branch_id": invoice.branch_id,
            "branch_code": getattr(invoice.branch, "code", None),
            "branch_name": getattr(invoice.branch, "name", None),
            "direct_sale_id": invoice.direct_sale_id,
            "direct_sale_no": getattr(invoice.direct_sale, "sale_no", None),
            "subscription_id": invoice.subscription_id,
            "grand_total": _money(invoice.grand_total),
            "received_total": _money(invoice.received_total),
            "balance_total": _money(invoice.balance_total),
        }
        for invoice in invoice_qs[:10]
    ]

    recent_documents = [
        {
            "id": document.id,
            "subscription_id": document.subscription_id,
            "subscription_number": f"SUB-{document.subscription_id}",
            "document_type": document.document_type,
            "verification_status": document.verification_status,
            "created_at": document.created_at,
        }
        for document in document_qs[:10]
    ]
    recent_leads = [
        {
            "id": lead.id,
            "name": lead.name,
            "phone": lead.phone,
            "email": lead.email,
            "city": lead.city,
            "status": lead.status,
            "intent": lead.intent,
            "source": lead.source,
            "interested_product": lead.interested_product,
            "preferred_emi_amount": (
                _money(lead.preferred_emi_amount)
                if lead.preferred_emi_amount is not None
                else None
            ),
            "follow_up_required": lead.follow_up_required,
            "follow_up_on": lead.follow_up_on,
            "follow_up_note": lead.follow_up_note,
            "notes": lead.notes,
            "admin_notes": lead.admin_notes,
            "assigned_to_id": lead.assigned_to_id,
            "assigned_to_username": getattr(lead.assigned_to, "username", None),
            "converted_customer_id": lead.converted_customer_id,
            "converted_subscription_id": lead.converted_subscription_id,
            "converted_direct_sale_id": lead.converted_direct_sale_id,
            "converted_direct_sale_no": getattr(lead.converted_direct_sale, "sale_no", None),
            "created_at": lead.created_at,
            "converted_at": lead.converted_at,
        }
        for lead in lead_qs[:15]
    ]
    quotation_estimate_rows = [
        row for row in recent_leads if row["intent"] in {"QUOTATION", "ESTIMATE"}
    ]
    contract_reference_rows = list(
        ContractReference.objects.select_related(
            "subscription",
            "subscription__customer",
            "subscription__product",
            "subscription__batch",
            "subscription__lucky_id",
            "direct_sale",
            "invoice",
        )
        .filter(customer=customer)
        .order_by("-source_created_at", "-id")[:25]
    )
    contract_reference_payload = [
        build_receivable_result(reference, audience="admin")
        for reference in contract_reference_rows
    ]

    return {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "phone": customer.phone,
            "address": customer.address,
            "city": customer.city,
            "kyc_status": customer.kyc_status,
            "user_is_active": getattr(customer.user, "is_active", False),
            "customer_source": customer.customer_source,
        },
        "overview": {
            "legacy_outstanding_amount": _money(legacy_outstanding_amount),
            "legacy_outstanding_count": legacy_outstanding_count,
            "subscription_count": subscription_summary["subscription_count"],
            "active_subscriptions": len(active_subscriptions),
            "historical_subscriptions": len(historical_subscriptions),
            "cancelled_subscription_count": cancelled_subscription_count,
            "completed_subscriptions": subscription_summary["completed_subscriptions"],
            "winner_subscriptions": subscription_summary["winner_subscriptions"],
            "total_subscription_paid": subscription_summary["total_paid_amount"],
            "subscription_outstanding_amount": _money(
                sum(
                    (emi.amount or Decimal("0.00"))
                    for sub in active_subscriptions
                    for emi in sub.emis.all()
                    if getattr(emi, "status", None) == EmiStatus.PENDING
                )
            ),
            "active_contract_value": _money(active_contract_value),
            "historical_contract_value": _money(historical_contract_value),
            "active_subscription_due": _money(
                active_subscription_summary["outstanding_amount"]
            ),
            "active_overdue_emi_count": int(
                active_subscription_summary.get("overdue_emis", 0) or 0
            ),
            "active_overdue_emi_amount": _money(
                active_subscription_summary.get("overdue_amount", "0.00")
            ),
            "has_history_only_contracts": len(historical_subscriptions) > 0,
            "history_badges": history_badges,
            "direct_sale_count": direct_sales_totals["total_count"] or 0,
            "active_direct_sale_count": direct_sales_active_totals["total_count"] or 0,
            "returned_direct_sale_count": direct_sales_history_totals["total_count"] or 0,
            "direct_sale_outstanding_count": direct_sales_active_totals["outstanding_count"] or 0,
            "direct_sale_outstanding_total": _money(direct_sales_active_totals["outstanding_total"]),
            "historical_direct_sale_total": _money(direct_sales_history_totals["gross_total"]),
            "receipt_count": receipt_totals["total_count"] or 0,
            "receipt_total": _money(receipt_totals["total_amount"]),
            "invoice_count": invoice_totals["total_count"] or 0,
            "active_invoice_count": active_invoice_totals["total_count"] or 0,
            "historical_invoice_count": history_invoice_totals["total_count"] or 0,
            "invoice_outstanding_total": _money(active_invoice_totals["outstanding_total"]),
            "lead_count": lead_totals["total_count"] or 0,
            "open_lead_count": lead_totals["open_count"] or 0,
            "quotation_estimate_count": (lead_totals["quotation_count"] or 0)
            + (lead_totals["estimate_count"] or 0),
        },
        "product_posture": build_customer_product_posture(customer),
        "direct_sales": {
            "summary": {
                "total_count": direct_sales_totals["total_count"] or 0,
                "active_count": direct_sales_active_totals["total_count"] or 0,
                "history_count": direct_sales_history_totals["total_count"] or 0,
                "invoiced_count": direct_sales_totals["invoiced_count"] or 0,
                "outstanding_count": direct_sales_active_totals["outstanding_count"] or 0,
                "gross_total": _money(direct_sales_totals["gross_total"]),
                "received_total": _money(direct_sales_totals["received_total"]),
                "outstanding_total": _money(direct_sales_active_totals["outstanding_total"]),
                "historical_total": _money(direct_sales_history_totals["gross_total"]),
            },
            "rows": recent_direct_sales,
        },
        "subscriptions": {
            "summary": build_customer_profile_summary(customer),
            "rows": recent_subscriptions,
        },
        "legacy_receivables": {
            "rows": legacy_receivable_rows,
        },
        "legacy_collections": {
            "rows": legacy_collection_rows,
        },
        "contract_references": {
            "summary": {
                "total_count": len(contract_reference_payload),
                "advance_emi_count": sum(
                    1
                    for row in contract_reference_payload
                    if row["source_type"] == "ADVANCE_EMI"
                ),
                "rent_count": sum(
                    1 for row in contract_reference_payload if row["source_type"] == "RENT"
                ),
                "lease_count": sum(
                    1 for row in contract_reference_payload if row["source_type"] == "LEASE"
                ),
                "direct_sale_count": sum(
                    1
                    for row in contract_reference_payload
                    if row["source_type"] == "DIRECT_SALE"
                ),
            },
            "rows": contract_reference_payload,
        },
        "payments": {
            "summary": {
                "total_count": payment_totals["gross_count"],
                "active_count": payment_totals["active_count"],
                "reversed_count": payment_totals["reversed_count"],
                "total_amount": _money(payment_totals["gross_amount"]),
                "active_collected_amount": _money(active_payment_amount),
                "reversed_payment_amount": _money(reversed_payment_amount),
                "recorded_amount_total": _money(payment_totals["gross_amount"]),
                "gross_collected_amount": _money(payment_totals["gross_amount"]),
            },
            "rows": recent_payments,
        },
        "ledger_summary": {
            "entry_count": ledger_summary["entry_count"] or 0,
            "total_credits": _money(ledger_summary["total_credits"]),
            "total_debits": _money(ledger_summary["total_debits"]),
            "net_subscription_collections": _money(
                Decimal(str(active_ledger_summary["total_credits"] or "0.00"))
                - Decimal(str(active_ledger_summary["total_debits"] or "0.00"))
            ),
            "active_ledger_credits": _money(active_ledger_summary["total_credits"]),
            "active_ledger_debits": _money(active_ledger_summary["total_debits"]),
            "direct_sale_receivable_total": _money(direct_sales_active_totals["outstanding_total"]),
        },
        "receipts_documents": {
            "summary": {
                "receipt_count": receipt_totals["total_count"] or 0,
                "receipt_total": _money(receipt_totals["total_amount"]),
                "active_receipt_count": active_receipt_totals["total_count"] or 0,
                "active_receipt_total": _money(active_receipt_totals["total_amount"]),
                "document_count": document_qs.count(),
                "invoice_count": invoice_totals["total_count"] or 0,
                "invoice_posted_count": invoice_totals["posted_count"] or 0,
                "invoice_total": _money(invoice_totals["grand_total"]),
                "invoice_outstanding_total": _money(active_invoice_totals["outstanding_total"]),
            },
            "receipts": recent_receipts,
            "invoices": recent_invoices,
            "documents": recent_documents,
        },
        "leads": {
            "summary": {
                "total_count": lead_totals["total_count"] or 0,
                "open_count": lead_totals["open_count"] or 0,
                "converted_count": lead_totals["converted_count"] or 0,
                "quotation_count": lead_totals["quotation_count"] or 0,
                "estimate_count": lead_totals["estimate_count"] or 0,
                "follow_up_required_count": lead_totals["follow_up_required_count"] or 0,
                "follow_up_due_count": lead_totals["follow_up_due_count"] or 0,
            },
            "rows": recent_leads,
        },
        "quotation_estimates": {
            "summary": {
                "total_count": (lead_totals["quotation_count"] or 0)
                + (lead_totals["estimate_count"] or 0),
                "quotation_count": lead_totals["quotation_count"] or 0,
                "estimate_count": lead_totals["estimate_count"] or 0,
            },
            "rows": quotation_estimate_rows,
        },
        "partner_linkages": {
            "count": len(partner_rows),
            "rows": list(partner_rows.values()),
        },
        "legacy_receivables": {
            "summary": {
                "total_count": opening_outstanding_qs.count(),
                "unsettled_count": legacy_outstanding_count,
                "settled_count": opening_outstanding_qs.filter(is_settled=True).count(),
                "verified_count": opening_outstanding_qs.filter(admin_verified=True).count(),
                "unverified_count": opening_outstanding_qs.filter(admin_verified=False).count(),
                "total_outstanding": _money(opening_outstanding_qs.aggregate(t=Sum("outstanding_amount"))["t"]),
                "total_collected": _money(opening_outstanding_qs.aggregate(t=Sum("collected_amount"))["t"]),
                "balance_remaining": _money(legacy_outstanding_amount),
            },
            "rows": legacy_receivable_rows,
            "collections": legacy_collection_rows,
        },
    }


def build_customer_operational_summary(customer: Customer) -> dict[str, object]:
    profile = build_customer_operational_profile(customer)
    overview = profile.get("overview", {})
    subscriptions = profile.get("subscriptions", {})
    direct_sales = profile.get("direct_sales", {})
    payments = profile.get("payments", {})

    active_subscriptions = int(overview.get("active_subscriptions", 0) or 0)
    overdue_emi_count = int(overview.get("active_overdue_emi_count", 0) or 0)
    active_subscription_due = _money(
        overview.get("active_subscription_due")
        or overview.get("subscription_outstanding_amount")
    )
    historical_subscriptions = int(overview.get("historical_subscriptions", 0) or 0)
    cancelled_subscription_count = int(
        overview.get("cancelled_subscription_count", 0) or 0
    )
    has_history_only_contracts = bool(overview.get("has_history_only_contracts"))
    history_badges = list(overview.get("history_badges") or [])
    pending_delivery_count = SubscriptionDelivery.objects.filter(
        subscription__customer=customer,
        status__in=[
            DeliveryStatus.PENDING,
            DeliveryStatus.SCHEDULED,
            DeliveryStatus.DISPATCHED,
            DeliveryStatus.OUT_FOR_DELIVERY,
            DeliveryStatus.RETURN_REQUESTED,
            DeliveryStatus.BLOCKED_STOCK_UNAVAILABLE,
        ],
    ).count()
    open_service_count = customer.support_requests.filter(
        status__in=[SupportRequestStatus.SUBMITTED, SupportRequestStatus.UNDER_REVIEW]
    ).count()
    last_payment_date = next(
        (
            row.get("payment_date")
            for row in payments.get("rows", [])
            if not row.get("is_reversed")
        ),
        None,
    )

    risk_status = "GOOD"
    if active_subscriptions > 0:
        if overdue_emi_count > 0:
            risk_status = "OVERDUE"
        elif Decimal(active_subscription_due) > Decimal("0.00"):
            risk_status = "DUE"
        elif pending_delivery_count > 0:
            risk_status = "DELIVERY_PENDING"
        elif open_service_count > 0:
            risk_status = "SERVICE_OPEN"
        else:
            risk_status = "ACTIVE"
    elif has_history_only_contracts:
        risk_status = "CANCELLED" if cancelled_subscription_count > 0 else "HISTORY"

    contract_reference_rows = profile.get("contract_references", {}).get("rows", [])
    rent_lease_contracts = [
        row
        for row in contract_reference_rows
        if str(row.get("source_type", "")).upper() in {"RENT", "LEASE"}
    ]

    return {
        "customer": {
            "id": profile.get("customer", {}).get("id"),
            "name": profile.get("customer", {}).get("name"),
            "phone": profile.get("customer", {}).get("phone"),
            "kyc_id": profile.get("customer", {}).get("kyc_status"),
            "status": "ACTIVE" if bool(profile.get("customer", {}).get("user_is_active")) else "INACTIVE",
        },
        "summary": {
            "active_subscriptions": active_subscriptions,
            "historical_subscriptions": historical_subscriptions,
            "cancelled_subscription_count": cancelled_subscription_count,
            "active_contract_value": _money(overview.get("active_contract_value")),
            "historical_contract_value": _money(overview.get("historical_contract_value")),
            "subscription_outstanding": active_subscription_due,
            "active_subscription_due": active_subscription_due,
            "direct_sale_outstanding": _money(
                direct_sales.get("summary", {}).get("outstanding_total")
            ),
            "returned_direct_sale_count": int(
                direct_sales.get("summary", {}).get("history_count", 0) or 0
            ),
            "rent_lease_outstanding": "0.00",
            "overdue_emi_count": overdue_emi_count,
            "active_overdue_emi_count": overdue_emi_count,
            "active_overdue_emi_amount": _money(
                overview.get("active_overdue_emi_amount")
            ),
            "pending_delivery_count": pending_delivery_count,
            "open_service_count": open_service_count,
            "last_payment_date": last_payment_date,
            "active_payment_count": int(payments.get("summary", {}).get("active_count", 0) or 0),
            "reversed_payment_count": int(payments.get("summary", {}).get("reversed_count", 0) or 0),
            "active_collected_amount": _money(
                payments.get("summary", {}).get("active_collected_amount")
            ),
            "reversed_payment_amount": _money(
                payments.get("summary", {}).get("reversed_payment_amount")
            ),
            "has_history_only_contracts": has_history_only_contracts,
            "history_badges": history_badges,
            "risk_status": risk_status,
        },
        "subscriptions": subscriptions.get("rows", []),
        "direct_sales": direct_sales.get("rows", []),
        "rent_lease_contracts": rent_lease_contracts,
        "deliveries": list(
            SubscriptionDelivery.objects.filter(subscription__customer=customer)
            .select_related("subscription")
            .order_by("-created_at", "-id")
            .values(
                "id",
                "subscription_id",
                "delivery_reference",
                "status",
                "scheduled_date",
                "delivered_at",
                "created_at",
            )[:10]
        ),
        "service_tickets": [
            {
                "id": row["id"],
                "status": row["status"],
                "category": row["category"],
                "subject": _support_subject(row.get("category", ""), row.get("message", "")),
                "title": _support_subject(row.get("category", ""), row.get("message", "")),
                "message": row.get("message", ""),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
                "resolution_summary": row.get("resolution_summary", ""),
            }
            for row in customer.support_requests.order_by("-created_at", "-id").values(
                "id",
                "status",
                "category",
                "message",
                "created_at",
                "updated_at",
                "resolution_summary",
            )[:10]
        ],
        "recent_activity": (
            payments.get("rows", [])[:5]
            + direct_sales.get("rows", [])[:5]
            + subscriptions.get("rows", [])[:5]
        )[:12],
    }
