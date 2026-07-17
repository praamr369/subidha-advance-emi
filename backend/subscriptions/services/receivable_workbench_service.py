"""
Receivable collection workbench (pre-payment 360° view).

Read-only: given one receivable (source_type + source_id) this builds the full
context a cashier needs BEFORE posting a collection:

- contract summary (contract value, paid, outstanding, overdue)
- month-wise schedule (which month is due, how much, which months the customer
  already paid, on what date and by which method)
- payment/tender history for the record
- every OTHER open due of the same customer across EMI / RENT / LEASE /
  DIRECT SALE / legacy outstanding, so nothing is missed at the counter.
"""
from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.utils import timezone

from subscriptions.models import (
    MONEY_ZERO,
    ContractReferenceType,
    EmiStatus,
    PlanType,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
    Subscription,
    q2,
)


def _money(value) -> Decimal:
    try:
        return q2(Decimal(str(value or 0)))
    except Exception:
        return q2(Decimal("0"))


def _s(value) -> str:
    return f"{_money(value):.2f}"


def _customer_payload(customer) -> dict[str, object]:
    if customer is None:
        return {"id": None, "name": "", "phone": ""}
    return {
        "id": customer.id,
        "name": getattr(customer, "name", "") or getattr(customer, "full_name", "") or str(customer),
        "phone": getattr(customer, "phone", "") or "",
    }


def _emi_payment_rows(emi) -> list[dict[str, object]]:
    rows = []
    for payment in emi.payments.all():
        rows.append(
            {
                "payment_id": payment.id,
                "date": payment.payment_date,
                "amount": _s(payment.amount),
                "method": payment.method,
                "reference_no": payment.reference_no or "",
                "finance_account_id": payment.finance_account_id,
            }
        )
    rows.sort(key=lambda row: (str(row["date"] or ""), row["payment_id"]))
    return rows


def _advance_emi_workbench(subscription: Subscription) -> dict[str, object]:
    today = timezone.localdate()
    schedule = []
    total_paid = MONEY_ZERO
    total_due = MONEY_ZERO
    overdue = MONEY_ZERO
    next_due = None

    emis = (
        subscription.emis.order_by("month_no", "due_date", "id")
        .prefetch_related("ledger_entries", "payments")
    )
    for emi in emis:
        paid = _money(emi.net_paid_amount())
        balance = _money(emi.balance_amount())
        total_paid += paid
        status = str(emi.status or "").upper()
        is_open = status not in {EmiStatus.PAID, EmiStatus.WAIVED, EmiStatus.CANCELLED} and balance > MONEY_ZERO
        if is_open:
            total_due += balance
            if emi.due_date and emi.due_date < today:
                overdue += balance
            if next_due is None:
                next_due = {"label": f"Month {emi.month_no}", "due_date": emi.due_date, "amount": _s(balance)}
        schedule.append(
            {
                "period_label": f"Month {emi.month_no}",
                "month_no": emi.month_no,
                "due_date": emi.due_date,
                "amount": _s(emi.amount),
                "paid_amount": _s(paid),
                "outstanding_amount": _s(balance),
                "status": status,
                "is_overdue": bool(is_open and emi.due_date and emi.due_date < today),
                "payments": _emi_payment_rows(emi),
            }
        )

    return {
        "contract": {
            "reference": subscription.subscription_number or subscription.contract_reference or f"SUB-{subscription.id}",
            "plan_type": subscription.plan_type,
            "status": subscription.status,
            "start_date": subscription.start_date,
            "tenure_months": subscription.tenure_months,
            "monthly_amount": _s(subscription.monthly_amount),
            "contract_value": _s(subscription.total_amount),
            "total_paid": _s(total_paid),
            "total_outstanding": _s(total_due),
            "overdue_amount": _s(overdue),
            "next_due": next_due,
            "product_summary": (subscription.product_snapshot or {}).get("name")
            or getattr(subscription.product, "name", ""),
        },
        "schedule": schedule,
        "customer": _customer_payload(subscription.customer),
    }


def _rent_lease_workbench(subscription: Subscription) -> dict[str, object]:
    today = timezone.localdate()
    schedule = []
    total_billed = MONEY_ZERO
    total_paid = MONEY_ZERO
    total_due = MONEY_ZERO
    overdue = MONEY_ZERO
    next_due = None

    demands = (
        subscription.rent_lease_demands.exclude(
            status__in=[RentLeaseDemandStatus.CANCELLED, RentLeaseDemandStatus.WAIVED]
        )
        .order_by("due_date", "id")
        .prefetch_related("rent_lease_collections")
    )
    for demand in demands:
        outstanding = _money(demand.outstanding_amount())
        collected = _money(demand.collected_amount)
        total_billed += _money(demand.amount)
        total_paid += collected
        if demand.demand_type == RentLeaseDemandType.SECURITY_DEPOSIT:
            label = "Security Deposit"
        elif demand.billing_period_start:
            label = demand.billing_period_start.strftime("%b %Y")
        else:
            label = demand.due_date.strftime("%b %Y") if demand.due_date else "Demand"
        is_open = outstanding > MONEY_ZERO
        if is_open:
            total_due += outstanding
            if demand.due_date and demand.due_date < today:
                overdue += outstanding
            if next_due is None:
                next_due = {"label": label, "due_date": demand.due_date, "amount": _s(outstanding)}
        payments = []
        for collection in demand.rent_lease_collections.all():
            if getattr(collection, "status", "ACTIVE") != "ACTIVE":
                continue
            payments.append(
                {
                    "payment_id": collection.id,
                    "collection_number": collection.collection_number,
                    "date": collection.payment_date,
                    "amount": _s(collection.amount),
                    "method": collection.payment_method,
                    "reference_no": collection.external_reference_no or "",
                    "finance_account_id": collection.finance_account_id,
                }
            )
        payments.sort(key=lambda row: (str(row["date"] or ""), row["payment_id"]))
        schedule.append(
            {
                "period_label": label,
                "demand_id": demand.id,
                "demand_type": demand.demand_type,
                "due_date": demand.due_date,
                "amount": _s(demand.amount),
                "paid_amount": _s(collected),
                "outstanding_amount": _s(outstanding),
                "status": demand.status,
                "is_overdue": bool(is_open and demand.due_date and demand.due_date < today),
                "payments": payments,
            }
        )

    return {
        "contract": {
            "reference": subscription.subscription_number or subscription.contract_reference or f"SUB-{subscription.id}",
            "plan_type": subscription.plan_type,
            "status": subscription.status,
            "start_date": subscription.start_date,
            "tenure_months": subscription.tenure_months,
            "monthly_amount": _s(subscription.monthly_amount),
            "contract_value": _s(total_billed if total_billed > MONEY_ZERO else subscription.total_amount),
            "total_paid": _s(total_paid),
            "total_outstanding": _s(total_due),
            "overdue_amount": _s(overdue),
            "next_due": next_due,
            "product_summary": (subscription.product_snapshot or {}).get("name")
            or getattr(subscription.product, "name", ""),
        },
        "schedule": schedule,
        "customer": _customer_payload(subscription.customer),
    }


def _direct_sale_workbench(source_id: int) -> dict[str, object]:
    from billing.models import DirectSale
    from billing.services.direct_sale_collection_service import get_direct_sale_receivable_position

    sale = DirectSale.objects.select_related("customer").filter(pk=source_id).first()
    if not sale:
        raise ValidationError({"source_id": "Direct sale was not found."})
    position = get_direct_sale_receivable_position(direct_sale_id=sale.id)
    outstanding = _money(position.get("outstanding"))
    collected = _money(position.get("collected_total"))
    payments = []
    for receipt in sale.receipts.all().order_by("receipt_date", "id"):
        if str(getattr(receipt, "status", "")).upper() == "CANCELLED":
            continue
        payments.append(
            {
                "payment_id": receipt.id,
                "receipt_no": receipt.receipt_no or "",
                "date": receipt.receipt_date,
                "amount": _s(receipt.amount),
                "method": (receipt.tax_profile_snapshot or {}).get("payment_method", "")
                if isinstance(receipt.tax_profile_snapshot, dict)
                else "",
                "reference_no": receipt.source_reference or "",
                "finance_account_id": receipt.finance_account_id,
            }
        )
    return {
        "contract": {
            "reference": sale.sale_no or f"SALE-{sale.id}",
            "plan_type": "DIRECT_SALE",
            "status": sale.status,
            "start_date": sale.sale_date,
            "contract_value": _s(collected + outstanding),
            "total_paid": _s(collected),
            "total_outstanding": _s(outstanding),
            "overdue_amount": _s(MONEY_ZERO),
            "next_due": (
                {"label": "Invoice Balance", "due_date": None, "amount": _s(outstanding)}
                if outstanding > MONEY_ZERO
                else None
            ),
            "product_summary": "",
        },
        "schedule": [
            {
                "period_label": "Invoice",
                "due_date": sale.sale_date,
                "amount": _s(collected + outstanding),
                "paid_amount": _s(collected),
                "outstanding_amount": _s(outstanding),
                "status": "FULLY_PAID" if outstanding <= MONEY_ZERO else ("PARTIAL" if collected > MONEY_ZERO else "PENDING"),
                "is_overdue": False,
                "payments": payments,
            }
        ],
        "customer": _customer_payload(sale.customer),
    }


def _legacy_workbench(source_id: int) -> dict[str, object]:
    from accounting.models import CustomerOpeningOutstanding

    receivable = CustomerOpeningOutstanding.objects.filter(pk=source_id).first()
    if not receivable:
        raise ValidationError({"source_id": "Legacy receivable was not found."})
    outstanding = MONEY_ZERO if receivable.is_settled else _money(receivable.outstanding_amount)
    return {
        "contract": {
            "reference": f"LEGACY-{receivable.id}",
            "plan_type": "LEGACY_RECEIVABLE",
            "status": "SETTLED" if receivable.is_settled else "OPEN",
            "start_date": receivable.entry_date,
            "contract_value": _s(receivable.outstanding_amount),
            "total_paid": _s(receivable.outstanding_amount if receivable.is_settled else MONEY_ZERO),
            "total_outstanding": _s(outstanding),
            "overdue_amount": _s(outstanding),
            "next_due": (
                {"label": "Opening Balance", "due_date": receivable.entry_date, "amount": _s(outstanding)}
                if outstanding > MONEY_ZERO
                else None
            ),
            "product_summary": receivable.notes or "",
        },
        "schedule": [
            {
                "period_label": "Opening Balance",
                "due_date": receivable.entry_date,
                "amount": _s(receivable.outstanding_amount),
                "paid_amount": _s(receivable.outstanding_amount if receivable.is_settled else MONEY_ZERO),
                "outstanding_amount": _s(outstanding),
                "status": "SETTLED" if receivable.is_settled else "PENDING",
                "is_overdue": not receivable.is_settled,
                "payments": [],
            }
        ],
        "customer": {"id": None, "name": receivable.customer_name, "phone": receivable.phone or ""},
    }


def _other_customer_dues(
    *, customer_id: int | None, customer_phone: str, exclude_source_type: str, exclude_source_id: int
) -> list[dict[str, object]]:
    """Every other open due of the same customer across all modules."""
    from subscriptions.services import contract_reference_service as crs

    rows: list[dict[str, object]] = []
    if customer_id:
        subscriptions = (
            Subscription.objects.select_related("customer")
            .filter(customer_id=customer_id)
            .order_by("id")
        )
        for subscription in subscriptions:
            source_type = {
                PlanType.EMI: ContractReferenceType.ADVANCE_EMI,
                PlanType.RENT: ContractReferenceType.RENT,
                PlanType.LEASE: ContractReferenceType.LEASE,
            }.get(subscription.plan_type)
            if not source_type:
                continue
            if source_type == exclude_source_type and subscription.id == exclude_source_id:
                continue
            if subscription.plan_type == PlanType.EMI:
                position = crs._advance_emi_position(subscription)
                due = _money(position.get("due_amount"))
                overdue = _money(position.get("overdue_amount"))
                next_due_date = position.get("next_due_date")
            else:
                from subscriptions.services.rent_lease_collection_workflow_service import (
                    rent_lease_receivable_position,
                )

                position = rent_lease_receivable_position(subscription)
                due = _money(position.get("due_amount"))
                overdue = _money(position.get("overdue_amount"))
                next_due_date = position.get("next_due_date")
            if due <= MONEY_ZERO and overdue <= MONEY_ZERO:
                continue
            rows.append(
                {
                    "source_type": source_type,
                    "source_id": subscription.id,
                    "reference": subscription.subscription_number or f"SUB-{subscription.id}",
                    "due_amount": _s(due),
                    "overdue_amount": _s(overdue),
                    "next_due_date": next_due_date,
                    "status": subscription.status,
                }
            )

        try:
            from billing.models import DirectSale

            for sale in DirectSale.objects.filter(customer_id=customer_id).order_by("id"):
                if exclude_source_type == ContractReferenceType.DIRECT_SALE and sale.id == exclude_source_id:
                    continue
                outstanding = _money(getattr(sale, "balance_total", 0))
                if outstanding <= MONEY_ZERO:
                    continue
                rows.append(
                    {
                        "source_type": ContractReferenceType.DIRECT_SALE,
                        "source_id": sale.id,
                        "reference": sale.sale_no or f"SALE-{sale.id}",
                        "due_amount": _s(outstanding),
                        "overdue_amount": _s(MONEY_ZERO),
                        "next_due_date": None,
                        "status": sale.status,
                    }
                )
        except Exception:
            pass

    phone_digits = "".join(ch for ch in (customer_phone or "") if ch.isdigit())
    if phone_digits:
        try:
            from accounting.models import CustomerOpeningOutstanding

            legacy_rows = CustomerOpeningOutstanding.objects.filter(
                is_settled=False, phone__icontains=phone_digits[-10:]
            ).order_by("id")
            for legacy in legacy_rows:
                if exclude_source_type == "LEGACY_RECEIVABLE" and legacy.id == exclude_source_id:
                    continue
                rows.append(
                    {
                        "source_type": "LEGACY_RECEIVABLE",
                        "source_id": legacy.id,
                        "reference": f"LEGACY-{legacy.id}",
                        "due_amount": _s(legacy.outstanding_amount),
                        "overdue_amount": _s(legacy.outstanding_amount),
                        "next_due_date": legacy.entry_date,
                        "status": "OPEN",
                    }
                )
        except Exception:
            pass
    return rows


def build_receivable_workbench(*, source_type: str, source_id: int) -> dict[str, object]:
    source_type = (source_type or "").strip().upper()

    if source_type == ContractReferenceType.ADVANCE_EMI:
        subscription = (
            Subscription.objects.select_related("customer", "product")
            .filter(pk=source_id, plan_type=PlanType.EMI)
            .first()
        )
        if not subscription:
            raise ValidationError({"source_id": "Advance EMI subscription was not found."})
        payload = _advance_emi_workbench(subscription)
    elif source_type in {ContractReferenceType.RENT, ContractReferenceType.LEASE}:
        plan_type = PlanType.RENT if source_type == ContractReferenceType.RENT else PlanType.LEASE
        subscription = (
            Subscription.objects.select_related("customer", "product")
            .filter(pk=source_id, plan_type=plan_type)
            .first()
        )
        if not subscription:
            raise ValidationError({"source_id": "Rent/lease subscription was not found."})
        payload = _rent_lease_workbench(subscription)
    elif source_type == ContractReferenceType.DIRECT_SALE:
        payload = _direct_sale_workbench(source_id)
    elif source_type == "LEGACY_RECEIVABLE":
        payload = _legacy_workbench(source_id)
    else:
        raise ValidationError({"source_type": f"Unsupported source type: {source_type}."})

    customer = payload.get("customer") or {}
    payload["other_dues"] = _other_customer_dues(
        customer_id=customer.get("id"),
        customer_phone=customer.get("phone") or "",
        exclude_source_type=source_type,
        exclude_source_id=source_id,
    )
    payload["source_type"] = source_type
    payload["source_id"] = source_id
    return payload
