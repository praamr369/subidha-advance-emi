from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from deliveries.models import (
    MONEY_ZERO,
    TransportFareEntry,
    TransportFareSettlementStatus,
    TransportFareSourceType,
)

TRANSPORT_FIELD_NAMES = (
    "van_number",
    "transport_boy_name",
    "transport_boy_phone",
    "van_fare",
    "transport_notes",
)


def _money(value: Any) -> Decimal:
    if value in (None, ""):
        return MONEY_ZERO
    parsed = Decimal(str(value)).quantize(Decimal("0.01"))
    if parsed < MONEY_ZERO:
        raise ValueError("Van fare cannot be negative.")
    return parsed


def to_fare_decimal(value: Any) -> Decimal:
    return _money(value)


def has_transport_details(
    *,
    van_number: str = "",
    transport_boy_name: str = "",
    transport_boy_phone: str = "",
    van_fare: Decimal | str | None = None,
) -> bool:
    return bool(
        (van_number or "").strip()
        or (transport_boy_name or "").strip()
        or (transport_boy_phone or "").strip()
        or _money(van_fare) > MONEY_ZERO
    )


def extract_transport_kwargs(data: dict[str, Any] | None) -> dict[str, Any]:
    """Extract normalized transport fields present in an input payload dict."""
    if not isinstance(data, dict):
        return {}
    out: dict[str, Any] = {}
    if "van_number" in data:
        out["van_number"] = str(data.get("van_number") or "").strip().upper()
    if "transport_boy_name" in data:
        out["transport_boy_name"] = str(data.get("transport_boy_name") or "").strip()
    if "transport_boy_phone" in data:
        out["transport_boy_phone"] = str(data.get("transport_boy_phone") or "").strip()
    if "van_fare" in data:
        out["van_fare"] = _money(data.get("van_fare"))
    if "transport_notes" in data:
        out["transport_notes"] = str(data.get("transport_notes") or "").strip()
    return out


def apply_transport_fields(
    instance: Any,
    data: dict[str, Any] | None = None,
    **kwargs: Any,
) -> list[str]:
    """Apply present transport fields onto a model instance and return modified field names."""
    merged: dict[str, Any] = {}
    if isinstance(data, dict):
        merged.update({k: v for k, v in data.items() if k in TRANSPORT_FIELD_NAMES and v is not None})
    for k, v in kwargs.items():
        if k in TRANSPORT_FIELD_NAMES and v is not None:
            merged[k] = v
    extracted = extract_transport_kwargs(merged)
    changed: list[str] = []
    for field, val in extracted.items():
        if getattr(instance, field, None) != val:
            setattr(instance, field, val)
            changed.append(field)
    return changed


def serialize_transport_fields(instance: Any) -> dict[str, Any]:
    return {
        "van_number": (getattr(instance, "van_number", "") or "").strip(),
        "transport_boy_name": (getattr(instance, "transport_boy_name", "") or "").strip(),
        "transport_boy_phone": (getattr(instance, "transport_boy_phone", "") or "").strip(),
        "van_fare": f"{_money(getattr(instance, 'van_fare', MONEY_ZERO)):.2f}",
        "transport_notes": (getattr(instance, "transport_notes", "") or "").strip(),
    }


def _resolve_source_metadata(*, source_type: str, source_instance: Any) -> dict[str, Any]:
    today = timezone.localdate()
    if source_type == TransportFareSourceType.DIRECT_SALE:
        return {
            "lookup": {"direct_sale": source_instance, "service_case__isnull": True},
            "fk_kwargs": {"direct_sale": source_instance},
            "reference_no": getattr(source_instance, "sale_no", None) or f"SALE-{source_instance.id}",
            "customer_name": (
                getattr(source_instance, "customer_name_snapshot", "")
                or getattr(getattr(source_instance, "customer", None), "name", "")
                or ""
            ),
            "entry_date": getattr(source_instance, "sale_date", None) or today,
            "branch": getattr(source_instance, "branch", None),
        }
    if source_type in {
        TransportFareSourceType.EMI_CONTRACT,
        TransportFareSourceType.RENT_CONTRACT,
        TransportFareSourceType.LEASE_CONTRACT,
    }:
        return {
            "lookup": {"subscription": source_instance, "subscription_delivery__isnull": True},
            "fk_kwargs": {"subscription": source_instance},
            "reference_no": (
                getattr(source_instance, "subscription_number", None)
                or getattr(source_instance, "contract_reference", None)
                or f"SUB-{source_instance.id}"
            ),
            "customer_name": getattr(getattr(source_instance, "customer", None), "name", "") or "",
            "entry_date": getattr(source_instance, "start_date", None) or today,
            "branch": getattr(source_instance, "branch", None),
        }
    if source_type == TransportFareSourceType.SUBSCRIPTION_DELIVERY:
        sub = getattr(source_instance, "subscription", None)
        return {
            "lookup": {"subscription_delivery": source_instance},
            "fk_kwargs": {
                "subscription_delivery": source_instance,
                "subscription": sub,
            },
            "reference_no": getattr(source_instance, "delivery_reference", None) or f"DLV-{source_instance.id}",
            "customer_name": (
                getattr(source_instance, "receiver_name", "")
                or getattr(getattr(sub, "customer", None), "name", "")
                or ""
            ),
            "entry_date": getattr(source_instance, "scheduled_date", None) or today,
            "branch": getattr(sub, "branch", None) if sub else None,
        }
    if source_type == TransportFareSourceType.DIRECT_SALE_DELIVERY:
        sale = getattr(source_instance, "direct_sale", None)
        due_dt = getattr(source_instance, "service_due_at", None)
        return {
            "lookup": {"service_case": source_instance},
            "fk_kwargs": {
                "service_case": source_instance,
                "direct_sale": sale,
            },
            "reference_no": (
                (getattr(sale, "delivery_reference", "") if sale else "")
                or getattr(source_instance, "case_no", None)
                or f"CASE-{source_instance.id}"
            ),
            "customer_name": (
                getattr(source_instance, "reporter_name_snapshot", "")
                or (getattr(sale, "customer_name_snapshot", "") if sale else "")
                or ""
            ),
            "entry_date": due_dt.date() if due_dt else (getattr(sale, "sale_date", None) if sale else today) or today,
            "branch": getattr(sale, "branch", None) if sale else None,
        }
    return {
        "lookup": {},
        "fk_kwargs": {},
        "reference_no": "",
        "customer_name": "",
        "entry_date": today,
        "branch": None,
    }


def subscription_transport_source_type(plan_type: str | None) -> str:
    token = (plan_type or "").strip().upper()
    if token == "RENT":
        return TransportFareSourceType.RENT_CONTRACT
    if token == "LEASE":
        return TransportFareSourceType.LEASE_CONTRACT
    return TransportFareSourceType.EMI_CONTRACT


@transaction.atomic
def sync_transport_fare_for_source(
    *,
    source_type: str,
    source_instance: Any,
    performed_by=None,
) -> TransportFareEntry | None:
    """Upsert an off-ledger TransportFareEntry for the given source document.

    Strictly transport-only: never posts to JournalEntry, FinanceAccount,
    BillingInvoice, FinancialLedger, or company cash/bank accounts.
    """
    if source_instance is None or getattr(source_instance, "pk", None) is None:
        return None

    van_number = (getattr(source_instance, "van_number", "") or "").strip().upper()
    transport_boy_name = (getattr(source_instance, "transport_boy_name", "") or "").strip()
    transport_boy_phone = (getattr(source_instance, "transport_boy_phone", "") or "").strip()
    van_fare = _money(getattr(source_instance, "van_fare", MONEY_ZERO))
    transport_notes = (getattr(source_instance, "transport_notes", "") or "").strip()

    if not has_transport_details(
        van_number=van_number,
        transport_boy_name=transport_boy_name,
        transport_boy_phone=transport_boy_phone,
        van_fare=van_fare,
    ):
        return None

    meta = _resolve_source_metadata(source_type=source_type, source_instance=source_instance)
    lookup = meta["lookup"]
    existing = (
        TransportFareEntry.objects.filter(**lookup).order_by("-id").first()
        if lookup
        else None
    )

    if existing is not None:
        existing.source_type = source_type
        existing.reference_no = meta["reference_no"]
        existing.customer_name = meta["customer_name"]
        existing.entry_date = meta["entry_date"]
        existing.branch = meta["branch"] or existing.branch
        existing.van_number = van_number
        existing.transport_boy_name = transport_boy_name
        existing.transport_boy_phone = transport_boy_phone
        existing.van_fare = van_fare
        existing.notes = transport_notes
        if performed_by is not None:
            existing.updated_by = performed_by
        existing.save()
        return existing

    return TransportFareEntry.objects.create(
        source_type=source_type,
        reference_no=meta["reference_no"],
        customer_name=meta["customer_name"],
        entry_date=meta["entry_date"],
        branch=meta["branch"],
        van_number=van_number,
        transport_boy_name=transport_boy_name,
        transport_boy_phone=transport_boy_phone,
        van_fare=van_fare,
        notes=transport_notes,
        created_by=performed_by,
        updated_by=performed_by,
        **meta["fk_kwargs"],
    )


def filter_transport_fare_entries(
    *,
    source_type: str = "",
    settlement_status: str = "",
    date_from: str = "",
    date_to: str = "",
    q: str = "",
):
    qs = TransportFareEntry.objects.select_related(
        "branch",
        "direct_sale",
        "subscription",
        "subscription_delivery",
        "service_case",
        "created_by",
        "updated_by",
    ).order_by("-entry_date", "-created_at", "-id")

    if source_type:
        qs = qs.filter(source_type=source_type.strip().upper())
    if settlement_status:
        qs = qs.filter(settlement_status=settlement_status.strip().upper())
    if date_from:
        qs = qs.filter(entry_date__gte=date_from)
    if date_to:
        qs = qs.filter(entry_date__lte=date_to)
    if q:
        cleaned = q.strip()
        qs = qs.filter(
            Q(reference_no__icontains=cleaned)
            | Q(customer_name__icontains=cleaned)
            | Q(van_number__icontains=cleaned)
            | Q(transport_boy_name__icontains=cleaned)
            | Q(transport_boy_phone__icontains=cleaned)
            | Q(notes__icontains=cleaned)
        )
    return qs


def build_transport_finance_summary(queryset) -> dict[str, Any]:
    total_fare = queryset.aggregate(total=Sum("van_fare"))["total"] or MONEY_ZERO
    pending_fare = (
        queryset.filter(settlement_status=TransportFareSettlementStatus.PENDING)
        .aggregate(total=Sum("van_fare"))["total"]
        or MONEY_ZERO
    )
    paid_to_transport_fare = (
        queryset.filter(settlement_status=TransportFareSettlementStatus.PAID_TO_TRANSPORT)
        .aggregate(total=Sum("van_fare"))["total"]
        or MONEY_ZERO
    )
    customer_paid_direct_fare = (
        queryset.filter(settlement_status=TransportFareSettlementStatus.CUSTOMER_PAID_DIRECT)
        .aggregate(total=Sum("van_fare"))["total"]
        or MONEY_ZERO
    )
    return {
        "count": queryset.count(),
        "total_fare": f"{_money(total_fare):.2f}",
        "pending_fare": f"{_money(pending_fare):.2f}",
        "paid_to_transport_fare": f"{_money(paid_to_transport_fare):.2f}",
        "customer_paid_direct_fare": f"{_money(customer_paid_direct_fare):.2f}",
        "accounting_posted": False,
        "ledger_scope": "TRANSPORT_ONLY_OFF_ACCOUNT",
    }


@transaction.atomic
def update_transport_fare_entry(
    *,
    entry: TransportFareEntry,
    data: dict[str, Any],
    performed_by=None,
) -> TransportFareEntry:
    if "van_number" in data:
        entry.van_number = str(data.get("van_number") or "").strip().upper()
    if "transport_boy_name" in data:
        entry.transport_boy_name = str(data.get("transport_boy_name") or "").strip()
    if "transport_boy_phone" in data:
        entry.transport_boy_phone = str(data.get("transport_boy_phone") or "").strip()
    if "van_fare" in data:
        entry.van_fare = _money(data.get("van_fare"))
    if "notes" in data:
        entry.notes = str(data.get("notes") or "").strip()
    if "reference_no" in data:
        entry.reference_no = str(data.get("reference_no") or "").strip()
    if "customer_name" in data:
        entry.customer_name = str(data.get("customer_name") or "").strip()
    if "entry_date" in data and data.get("entry_date"):
        entry.entry_date = data["entry_date"]
    if "settlement_status" in data and data.get("settlement_status"):
        next_status = str(data["settlement_status"]).strip().upper()
        entry.settlement_status = next_status
        if next_status == TransportFareSettlementStatus.PAID_TO_TRANSPORT and not entry.paid_to_transport_at:
            entry.paid_to_transport_at = timezone.now()
    if performed_by is not None:
        entry.updated_by = performed_by
    entry.save()
    return entry
