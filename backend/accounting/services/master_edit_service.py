from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction

from accounting.models import ChartOfAccount, FinanceAccount, MONEY_ZERO
from accounting.services.journal_posting_service import _log_accounting_event


def _money(value: Any) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


def _string(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _serialize_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, "pk"):
        payload = {"id": getattr(value, "pk", None)}
        for attr in ("code", "name", "kind", "account_type"):
            raw = getattr(value, attr, None)
            if raw not in (None, ""):
                payload[attr] = raw
        return payload
    return value


def _value_changed(current: Any, incoming: Any) -> bool:
    if hasattr(current, "pk"):
        return getattr(current, "pk", None) != getattr(incoming, "pk", incoming)
    if isinstance(current, Decimal):
        return _money(current) != _money(incoming)
    return current != incoming


def _parent_creates_cycle(*, account: ChartOfAccount, parent: ChartOfAccount | None) -> bool:
    current = parent
    while current is not None:
        if current.pk == account.pk:
            return True
        current = current.parent
    return False


@dataclass(frozen=True)
class EditabilityPolicy:
    can_edit: bool
    editable_fields: list[str]
    locked_fields: dict[str, str]
    can_deactivate: bool
    deactivate_reason: str | None = None
    can_change_parent: bool | None = None
    parent_change_reason: str | None = None
    can_change_chart_account: bool | None = None
    chart_account_change_reason: str | None = None
    usage_summary: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "can_edit": self.can_edit,
            "editable_fields": self.editable_fields,
            "locked_fields": self.locked_fields,
            "can_deactivate": self.can_deactivate,
            "deactivate_reason": self.deactivate_reason,
            "can_change_parent": self.can_change_parent,
            "parent_change_reason": self.parent_change_reason,
            "can_change_chart_account": self.can_change_chart_account,
            "chart_account_change_reason": self.chart_account_change_reason,
            "usage_summary": self.usage_summary,
        }


class ChartAccountEditPolicyService:
    IMMUTABLE_FIELD_REASONS = {
        "code": "Code is immutable after creation.",
        "account_type": "Account type is immutable after creation.",
        "system_code": "System code is immutable after creation.",
    }

    @classmethod
    def usage_summary(cls, account: ChartOfAccount) -> dict[str, Any]:
        has_postings = account.journal_entry_lines.exists()
        has_finance_links = account.finance_accounts.exists()
        has_children = account.children.exists()
        has_transaction_references = (
            account.expense_vouchers.exists()
            or account.employee_expense_claims.exists()
        )
        is_system_account = bool(account.system_code)
        is_used = any(
            [
                has_postings,
                has_finance_links,
                has_children,
                has_transaction_references,
                is_system_account,
            ]
        )
        return {
            "is_system_account": is_system_account,
            "is_used": is_used,
            "has_postings": has_postings,
            "has_finance_links": has_finance_links,
            "has_children": has_children,
            "has_transaction_references": has_transaction_references,
        }

    @classmethod
    def get_editability(cls, account: ChartOfAccount) -> EditabilityPolicy:
        usage = cls.usage_summary(account)
        editable_fields = ["name", "notes"]
        locked_fields = dict(cls.IMMUTABLE_FIELD_REASONS)

        parent_reason = None
        if usage["has_children"]:
            parent_reason = "Parent is locked because this account already has child accounts."
        elif usage["has_postings"] or usage["has_finance_links"] or usage["has_transaction_references"]:
            parent_reason = "Parent is locked because this account is already referenced by live accounting or finance flows."
        elif usage["is_system_account"]:
            parent_reason = "Parent is locked for system accounts."
        else:
            editable_fields.append("parent")

        structural_reason = None
        if usage["has_postings"]:
            structural_reason = "This field is locked because the account already has journal postings."
        elif usage["has_finance_links"]:
            structural_reason = "This field is locked because finance accounts already map to this chart account."
        elif usage["has_children"]:
            structural_reason = "This field is locked because the account already has child accounts."
        elif usage["has_transaction_references"]:
            structural_reason = "This field is locked because this account is already referenced by accounting documents."
        elif usage["is_system_account"]:
            structural_reason = "This field is locked for system accounts."

        if structural_reason:
            locked_fields["allow_manual_posting"] = structural_reason
            locked_fields["is_active"] = (
                "Account cannot be deactivated because it is already in use."
                if not usage["is_system_account"]
                else "System accounts cannot be deactivated."
            )
        else:
            editable_fields.extend(["allow_manual_posting", "is_active"])

        if parent_reason:
            locked_fields["parent"] = parent_reason

        can_deactivate = "is_active" in editable_fields
        deactivate_reason = None if can_deactivate else locked_fields.get("is_active")
        return EditabilityPolicy(
            can_edit=bool(editable_fields),
            editable_fields=editable_fields,
            locked_fields=locked_fields,
            can_deactivate=can_deactivate,
            deactivate_reason=deactivate_reason,
            can_change_parent="parent" in editable_fields,
            parent_change_reason=parent_reason,
            usage_summary=usage,
        )


class FinanceAccountEditPolicyService:
    @classmethod
    def usage_summary(cls, account: FinanceAccount) -> dict[str, Any]:
        has_cash_counters = account.cash_counters.exists()
        has_accounting_documents = any(
            [
                account.expense_vouchers.exists(),
                account.salary_payments.exists(),
                account.employee_expense_claim_payments.exists(),
                account.outgoing_money_movements.exists(),
                account.incoming_money_movements.exists(),
                account.vendor_settlements.exists(),
                account.purchase_bills.exists(),
            ]
        )
        has_billing_documents = any(
            [
                account.direct_sales.exists(),
                account.billing_invoices.exists(),
                account.receipt_documents.exists(),
            ]
        )
        has_commission_payout_usage = account.commission_payout_batches.exists()
        has_historical_postings = account.chart_account.journal_entry_lines.exists()
        has_opening_balance = _money(account.opening_balance) != MONEY_ZERO
        is_used = any(
            [
                has_cash_counters,
                has_accounting_documents,
                has_billing_documents,
                has_commission_payout_usage,
                has_historical_postings,
                has_opening_balance,
            ]
        )
        return {
            "is_used": is_used,
            "has_cash_counters": has_cash_counters,
            "has_accounting_documents": has_accounting_documents,
            "has_billing_documents": has_billing_documents,
            "has_commission_payout_usage": has_commission_payout_usage,
            "has_historical_postings": has_historical_postings,
            "has_opening_balance": has_opening_balance,
        }

    @classmethod
    def get_editability(cls, account: FinanceAccount) -> EditabilityPolicy:
        usage = cls.usage_summary(account)
        editable_fields = ["name", "bank_last4", "upi_handle", "notes", "is_real_settlement_account"]
        locked_fields: dict[str, str] = {}

        # Structural reason locks chart_account, kind, is_active (counters or any real usage).
        if usage["has_cash_counters"]:
            structural_reason = "This field is locked because active cash counters already route through this finance account."
        elif usage["has_accounting_documents"]:
            structural_reason = "This field is locked because accounting documents already reference this finance account."
        elif usage["has_billing_documents"]:
            structural_reason = "This field is locked because billing documents already reference this finance account."
        elif usage["has_commission_payout_usage"]:
            structural_reason = "This field is locked because commission payout batches already reference this finance account."
        elif usage["has_historical_postings"]:
            structural_reason = "This field is locked because this finance account already has historical ledger postings through its linked chart account."
        else:
            structural_reason = None

        # Opening balance is independently governed: locked only when real financial
        # transactions exist (payments, receipts, journals). A counter link alone does
        # NOT lock opening balance — the admin must be able to set it during onboarding.
        has_real_transactions = any([
            usage["has_accounting_documents"],
            usage["has_billing_documents"],
            usage["has_commission_payout_usage"],
            usage["has_historical_postings"],
        ])

        if structural_reason:
            locked_fields["chart_account"] = structural_reason
            locked_fields["kind"] = structural_reason
            locked_fields["is_active"] = "Finance account cannot be deactivated because it is already in operational use."
        else:
            editable_fields.extend(["chart_account", "kind", "is_active"])

        if has_real_transactions:
            locked_fields["opening_balance"] = "Opening balance cannot be changed after real financial transactions (payments, invoices, or journal entries) exist."
        else:
            editable_fields.append("opening_balance")

        can_deactivate = "is_active" in editable_fields
        deactivate_reason = None if can_deactivate else locked_fields.get("is_active")
        chart_reason = None if "chart_account" in editable_fields else locked_fields.get("chart_account")
        return EditabilityPolicy(
            can_edit=bool(editable_fields),
            editable_fields=editable_fields,
            locked_fields=locked_fields,
            can_deactivate=can_deactivate,
            deactivate_reason=deactivate_reason,
            can_change_chart_account="chart_account" in editable_fields,
            chart_account_change_reason=chart_reason,
            usage_summary=usage,
        )


class AccountingMasterUpdateService:
    @staticmethod
    def _raise_for_locked_fields(*, errors: dict[str, str]):
        if errors:
            raise DjangoValidationError(errors)

    @classmethod
    def _capture_changes(cls, instance, payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
        old_values: dict[str, Any] = {}
        new_values: dict[str, Any] = {}
        changed_fields: list[str] = []
        for field, value in payload.items():
            current = getattr(instance, field)
            if not _value_changed(current, value):
                continue
            changed_fields.append(field)
            old_values[field] = _serialize_value(current)
            new_values[field] = _serialize_value(value)
        return old_values, new_values, changed_fields

    @classmethod
    def validate_chart_account_update(
        cls,
        *,
        account: ChartOfAccount,
        payload: dict[str, Any],
    ) -> EditabilityPolicy:
        policy = ChartAccountEditPolicyService.get_editability(account)
        errors: dict[str, str] = {}

        for field, reason in ChartAccountEditPolicyService.IMMUTABLE_FIELD_REASONS.items():
            if field in payload and _value_changed(getattr(account, field), payload[field]):
                errors[field] = reason

        if "parent" in payload and _value_changed(account.parent, payload["parent"]):
            if "parent" not in policy.editable_fields:
                errors["parent"] = policy.locked_fields.get("parent", "Parent is locked.")
            elif _parent_creates_cycle(account=account, parent=payload["parent"]):
                errors["parent"] = "Parent cannot create a circular chart hierarchy."

        for field in ("allow_manual_posting", "is_active"):
            if field in payload and _value_changed(getattr(account, field), payload[field]) and field not in policy.editable_fields:
                errors[field] = policy.locked_fields.get(field, f"{field} is locked.")

        cls._raise_for_locked_fields(errors=errors)
        return policy

    @classmethod
    @transaction.atomic
    def update_chart_account(
        cls,
        *,
        account: ChartOfAccount,
        payload: dict[str, Any],
        actor=None,
    ) -> ChartOfAccount:
        cls.validate_chart_account_update(account=account, payload=payload)

        old_values, new_values, changed_fields = cls._capture_changes(account, payload)
        for field in changed_fields:
            setattr(account, field, payload[field])

        if changed_fields:
            account.save()
            _log_accounting_event(
                event="ACCOUNTING_MASTER_UPDATED",
                instance=account,
                performed_by=actor,
                metadata={
                    "entity_type": "CHART_OF_ACCOUNT",
                    "entity_id": account.id,
                    "entity_code": account.code,
                    "changed_fields": changed_fields,
                    "old": old_values,
                    "new": new_values,
                },
            )

        return account

    @classmethod
    def validate_finance_account_update(
        cls,
        *,
        account: FinanceAccount,
        payload: dict[str, Any],
    ) -> EditabilityPolicy:
        policy = FinanceAccountEditPolicyService.get_editability(account)
        errors: dict[str, str] = {}

        for field in ("chart_account", "kind", "opening_balance", "is_active"):
            if field in payload and _value_changed(getattr(account, field), payload[field]) and field not in policy.editable_fields:
                errors[field] = policy.locked_fields.get(field, f"{field} is locked.")

        cls._raise_for_locked_fields(errors=errors)
        return policy

    @classmethod
    @transaction.atomic
    def update_finance_account(
        cls,
        *,
        account: FinanceAccount,
        payload: dict[str, Any],
        actor=None,
    ) -> FinanceAccount:
        cls.validate_finance_account_update(account=account, payload=payload)

        old_values, new_values, changed_fields = cls._capture_changes(account, payload)
        for field in changed_fields:
            setattr(account, field, payload[field])

        if changed_fields:
            account.save()
            _log_accounting_event(
                event="ACCOUNTING_MASTER_UPDATED",
                instance=account,
                performed_by=actor,
                metadata={
                    "entity_type": "FINANCE_ACCOUNT",
                    "entity_id": account.id,
                    "entity_name": account.name,
                    "chart_account_id": account.chart_account_id,
                    "changed_fields": changed_fields,
                    "old": old_values,
                    "new": new_values,
                },
            )

        return account


def get_chart_account_editability(account: ChartOfAccount) -> dict[str, Any]:
    return ChartAccountEditPolicyService.get_editability(account).as_dict()


def get_finance_account_editability(account: FinanceAccount) -> dict[str, Any]:
    return FinanceAccountEditPolicyService.get_editability(account).as_dict()
