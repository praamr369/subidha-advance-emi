"""Accounting sync bridge for live rent/lease billing and deposits.

The operational rent/lease demand and deposit records remain the source of truth.
This bridge creates deterministic accounting journals only after the source event has
already been accepted by the rent/lease workflow.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal

from django.db import connection, transaction
from django.utils import timezone

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
    JournalEntry,
    JournalEntryStatus,
    JournalEntryType,
    MONEY_ZERO,
    RentLeaseAccountingAccountMapping,
)
from accounting.services.journal_posting_service import create_journal_entry, post_journal_entry
from accounting.services.finance_account_readiness import finance_account_readiness
from accounting.services.system_accounts_service import ensure_system_account
from subscriptions.models import (
    AuditLog,
    PlanType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionType,
    Subscription,
    q2,
)
from subscriptions.services.audit_service import log_audit


RENT_LEASE_PREMADE_ACCOUNTS = (
    {
        "system_code": "CASH_COLLECTION",
        "code": "CASH-1000",
        "name": "Cash in Hand",
        "account_type": ChartOfAccountType.ASSET,
        "allow_manual_posting": True,
    },
    {
        "system_code": "BANK_COLLECTION",
        "code": "BANK-1010",
        "name": "Bank Account",
        "account_type": ChartOfAccountType.ASSET,
        "allow_manual_posting": True,
    },
    {
        "system_code": "UPI_COLLECTION",
        "code": "UPI-1020",
        "name": "UPI Collection Account",
        "account_type": ChartOfAccountType.ASSET,
        "allow_manual_posting": True,
    },
    {
        "system_code": "CUSTOMER_RECEIVABLE",
        "code": "AR-1000",
        "name": "Accounts Receivable",
        "account_type": ChartOfAccountType.ASSET,
        "allow_manual_posting": True,
    },
    {
        "system_code": "SECURITY_DEPOSIT_LIABILITY",
        "code": "SEC-2300",
        "name": "Rent/Lease Security Deposit Liability",
        "account_type": ChartOfAccountType.LIABILITY,
        "allow_manual_posting": True,
    },
    {
        "system_code": "CUSTOMER_ADVANCE_UNEARNED_REVENUE",
        "code": "ADV-2200",
        "name": "Customer Advances and Unapplied Receipts",
        "account_type": ChartOfAccountType.LIABILITY,
        "allow_manual_posting": True,
    },
    {
        "system_code": "RENT_INCOME",
        "code": "RENT-4000",
        "name": "Rent Income",
        "account_type": ChartOfAccountType.INCOME,
        "allow_manual_posting": True,
    },
    {
        "system_code": "LEASE_INCOME",
        "code": "LEASE-4000",
        "name": "Lease Income",
        "account_type": ChartOfAccountType.INCOME,
        "allow_manual_posting": True,
    },
    {
        "system_code": "DAMAGE_RECOVERY",
        "code": "DMG-4000",
        "name": "Damage Recovery Income",
        "account_type": ChartOfAccountType.INCOME,
        "allow_manual_posting": True,
    },
    {
        "system_code": "EMI_WAIVER_EXPENSE",
        "code": "EMI-5200",
        "name": "EMI Winner Waiver Expense",
        "account_type": ChartOfAccountType.EXPENSE,
        "allow_manual_posting": True,
    },
)


@dataclass(frozen=True)
class SyncResult:
    event: str
    status: str
    reason: str
    source_model: str
    source_id: int
    occurred_at: str
    journal_entry_id: int | None = None
    entry_no: str | None = None
    source_reference: str | None = None


def _money(value) -> Decimal:
    return q2(Decimal(str(value or MONEY_ZERO)))


def _result(
    *,
    event: str,
    status: str,
    source_model: str,
    source_id: int,
    reason: str,
    journal_entry: JournalEntry | None = None,
    source_reference: str | None = None,
) -> SyncResult:
    return SyncResult(
        event=event,
        status=status,
        reason=reason,
        source_model=source_model,
        source_id=source_id,
        occurred_at=timezone.now().isoformat(),
        journal_entry_id=journal_entry.id if journal_entry else None,
        entry_no=journal_entry.entry_no if journal_entry else None,
        source_reference=source_reference,
    )


def _chart(system_code: str) -> ChartOfAccount:
    return ChartOfAccount.objects.get(system_code=system_code, is_active=True)


def _valid_chart(account: ChartOfAccount | None, expected_type: str) -> bool:
    return bool(account and account.is_active and account.account_type == expected_type)


def _valid_settlement_account(account: FinanceAccount | None) -> bool:
    return bool(account and account.is_active and account.is_real_settlement_account and finance_account_readiness(account).selectable_for_collection)


def _locked_active_mapping_for_update() -> RentLeaseAccountingAccountMapping | None:
    mapping_lock = (
        RentLeaseAccountingAccountMapping.objects.select_for_update(of=("self",))
        .filter(is_active=True)
        .order_by("id")
        .first()
    )
    if mapping_lock is None:
        return None
    return (
        RentLeaseAccountingAccountMapping.objects.select_related(
            "monthly_income_account",
            "deposit_liability_account",
            "deposit_refund_account",
            "damage_recovery_income_account",
            "settlement_finance_account",
            "settlement_finance_account__chart_account",
        )
        .get(pk=mapping_lock.pk)
    )


@transaction.atomic
def ensure_premade_rent_lease_accounting_setup(*, performed_by=None) -> RentLeaseAccountingAccountMapping:
    """Create/claim day-one COA, finance account, and active rent/lease mapping.

    Safe to run repeatedly from setup screens, posting paths, and first-use APIs.
    Existing active mapping is preserved; missing default settlement account is filled.
    """

    for spec in RENT_LEASE_PREMADE_ACCOUNTS:
        ensure_system_account(
            system_code=spec["system_code"],
            code=spec["code"],
            name=spec["name"],
            account_type=spec["account_type"],
            allow_manual_posting=spec.get("allow_manual_posting", True),
            reactivate=True,
            performed_by=performed_by,
        )

    monthly_income_account = _chart("RENT_INCOME")
    lease_income_account = _chart("LEASE_INCOME")
    deposit_liability_account = _chart("SECURITY_DEPOSIT_LIABILITY")
    deposit_refund_account = _chart("CASH_COLLECTION")
    damage_recovery_income_account = _chart("DAMAGE_RECOVERY")
    customer_advance_liability_account = _chart("CUSTOMER_ADVANCE_UNEARNED_REVENUE")

    cash_account = deposit_refund_account
    settlement_account, _ = FinanceAccount.objects.get_or_create(
        name="Cash Counter - Rent/Lease Collections",
        defaults={
            "kind": FinanceAccountKind.CASH,
            "chart_account": cash_account,
            "opening_balance": MONEY_ZERO,
            "is_real_settlement_account": True,
            "is_active": True,
            "notes": "Premade rent/lease settlement account for cash, deposit, refund, and damage bridge postings.",
        },
    )
    if (
        not settlement_account.is_active
        or settlement_account.chart_account_id != cash_account.id
        or not settlement_account.is_real_settlement_account
        or settlement_account.kind != FinanceAccountKind.CASH
    ):
        settlement_account.is_active = True
        settlement_account.chart_account = cash_account
        settlement_account.kind = FinanceAccountKind.CASH
        settlement_account.is_real_settlement_account = True
        settlement_account.save(update_fields=["is_active", "chart_account", "kind", "is_real_settlement_account", "updated_at"])

    FinanceAccountCoaMapping.objects.update_or_create(
        finance_account=settlement_account,
        purpose=FinanceAccountMappingPurpose.CASH_COLLECTION,
        defaults={
            "chart_account": cash_account,
            "is_active": True,
            "is_default": False,
            "updated_by": performed_by,
            "notes": "Premade rent/lease settlement collection mapping.",
        },
    )

    mapping = _locked_active_mapping_for_update()
    if mapping is None:
        mapping = RentLeaseAccountingAccountMapping.objects.create(
            monthly_income_account=monthly_income_account,
            deposit_liability_account=deposit_liability_account,
            deposit_refund_account=deposit_refund_account,
            damage_recovery_income_account=damage_recovery_income_account,
            settlement_finance_account=settlement_account,
            is_active=True,
            notes="Premade rent/lease mapping generated automatically for live accounting bridge posting.",
        )
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=mapping,
            performed_by=performed_by,
            metadata={"event": "RENT_LEASE_PREMADE_ACCOUNTING_MAPPING_CREATED", "mapping_id": mapping.id},
        )
    else:
        repaired_fields: list[str] = []
        previous_state = {
            "monthly_income_account_id": mapping.monthly_income_account_id,
            "deposit_liability_account_id": mapping.deposit_liability_account_id,
            "deposit_refund_account_id": mapping.deposit_refund_account_id,
            "damage_recovery_income_account_id": mapping.damage_recovery_income_account_id,
            "settlement_finance_account_id": mapping.settlement_finance_account_id,
        }
        if not _valid_chart(mapping.monthly_income_account, ChartOfAccountType.INCOME):
            mapping.monthly_income_account = monthly_income_account
            repaired_fields.append("monthly_income_account")
        if not _valid_chart(mapping.deposit_liability_account, ChartOfAccountType.LIABILITY):
            mapping.deposit_liability_account = deposit_liability_account
            repaired_fields.append("deposit_liability_account")
        if not _valid_chart(mapping.deposit_refund_account, ChartOfAccountType.ASSET):
            mapping.deposit_refund_account = deposit_refund_account
            repaired_fields.append("deposit_refund_account")
        if not _valid_chart(mapping.damage_recovery_income_account, ChartOfAccountType.INCOME):
            mapping.damage_recovery_income_account = damage_recovery_income_account
            repaired_fields.append("damage_recovery_income_account")
        if not _valid_settlement_account(mapping.settlement_finance_account):
            mapping.settlement_finance_account = settlement_account
            repaired_fields.append("settlement_finance_account")
        if repaired_fields:
            mapping.save(
                update_fields=[
                    "monthly_income_account",
                    "deposit_liability_account",
                    "deposit_refund_account",
                    "damage_recovery_income_account",
                    "settlement_finance_account",
                    "updated_at",
                ]
            )
            log_audit(
                action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                instance=mapping,
                performed_by=performed_by,
                metadata={
                    "event": "RENT_LEASE_PREMADE_ACCOUNTING_MAPPING_REPAIRED",
                    "mapping_id": mapping.id,
                    "repaired_fields": repaired_fields,
                    "previous_state": previous_state,
                },
            )

    if mapping.settlement_finance_account_id is None:
        mapping.settlement_finance_account = settlement_account
        mapping.save(update_fields=["settlement_finance_account", "updated_at"])

    with connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE accounting_rent_lease_account_mappings
            SET customer_advance_liability_account_id = %s,
                rent_income_account_id = %s,
                lease_income_account_id = %s,
                updated_at = %s
            WHERE id = %s
            """,
            [
                customer_advance_liability_account.id,
                monthly_income_account.id,
                lease_income_account.id,
                timezone.now(),
                mapping.id,
            ],
        )

    return mapping


def get_active_account_mapping(*, auto_create: bool = True) -> RentLeaseAccountingAccountMapping | None:
    mapping = (
        RentLeaseAccountingAccountMapping.objects.select_related(
            "monthly_income_account",
            "deposit_liability_account",
            "deposit_refund_account",
            "damage_recovery_income_account",
            "settlement_finance_account",
            "settlement_finance_account__chart_account",
        )
        .filter(is_active=True)
        .first()
    )
    if auto_create and (
        mapping is None
        or not _valid_chart(mapping.monthly_income_account, ChartOfAccountType.INCOME)
        or not _valid_chart(mapping.deposit_liability_account, ChartOfAccountType.LIABILITY)
        or not _valid_chart(mapping.deposit_refund_account, ChartOfAccountType.ASSET)
        or not _valid_chart(mapping.damage_recovery_income_account, ChartOfAccountType.INCOME)
        or not _valid_settlement_account(mapping.settlement_finance_account)
    ):
        return ensure_premade_rent_lease_accounting_setup()
    return mapping


def _mapping_metadata(mapping: RentLeaseAccountingAccountMapping | None) -> dict:
    if mapping is None:
        return {"mapping_configured": False}
    return {
        "mapping_configured": True,
        "mapping_id": mapping.id,
        "monthly_income_account_code": mapping.monthly_income_account.code,
        "deposit_liability_account_code": mapping.deposit_liability_account.code,
        "deposit_refund_account_code": mapping.deposit_refund_account.code,
        "damage_recovery_income_account_code": mapping.damage_recovery_income_account.code,
        "settlement_finance_account_id": mapping.settlement_finance_account_id,
        "settlement_chart_account_code": mapping.settlement_finance_account.chart_account.code
        if mapping.settlement_finance_account_id
        else None,
    }


def _deposit_source_reference(*, subscription: Subscription, tx_type: str, amount: Decimal, fallback_event: str) -> str:
    tx = (
        RentLeaseDepositTransaction.objects.filter(
            subscription=subscription,
            transaction_type=tx_type,
            amount=amount,
        )
        .order_by("-created_at", "-id")
        .first()
    )
    if tx:
        return f"RENT_LEASE:{fallback_event}:TX:{tx.id}"
    return f"RENT_LEASE:{fallback_event}:SUB:{subscription.id}:{timezone.now().isoformat()}"


def _post_bridge_journal(
    *,
    subscription: Subscription,
    event: str,
    amount,
    debit_account: ChartOfAccount,
    credit_account: ChartOfAccount,
    performed_by=None,
    source_reference: str,
    memo: str,
) -> SyncResult:
    amount_q = _money(amount)
    if amount_q <= MONEY_ZERO:
        return _result(
            event=event,
            status="SKIPPED",
            source_model="Subscription",
            source_id=subscription.id,
            reason="Amount must be greater than zero for accounting bridge posting.",
            source_reference=source_reference,
        )

    existing = (
        JournalEntry.objects.filter(
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            source_model="Subscription",
            source_id=str(subscription.id),
            source_reference=source_reference,
        )
        .exclude(status=JournalEntryStatus.VOID)
        .first()
    )
    if existing:
        return _result(
            event=event,
            status="ALREADY_POSTED",
            source_model="Subscription",
            source_id=subscription.id,
            reason="Accounting bridge journal already exists for this source event.",
            journal_entry=existing,
            source_reference=source_reference,
        )

    journal = create_journal_entry(
        entry_date=timezone.localdate(),
        entry_type=JournalEntryType.SYSTEM_BRIDGE,
        memo=memo,
        source_model="Subscription",
        source_id=str(subscription.id),
        voucher_type="RENT_LEASE",
        source_type=event,
        source_reference=source_reference,
        lines=[
            {
                "chart_account": debit_account,
                "debit_amount": amount_q,
                "credit_amount": MONEY_ZERO,
                "description": f"{event} debit",
            },
            {
                "chart_account": credit_account,
                "debit_amount": MONEY_ZERO,
                "credit_amount": amount_q,
                "description": f"{event} credit",
            },
        ],
    )
    journal, _ = post_journal_entry(journal_entry_id=journal.id, posted_by=performed_by)
    return _result(
        event=event,
        status="POSTED",
        source_model="Subscription",
        source_id=subscription.id,
        reason="Accounting bridge journal posted from authoritative rent/lease source event.",
        journal_entry=journal,
        source_reference=source_reference,
    )


def _log_sync_result(*, subscription: Subscription, amount, performed_by, result: SyncResult, mapping=None) -> dict:
    payload = {"event": "ACCOUNTING_SYNC_POSTED", **asdict(result), "amount": str(amount), **_mapping_metadata(mapping)}
    if result.status in {"SKIPPED", "DEFERRED"}:
        payload["event"] = "ACCOUNTING_SYNC_SKIPPED"
    if result.status == "ALREADY_POSTED":
        payload["event"] = "ACCOUNTING_SYNC_ALREADY_POSTED"
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata=payload,
    )
    return asdict(result)


def sync_rent_lease_monthly_income(*, subscription: Subscription, amount, performed_by=None) -> dict:
    mapping = ensure_premade_rent_lease_accounting_setup(performed_by=performed_by)
    settlement_chart = mapping.settlement_finance_account.chart_account
    income_account = _chart("LEASE_INCOME") if subscription.plan_type == PlanType.LEASE else mapping.monthly_income_account
    amount_q = _money(amount)
    source_reference = f"RENT_LEASE:MONTHLY_PAYMENT:SUB:{subscription.id}:{timezone.localdate().isoformat()}:{amount_q}"
    result = _post_bridge_journal(
        subscription=subscription,
        event="RENT_LEASE_MONTHLY_PAYMENT",
        amount=amount_q,
        debit_account=settlement_chart,
        credit_account=income_account,
        performed_by=performed_by,
        source_reference=source_reference,
        memo=f"Rent/lease monthly collection for {subscription.subscription_number or subscription.id}",
    )
    return _log_sync_result(subscription=subscription, amount=amount_q, performed_by=performed_by, result=result, mapping=mapping)


def sync_security_deposit_liability(*, subscription: Subscription, amount, performed_by=None) -> dict:
    mapping = ensure_premade_rent_lease_accounting_setup(performed_by=performed_by)
    amount_q = _money(amount)
    source_reference = _deposit_source_reference(
        subscription=subscription,
        tx_type=RentLeaseDepositTransactionType.COLLECTED,
        amount=amount_q,
        fallback_event="SECURITY_DEPOSIT_COLLECTED",
    )
    result = _post_bridge_journal(
        subscription=subscription,
        event="SECURITY_DEPOSIT_COLLECTED",
        amount=amount_q,
        debit_account=mapping.settlement_finance_account.chart_account,
        credit_account=mapping.deposit_liability_account,
        performed_by=performed_by,
        source_reference=source_reference,
        memo=f"Security deposit collected for {subscription.subscription_number or subscription.id}",
    )
    return _log_sync_result(subscription=subscription, amount=amount_q, performed_by=performed_by, result=result, mapping=mapping)


def sync_deposit_refund_liability_reduction(*, subscription: Subscription, amount, performed_by=None) -> dict:
    mapping = ensure_premade_rent_lease_accounting_setup(performed_by=performed_by)
    amount_q = _money(amount)
    source_reference = _deposit_source_reference(
        subscription=subscription,
        tx_type=RentLeaseDepositTransactionType.REFUNDED,
        amount=amount_q,
        fallback_event="SECURITY_DEPOSIT_REFUNDED",
    )
    result = _post_bridge_journal(
        subscription=subscription,
        event="SECURITY_DEPOSIT_REFUNDED",
        amount=amount_q,
        debit_account=mapping.deposit_refund_account,
        credit_account=mapping.settlement_finance_account.chart_account,
        performed_by=performed_by,
        source_reference=source_reference,
        memo=f"Security deposit refund for {subscription.subscription_number or subscription.id}",
    )
    return _log_sync_result(subscription=subscription, amount=amount_q, performed_by=performed_by, result=result, mapping=mapping)


def sync_damage_deduction_income(*, subscription: Subscription, amount, performed_by=None) -> dict:
    mapping = ensure_premade_rent_lease_accounting_setup(performed_by=performed_by)
    amount_q = _money(amount)
    source_reference = _deposit_source_reference(
        subscription=subscription,
        tx_type=RentLeaseDepositTransactionType.DEDUCTION,
        amount=amount_q,
        fallback_event="SECURITY_DEPOSIT_DAMAGE_DEDUCTION",
    )
    result = _post_bridge_journal(
        subscription=subscription,
        event="SECURITY_DEPOSIT_DAMAGE_DEDUCTION",
        amount=amount_q,
        debit_account=mapping.deposit_liability_account,
        credit_account=mapping.damage_recovery_income_account,
        performed_by=performed_by,
        source_reference=source_reference,
        memo=f"Security deposit damage deduction for {subscription.subscription_number or subscription.id}",
    )
    return _log_sync_result(subscription=subscription, amount=amount_q, performed_by=performed_by, result=result, mapping=mapping)
