from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.db import connection, transaction
from django.db.models import Sum
from django.utils import timezone

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    JournalEntry,
    JournalEntryType,
)
from accounting.services.document_sequence_service import (
    DocumentNumberingSetupError,
    DocumentType,
    validate_document_numbering_ready,
)
from accounting.services.journal_posting_service import create_journal_entry, post_journal_entry
from accounting.services.period_service import get_active_financial_year, resolve_accounting_period
from subscriptions.models import (
    RentLeaseBillingDemand,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionType,
    q2,
)
from subscriptions.services.rent_lease_accounting_readiness_service import (
    get_rent_lease_accounting_readiness,
)
from subscriptions.services.rent_lease_finance_sync_service import get_active_account_mapping
from subscriptions.services.rent_lease_posting_bridge_config_service import (
    get_rent_lease_posting_bridge_state,
)


class RentLeasePostingError(ValidationError):
    pass


def _money(value: Any) -> Decimal:
    return q2(Decimal(str(value or "0.00")))


def _mapping(lock: bool = False) -> dict[str, Any] | None:
    mapping = get_active_account_mapping(auto_create=True)
    if mapping is None:
        return None
    if lock:
        mapping_lock = (
            mapping.__class__.objects.select_for_update(of=("self",))
            .filter(pk=mapping.pk)
            .first()
        )
        if mapping_lock is None:
            return None
        mapping = (
            mapping.__class__.objects.select_related(
                "monthly_income_account",
                "deposit_liability_account",
                "deposit_refund_account",
                "damage_recovery_income_account",
                "settlement_finance_account",
                "settlement_finance_account__chart_account",
            )
            .get(pk=mapping_lock.pk)
        )
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, monthly_income_account_id, deposit_liability_account_id,
                   deposit_refund_account_id, damage_recovery_income_account_id,
                   settlement_finance_account_id, customer_advance_liability_account_id,
                   rent_income_account_id, lease_income_account_id
            FROM accounting_rent_lease_account_mappings
            WHERE id = %s
            """,
            [mapping.id],
        )
        row = cursor.fetchone()
        if not row:
            return None
        return dict(zip([col[0] for col in cursor.description], row))


def _account(account_id: int | None, field: str, account_type: str) -> ChartOfAccount:
    if not account_id:
        raise RentLeasePostingError({field: f"{field} is not configured."})
    account = ChartOfAccount.objects.filter(pk=account_id, is_active=True).first()
    if not account:
        raise RentLeasePostingError({field: "Configured account is missing or inactive."})
    if account.account_type != account_type:
        raise RentLeasePostingError({field: f"Account must be {account_type}."})
    return account


def _settlement_account(mapping: dict[str, Any], override_id: int | None = None) -> ChartOfAccount:
    finance_id = override_id or mapping.get("settlement_finance_account_id")
    if not finance_id:
        raise RentLeasePostingError({"settlement_finance_account": "Settlement finance account is required before posting."})
    finance = FinanceAccount.objects.select_related("chart_account").filter(pk=finance_id, is_active=True).first()
    if not finance:
        raise RentLeasePostingError({"settlement_finance_account": "Settlement finance account is missing or inactive."})
    if finance.chart_account.account_type != ChartOfAccountType.ASSET:
        raise RentLeasePostingError({"settlement_finance_account": "Settlement finance account must map to ASSET."})
    return finance.chart_account


def _account_json(account: ChartOfAccount) -> dict[str, Any]:
    return {"id": account.id, "code": account.code, "name": account.name, "account_type": account.account_type}


def _line(account: ChartOfAccount, description: str, *, debit: Decimal = Decimal("0.00"), credit: Decimal = Decimal("0.00")) -> dict[str, Any]:
    return {"account": _account_json(account), "description": description, "debit": f"{q2(debit):.2f}", "credit": f"{q2(credit):.2f}"}


def _date_value(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            return datetime.fromisoformat(cleaned.replace("Z", "+00:00")).date()
        except ValueError:
            try:
                return date.fromisoformat(cleaned[:10])
            except ValueError:
                return None
    return None


def _posting_date_for_demand(demand: RentLeaseBillingDemand) -> date:
    return (
        _date_value(demand.due_date)
        or _date_value(demand.billing_period_end)
        or _date_value(demand.billing_period_start)
        or timezone.localdate()
    )


def _posting_date_for_customer_advance(record: dict[str, Any]) -> date:
    return _date_value(record.get("created_at")) or timezone.localdate()


def _period_context(posting_date: date) -> dict[str, Any]:
    context: dict[str, Any] = {
        "posting_date": posting_date.isoformat(),
        "financial_year": None,
        "financial_year_code": None,
        "accounting_period": None,
        "accounting_period_code": None,
        "accounting_period_name": None,
        "accounting_period_status": None,
        "period_postable": False,
        "period_blocked_reason": "",
    }

    active_financial_year = get_active_financial_year()
    if active_financial_year is None:
        context["period_blocked_reason"] = "No active financial year is configured for accounting posting."
        return context

    context.update(
        {
            "financial_year": active_financial_year.id,
            "financial_year_code": active_financial_year.code,
        }
    )

    try:
        period = resolve_accounting_period(posting_date)
    except ValueError as exc:
        context["period_blocked_reason"] = str(exc)
        return context

    context.update(
        {
            "accounting_period": period.id,
            "accounting_period_code": period.code,
            "accounting_period_name": period.name or period.label,
            "accounting_period_status": period.status,
        }
    )

    try:
        validate_document_numbering_ready(DocumentType.JOURNAL_ENTRY, posting_date)
    except DocumentNumberingSetupError as exc:
        context["period_blocked_reason"] = str(exc)
        return context

    context["period_postable"] = True
    return context


def _snapshot(mapping: dict[str, Any] | None) -> dict[str, Any]:
    if not mapping:
        return {"mapping_configured": False}
    return {"mapping_configured": True, "mapping_id": mapping["id"], "ids": dict(mapping)}


def _preview(source_model: str, source_id: int | str, source_reference: str, event_type: str, amount: Decimal, lines: list[dict[str, Any]], mapping: dict[str, Any], *, posting_date: date, postable: bool = True, blocked_reason: str = "") -> dict[str, Any]:
    debit_total = sum(_money(line["debit"]) for line in lines)
    credit_total = sum(_money(line["credit"]) for line in lines)
    if debit_total != credit_total:
        raise RentLeasePostingError({"lines": "Posting preview is not balanced."})
    period_context = _period_context(posting_date)
    period_blocked_reason = str(period_context.get("period_blocked_reason") or "")
    resolved_postable = bool(postable and period_context["period_postable"])
    resolved_blocked_reason = blocked_reason or (period_blocked_reason if not period_context["period_postable"] else "")
    return {
        "source_model": source_model,
        "source_id": str(source_id),
        "source_reference": source_reference,
        "event_type": event_type,
        "amount": f"{q2(amount):.2f}",
        **period_context,
        "status": "POSTABLE" if resolved_postable else "BLOCKED",
        "postable": resolved_postable,
        "blocked_reason": resolved_blocked_reason,
        "idempotency_key": f"{source_model}:{source_id}:{event_type}",
        "debit_total": f"{debit_total:.2f}",
        "credit_total": f"{credit_total:.2f}",
        "lines": lines,
        "mapping_snapshot": _snapshot(mapping),
        "duplicate_posting_protection": "Execution is idempotent by source model, source id, and event type.",
    }


def _store_preview(payload: dict[str, Any], status: str = "PREVIEWED", reason: str = "") -> None:
    if connection.vendor == "sqlite":
        sql = """
            INSERT INTO accounting_operational_accounting_postings
                (source_model, source_id, event_type, idempotency_key, amount, status,
                 mapping_snapshot, preview_payload, failure_reason, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (idempotency_key) DO UPDATE SET
                amount = EXCLUDED.amount,
                status = CASE WHEN accounting_operational_accounting_postings.status = 'POSTED' THEN 'POSTED' ELSE EXCLUDED.status END,
                mapping_snapshot = EXCLUDED.mapping_snapshot,
                preview_payload = EXCLUDED.preview_payload,
                failure_reason = EXCLUDED.failure_reason,
                updated_at = CURRENT_TIMESTAMP
            """
    else:
        sql = """
            INSERT INTO accounting_operational_accounting_postings
                (source_model, source_id, event_type, idempotency_key, amount, status,
                 mapping_snapshot, preview_payload, failure_reason, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, NOW(), NOW())
            ON CONFLICT (idempotency_key) DO UPDATE SET
                amount = EXCLUDED.amount,
                status = CASE WHEN accounting_operational_accounting_postings.status = 'POSTED' THEN 'POSTED' ELSE EXCLUDED.status END,
                mapping_snapshot = EXCLUDED.mapping_snapshot,
                preview_payload = EXCLUDED.preview_payload,
                failure_reason = EXCLUDED.failure_reason,
                updated_at = NOW()
            """
    with connection.cursor() as cursor:
        cursor.execute(
            sql,
            [payload["source_model"], payload["source_id"], payload["event_type"], payload["idempotency_key"], payload["amount"], status, json.dumps(payload["mapping_snapshot"]), json.dumps(payload), reason],
        )


def _posting(idempotency_key: str) -> dict[str, Any] | None:
    lock_clause = "" if connection.vendor == "sqlite" else "FOR UPDATE"
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT id, status, journal_entry_id, preview_payload, posted_at
            FROM accounting_operational_accounting_postings
            WHERE idempotency_key = %s
            {lock_clause}
            """,
            [idempotency_key],
        )
        row = cursor.fetchone()
        if not row:
            return None
        preview_payload = row[3] or {}
        if isinstance(preview_payload, str):
            try:
                preview_payload = json.loads(preview_payload)
            except json.JSONDecodeError:
                preview_payload = {}
        posted_at = row[4]
        return {
            "id": row[0],
            "status": row[1],
            "journal_entry_id": row[2],
            "preview_payload": preview_payload,
            "posted_at": posted_at.isoformat() if hasattr(posted_at, "isoformat") else posted_at,
        }


def _create_journal(payload: dict[str, Any], actor=None) -> JournalEntry:
    journal = create_journal_entry(
        entry_date=_date_value(payload.get("posting_date")) or timezone.localdate(),
        entry_type=JournalEntryType.SYSTEM_BRIDGE,
        memo=f"{payload['event_type']} bridge posting for {payload['source_reference']}",
        source_model=payload["source_model"],
        source_id=payload["source_id"],
        source_type=payload["event_type"],
        source_reference=payload["source_reference"],
        lines=[
            {
                "chart_account": ChartOfAccount.objects.get(pk=line["account"]["id"]),
                "description": line["description"],
                "debit_amount": _money(line["debit"]),
                "credit_amount": _money(line["credit"]),
            }
            for line in payload["lines"]
        ],
    )
    posted_journal, _ = post_journal_entry(journal_entry_id=journal.id, posted_by=actor)
    return posted_journal


def _execute(payload: dict[str, Any], actor=None) -> dict[str, Any]:
    readiness = get_rent_lease_accounting_readiness(auto_create=True)
    bridge_state = get_rent_lease_posting_bridge_state(readiness=readiness)
    if not bridge_state["posting_bridge_ready"]:
        reason = bridge_state["blocked_reason"] or "Rent/lease posting bridge execution is blocked."
        blocked_payload = {**payload, "status": "BLOCKED", "postable": False, "blocked_reason": reason}
        _store_preview(blocked_payload, "BLOCKED", reason)
        return {
            "detail": reason,
            "status": "BLOCKED",
            "posting_id": None,
            "journal_entry_id": None,
            "journal_entry_no": None,
            "posted_at": None,
            "preview": blocked_payload,
            "readiness": readiness,
        }
    if not payload.get("postable"):
        _store_preview(payload, "BLOCKED", payload.get("blocked_reason") or "Blocked.")
        raise RentLeasePostingError({"detail": payload.get("blocked_reason") or "Posting is blocked."})
    existing = _posting(payload["idempotency_key"])
    if existing and existing["status"] == "POSTED" and existing["journal_entry_id"]:
        return {"detail": "Posting already exists; duplicate execution returned existing journal.", "status": "POSTED", "posting_id": existing["id"], "journal_entry_id": existing["journal_entry_id"], "posted_at": existing["posted_at"], "preview": existing["preview_payload"] or payload}
    journal = _create_journal(payload, actor=actor)
    _store_preview(payload)
    if connection.vendor == "sqlite":
        update_sql = """
            UPDATE accounting_operational_accounting_postings
            SET status = 'POSTED', journal_entry_id = %s, posted_by_id = %s,
                posted_at = COALESCE(posted_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
            WHERE idempotency_key = %s
            """
    else:
        update_sql = """
            UPDATE accounting_operational_accounting_postings
            SET status = 'POSTED', journal_entry_id = %s, posted_by_id = %s,
                posted_at = COALESCE(posted_at, NOW()), updated_at = NOW()
            WHERE idempotency_key = %s
            """
    with connection.cursor() as cursor:
        cursor.execute(
            update_sql,
            [journal.id, getattr(actor, "id", None), payload["idempotency_key"]],
        )
    posted = _posting(payload["idempotency_key"])
    return {"detail": "Posting executed.", "status": "POSTED", "posting_id": posted["id"] if posted else None, "journal_entry_id": journal.id, "journal_entry_no": journal.entry_no, "posted_at": journal.posted_at.isoformat() if journal.posted_at else None, "preview": payload}


def _demand(demand_id: int, lock: bool = False) -> RentLeaseBillingDemand:
    qs = RentLeaseBillingDemand.objects.select_related("subscription", "subscription__customer", "subscription__product")
    if lock:
        qs = qs.select_for_update()
    demand = qs.filter(pk=demand_id).first()
    if not demand:
        raise RentLeasePostingError({"detail": "Rent/lease demand not found."})
    return demand
def preview_security_deposit_collection_posting(demand_id: int, actor=None) -> dict[str, Any]:
    demand = _demand(demand_id)
    if demand.demand_type != RentLeaseDemandType.SECURITY_DEPOSIT:
        raise RentLeasePostingError({"detail": "Demand is not a security deposit demand."})
    amount = _money(demand.collected_amount)
    if amount <= 0:
        raise RentLeasePostingError({"detail": "Security deposit must have collected source amount before posting."})
    mapping = _mapping(False)
    if not mapping:
        raise RentLeasePostingError({"detail": "No active rent/lease account mapping configured."})
    settlement = _settlement_account(mapping)
    liability = _account(mapping.get("deposit_liability_account_id"), "deposit_liability_account", ChartOfAccountType.LIABILITY)
    return _preview("RentLeaseBillingDemand", demand.id, demand.reference_key, "SECURITY_DEPOSIT_COLLECTION", amount, [_line(settlement, "Settlement asset from deposit source collection", debit=amount), _line(liability, "Security deposit liability", credit=amount)], mapping, posting_date=_posting_date_for_demand(demand))


def execute_security_deposit_collection_posting(demand_id: int, actor=None) -> dict[str, Any]:
    with transaction.atomic():
        _demand(demand_id, True)
        _mapping(True)
        return _execute(preview_security_deposit_collection_posting(demand_id, actor), actor)


def preview_rent_lease_monthly_posting(source_id: int, actor=None) -> dict[str, Any]:
    demand = _demand(source_id)
    if demand.demand_type not in {RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY}:
        raise RentLeasePostingError({"detail": "Demand is not a rent/lease monthly demand."})
    amount = _money(demand.collected_amount)
    if amount <= 0 or demand.status not in {RentLeaseDemandStatus.PAID, RentLeaseDemandStatus.PARTIAL}:
        raise RentLeasePostingError({"detail": "Monthly demand must have collected source amount before posting."})
    mapping = _mapping(False)
    if not mapping:
        raise RentLeasePostingError({"detail": "No active rent/lease account mapping configured."})
    settlement = _settlement_account(mapping)
    if demand.demand_type == RentLeaseDemandType.RENT_MONTHLY:
        income = _account(mapping.get("rent_income_account_id") or mapping.get("monthly_income_account_id"), "rent_income_account", ChartOfAccountType.INCOME)
        event = "RENT_MONTHLY_COLLECTION"
    else:
        income = _account(mapping.get("lease_income_account_id") or mapping.get("monthly_income_account_id"), "lease_income_account", ChartOfAccountType.INCOME)
        event = "LEASE_MONTHLY_COLLECTION"
    return _preview("RentLeaseBillingDemand", demand.id, demand.reference_key, event, amount, [_line(settlement, "Settlement asset from rent/lease source collection", debit=amount), _line(income, "Rent/lease monthly income", credit=amount)], mapping, posting_date=_posting_date_for_demand(demand))


def execute_rent_lease_monthly_posting(source_id: int, actor=None) -> dict[str, Any]:
    with transaction.atomic():
        _demand(source_id, True)
        _mapping(True)
        return _execute(preview_rent_lease_monthly_posting(source_id, actor), actor)


def preview_security_deposit_refund_posting(demand_id: int, actor=None) -> dict[str, Any]:
    demand = _demand(demand_id)
    amount = _money(RentLeaseDepositTransaction.objects.filter(demand=demand, transaction_type=RentLeaseDepositTransactionType.REFUNDED).aggregate(total=Sum("amount"))["total"])
    if amount <= 0:
        raise RentLeasePostingError({"detail": "No refunded source amount exists for this deposit."})
    mapping = _mapping(False)
    if not mapping:
        raise RentLeasePostingError({"detail": "No active rent/lease account mapping configured."})
    liability = _account(mapping.get("deposit_liability_account_id"), "deposit_liability_account", ChartOfAccountType.LIABILITY)
    settlement = _settlement_account(mapping)
    return _preview("RentLeaseBillingDemand", demand.id, demand.reference_key, "SECURITY_DEPOSIT_REFUND", amount, [_line(liability, "Reduce security deposit liability", debit=amount), _line(settlement, "Settlement asset paid out for deposit refund", credit=amount)], mapping, posting_date=_posting_date_for_demand(demand))


def execute_security_deposit_refund_posting(demand_id: int, actor=None) -> dict[str, Any]:
    with transaction.atomic():
        _demand(demand_id, True)
        _mapping(True)
        return _execute(preview_security_deposit_refund_posting(demand_id, actor), actor)


def preview_damage_recovery_posting(demand_id: int, actor=None) -> dict[str, Any]:
    demand = _demand(demand_id)
    amount = _money(demand.deducted_amount)
    if amount <= 0:
        raise RentLeasePostingError({"detail": "No damage deduction source amount exists for this deposit."})
    mapping = _mapping(False)
    if not mapping:
        raise RentLeasePostingError({"detail": "No active rent/lease account mapping configured."})
    liability = _account(mapping.get("deposit_liability_account_id"), "deposit_liability_account", ChartOfAccountType.LIABILITY)
    income = _account(mapping.get("damage_recovery_income_account_id"), "damage_recovery_income_account", ChartOfAccountType.INCOME)
    return _preview("RentLeaseBillingDemand", demand.id, demand.reference_key, "SECURITY_DEPOSIT_DAMAGE_RECOVERY", amount, [_line(liability, "Reduce security deposit liability for damage deduction", debit=amount), _line(income, "Damage recovery income", credit=amount)], mapping, posting_date=_posting_date_for_demand(demand))


def execute_damage_recovery_posting(demand_id: int, actor=None) -> dict[str, Any]:
    with transaction.atomic():
        _demand(demand_id, True)
        _mapping(True)
        return _execute(preview_damage_recovery_posting(demand_id, actor), actor)


def get_rent_lease_accounting_summary() -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT status, COUNT(*) FROM accounting_operational_accounting_postings GROUP BY status")
        bridge = {row[0].lower(): row[1] for row in cursor.fetchall()}
    return {
        "readiness": get_rent_lease_accounting_readiness(),
        "demand_records": RentLeaseBillingDemand.objects.count(),
        "monthly_collected_sources": RentLeaseBillingDemand.objects.filter(demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY], collected_amount__gt=0).count(),
        "deposit_collected_sources": RentLeaseBillingDemand.objects.filter(demand_type=RentLeaseDemandType.SECURITY_DEPOSIT, collected_amount__gt=0).count(),
        "posting_bridge": bridge,
        "not_used": {"lucky_ids": True, "draws": True},
    }


def list_customer_advances() -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT id, customer_id, amount, transaction_type, status, payment_method, finance_account_id, reference_no, notes, created_at FROM accounting_customer_advance_source_records ORDER BY created_at DESC, id DESC LIMIT 200")
        rows = [dict(zip([col[0] for col in cursor.description], row)) for row in cursor.fetchall()]
    for row in rows:
        row["amount"] = f"{_money(row['amount']):.2f}"
        if row.get("created_at"):
            row["created_at"] = row["created_at"].isoformat()
    return {"count": len(rows), "results": rows}


def create_customer_advance_source_record(*, customer_id=None, amount=None, transaction_type="COLLECTION", payment_method="", finance_account_id=None, reference_no="", notes="", created_by=None) -> dict[str, Any]:
    amount_q = _money(amount)
    if amount_q <= 0:
        raise RentLeasePostingError({"amount": "Advance amount must be greater than zero."})
    tx_type = (transaction_type or "COLLECTION").strip().upper()
    if tx_type not in {"COLLECTION", "REFUND", "ADJUSTMENT"}:
        raise RentLeasePostingError({"transaction_type": "Unsupported customer advance transaction type."})
    status = "REFUNDED" if tx_type == "REFUND" else "COLLECTED"
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO accounting_customer_advance_source_records
                (customer_id, amount, transaction_type, status, payment_method, finance_account_id, reference_no, notes, created_by_id, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            RETURNING id
            """,
            [customer_id, f"{amount_q:.2f}", tx_type, status, (payment_method or "").strip().upper(), finance_account_id, (reference_no or "").strip().upper() or None, (notes or "").strip(), getattr(created_by, "id", None)],
        )
        record_id = cursor.fetchone()[0]
    return get_customer_advance(record_id)


def get_customer_advance(record_id: int) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT id, customer_id, amount, transaction_type, status, payment_method, finance_account_id, reference_no, notes, created_at FROM accounting_customer_advance_source_records WHERE id = %s", [record_id])
        row = cursor.fetchone()
        if not row:
            raise RentLeasePostingError({"detail": "Customer advance record not found."})
        data = dict(zip([col[0] for col in cursor.description], row))
    data["amount"] = f"{_money(data['amount']):.2f}"
    if data.get("created_at"):
        data["created_at"] = data["created_at"].isoformat()
    return data


def _advance_for_update(record_id: int) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT id FROM accounting_customer_advance_source_records WHERE id = %s FOR UPDATE", [record_id])
        if not cursor.fetchone():
            raise RentLeasePostingError({"detail": "Customer advance record not found."})
    return get_customer_advance(record_id)


def preview_customer_advance_posting(record_id: int, actor=None) -> dict[str, Any]:
    record = get_customer_advance(record_id)
    if record["transaction_type"] == "ADJUSTMENT":
        mapping = _mapping(False) or {"id": None}
        return _preview("CustomerAdvanceSourceRecord", record["id"], record.get("reference_no") or f"ADV-{record['id']}", "CUSTOMER_ADVANCE_ADJUSTMENT_BLOCKED", _money(record["amount"]), [], mapping, posting_date=_posting_date_for_customer_advance(record), postable=False, blocked_reason="Customer advance adjustment is blocked until settlement allocation support exists.")
    if record["transaction_type"] == "REFUND":
        return preview_customer_advance_refund_posting(record_id, actor)
    mapping = _mapping(False)
    if not mapping:
        raise RentLeasePostingError({"detail": "No active rent/lease account mapping configured."})
    amount = _money(record["amount"])
    settlement = _settlement_account(mapping, record.get("finance_account_id"))
    liability = _account(mapping.get("customer_advance_liability_account_id"), "customer_advance_liability_account", ChartOfAccountType.LIABILITY)
    return _preview("CustomerAdvanceSourceRecord", record["id"], record.get("reference_no") or f"ADV-{record['id']}", "CUSTOMER_ADVANCE_COLLECTION", amount, [_line(settlement, "Settlement asset from customer advance source", debit=amount), _line(liability, "Customer advance liability", credit=amount)], mapping, posting_date=_posting_date_for_customer_advance(record))


def execute_customer_advance_posting(record_id: int, actor=None) -> dict[str, Any]:
    with transaction.atomic():
        _advance_for_update(record_id)
        _mapping(True)
        return _execute(preview_customer_advance_posting(record_id, actor), actor)


def preview_customer_advance_refund_posting(record_id: int, actor=None) -> dict[str, Any]:
    record = get_customer_advance(record_id)
    if record["transaction_type"] != "REFUND":
        raise RentLeasePostingError({"detail": "Customer advance record is not a refund."})
    mapping = _mapping(False)
    if not mapping:
        raise RentLeasePostingError({"detail": "No active rent/lease account mapping configured."})
    amount = _money(record["amount"])
    liability = _account(mapping.get("customer_advance_liability_account_id"), "customer_advance_liability_account", ChartOfAccountType.LIABILITY)
    settlement = _settlement_account(mapping, record.get("finance_account_id"))
    return _preview("CustomerAdvanceSourceRecord", record["id"], record.get("reference_no") or f"ADV-{record['id']}", "CUSTOMER_ADVANCE_REFUND", amount, [_line(liability, "Reduce customer advance liability", debit=amount), _line(settlement, "Settlement asset paid out for customer advance refund", credit=amount)], mapping, posting_date=_posting_date_for_customer_advance(record))


def execute_customer_advance_refund_posting(record_id: int, actor=None) -> dict[str, Any]:
    with transaction.atomic():
        _advance_for_update(record_id)
        _mapping(True)
        return _execute(preview_customer_advance_refund_posting(record_id, actor), actor)
