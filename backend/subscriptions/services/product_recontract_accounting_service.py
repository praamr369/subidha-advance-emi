from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from accounting.models import (
    AccountingBridgePosting,
    AccountingPostingProfile,
    ChartOfAccount,
    ChartOfAccountType,
)
from accounting.services.bridge_posting_service import post_bridge_entry
from subscriptions.models import (
    AuditLog,
    ContractRecontractEvent,
    ContractRecontractFinancialImpactPreview,
    ContractRecontractScheduleLine,
    MONEY_ZERO,
)
from subscriptions.services.audit_service import log_audit

PHASE_6F2 = "PHASE_6F2_ACCOUNTING_POSTING_BRIDGE_ONLY"
POSTING_PURPOSE = "CONTRACT_RECONTRACT_ACCOUNTING_ADJUSTMENT"
RECEIVABLE_PROFILE_KEY = "CUSTOMER_RECEIVABLE"
REVENUE_ADJUSTMENT_PROFILE_KEY = "EMI_INCOME"
CUSTOMER_CREDIT_PROFILE_KEY = "CUSTOMER_ADVANCE_UNEARNED_REVENUE"


def _q2(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _money(value) -> str:
    return f"{_q2(value):.2f}"


def _account_snapshot(account: ChartOfAccount) -> dict:
    return {
        "id": account.id,
        "code": account.code,
        "name": account.name,
        "account_type": account.account_type,
        "system_code": account.system_code,
    }


def _profile_account(*, key: str, expected_type: str) -> ChartOfAccount:
    profile = (
        AccountingPostingProfile.objects.select_for_update()
        .select_related("chart_account")
        .filter(key=key, is_active=True)
        .first()
    )
    if profile is None:
        raise ValidationError({"detail": f"Accounting posting profile '{key}' is missing or inactive."})

    account = profile.chart_account
    if account is None:
        raise ValidationError({"detail": f"Accounting posting profile '{key}' is not linked to a chart account."})
    if not account.is_active:
        raise ValidationError({"detail": f"Accounting chart account for posting profile '{key}' is inactive."})
    if account.account_type != expected_type:
        raise ValidationError(
            {
                "detail": (
                    f"Accounting posting profile '{key}' must map to a {expected_type} chart account; "
                    f"found {account.account_type}."
                )
            }
        )
    return account


def _latest_financial_preview(event: ContractRecontractEvent) -> ContractRecontractFinancialImpactPreview | None:
    return (
        ContractRecontractFinancialImpactPreview.objects.select_for_update()
        .filter(
            event=event,
            accounting_preview_status=ContractRecontractFinancialImpactPreview.PreviewStatus.PREVIEWED,
            reconciliation_preview_status=ContractRecontractFinancialImpactPreview.PreviewStatus.PREVIEWED,
        )
        .order_by("-created_at", "-id")
        .first()
    )


def _assert_schedule_preview_exists(event: ContractRecontractEvent) -> None:
    exists = event.schedule_preview_lines.filter(
        proposed_status=ContractRecontractScheduleLine.ProposedStatus.PREVIEW_ONLY
    ).exists()
    if not exists:
        raise ValidationError({"detail": "Accounting posting requires generated product recontract schedule preview lines."})


def _existing_bridge(event: ContractRecontractEvent) -> AccountingBridgePosting | None:
    return (
        AccountingBridgePosting.objects.select_for_update()
        .select_related("journal_entry")
        .filter(
            source_model="ContractRecontractEvent",
            source_id=str(event.pk),
            purpose=POSTING_PURPOSE,
        )
        .first()
    )


def _duplicate_posting_error(bridge: AccountingBridgePosting) -> ValidationError:
    return ValidationError(
        {
            "detail": "Product recontract accounting posting already exists for this event.",
            "posting_record_id": bridge.id,
            "journal_entry_id": bridge.journal_entry_id,
        }
    )


def _journal_line(*, account: ChartOfAccount, side: str, amount: Decimal, description: str) -> dict:
    amount = _q2(amount)
    if amount <= MONEY_ZERO:
        raise ValidationError({"detail": "Accounting posting amount must be greater than zero."})
    return {
        "chart_account": account,
        "description": description,
        "debit_amount": amount if side == "DR" else MONEY_ZERO,
        "credit_amount": amount if side == "CR" else MONEY_ZERO,
    }


def _response_line(*, account: ChartOfAccount, side: str, amount: Decimal, description: str) -> dict:
    return {
        "side": side,
        "amount": _money(amount),
        "description": description,
        "account": _account_snapshot(account),
    }


def _build_posting_lines(
    *,
    event: ContractRecontractEvent,
    financial_preview: ContractRecontractFinancialImpactPreview,
) -> tuple[Decimal, list[dict], list[dict], dict]:
    receivable_account = _profile_account(
        key=RECEIVABLE_PROFILE_KEY,
        expected_type=ChartOfAccountType.ASSET,
    )
    revenue_adjustment_account = _profile_account(
        key=REVENUE_ADJUSTMENT_PROFILE_KEY,
        expected_type=ChartOfAccountType.INCOME,
    )

    if event.impact_type == ContractRecontractEvent.ImpactType.UPGRADE_EXTRA_PAYABLE:
        amount = _q2(financial_preview.additional_receivable_amount or event.price_difference)
        if amount <= MONEY_ZERO:
            raise ValidationError({"detail": "Upgrade accounting posting requires a positive receivable amount."})
        lines = [
            _journal_line(
                account=receivable_account,
                side="DR",
                amount=amount,
                description="Product recontract upgrade: customer receivable increase",
            ),
            _journal_line(
                account=revenue_adjustment_account,
                side="CR",
                amount=amount,
                description="Product recontract upgrade: contract increase evidence",
            ),
        ]
        response_lines = [
            _response_line(
                account=receivable_account,
                side="DR",
                amount=amount,
                description="Customer Receivable / Contract Receivable",
            ),
            _response_line(
                account=revenue_adjustment_account,
                side="CR",
                amount=amount,
                description="Product Recontract Revenue Adjustment / Contract Increase",
            ),
        ]
        return amount, lines, response_lines, {
            "receivable_increase_amount": _money(amount),
            "receivable_reduction_amount": "0.00",
            "customer_credit_amount": "0.00",
            "refund_created": False,
        }

    if event.impact_type == ContractRecontractEvent.ImpactType.DOWNGRADE_CREDIT_REQUIRED:
        amount = _q2(financial_preview.credit_or_reduction_amount or abs(_q2(event.price_difference)))
        if amount <= MONEY_ZERO:
            raise ValidationError({"detail": "Downgrade accounting posting requires a positive reduction or credit amount."})

        unpaid_balance = max(_q2(event.old_remaining_balance), MONEY_ZERO)
        receivable_reduction_amount = min(amount, unpaid_balance)
        customer_credit_amount = _q2(amount - receivable_reduction_amount)

        lines = [
            _journal_line(
                account=revenue_adjustment_account,
                side="DR",
                amount=amount,
                description="Product recontract downgrade: contract decrease evidence",
            )
        ]
        response_lines = [
            _response_line(
                account=revenue_adjustment_account,
                side="DR",
                amount=amount,
                description="Product Recontract Revenue Adjustment / Contract Decrease",
            )
        ]

        if receivable_reduction_amount > MONEY_ZERO:
            lines.append(
                _journal_line(
                    account=receivable_account,
                    side="CR",
                    amount=receivable_reduction_amount,
                    description="Product recontract downgrade: receivable reduction",
                )
            )
            response_lines.append(
                _response_line(
                    account=receivable_account,
                    side="CR",
                    amount=receivable_reduction_amount,
                    description="Customer Receivable / Contract Receivable reduction",
                )
            )

        if customer_credit_amount > MONEY_ZERO:
            customer_credit_account = _profile_account(
                key=CUSTOMER_CREDIT_PROFILE_KEY,
                expected_type=ChartOfAccountType.LIABILITY,
            )
            lines.append(
                _journal_line(
                    account=customer_credit_account,
                    side="CR",
                    amount=customer_credit_amount,
                    description="Product recontract downgrade: customer credit liability evidence",
                )
            )
            response_lines.append(
                _response_line(
                    account=customer_credit_account,
                    side="CR",
                    amount=customer_credit_amount,
                    description="Customer Credit / Customer Advance Liability",
                )
            )

        return amount, lines, response_lines, {
            "receivable_increase_amount": "0.00",
            "receivable_reduction_amount": _money(receivable_reduction_amount),
            "customer_credit_amount": _money(customer_credit_amount),
            "refund_created": False,
        }

    raise ValidationError({"detail": "No monetary accounting posting is required for same-price product reference correction."})


@transaction.atomic
def execute_product_recontract_accounting(
    *,
    event: ContractRecontractEvent,
    financial_preview: ContractRecontractFinancialImpactPreview | None = None,
    requested_by=None,
    performed_by=None,
) -> dict:
    """
    Create durable accounting evidence for a product recontract adjustment only.

    Phase 6F.2 intentionally does not execute the recontract and does not mutate source
    subscription, EMI, payment, receipt, settlement, reconciliation, inventory, delivery,
    commission, payout, waiver, lucky draw, lucky ID, batch, rent/lease demand, or deposit rows.
    """

    actor = requested_by or performed_by
    locked_event = (
        ContractRecontractEvent.objects.select_for_update()
        .select_related("amendment", "subscription", "old_product", "new_product")
        .prefetch_related("schedule_preview_lines")
        .get(pk=event.pk)
    )

    if locked_event.status != ContractRecontractEvent.Status.PREVIEWED:
        raise ValidationError({"detail": "Accounting posting requires latest recontract event status PREVIEWED."})
    if locked_event.customer_consent_status != ContractRecontractEvent.CustomerConsentStatus.ACCEPTED:
        raise ValidationError({"detail": "Accounting posting requires customer consent status ACCEPTED."})
    if locked_event.admin_approval_status != ContractRecontractEvent.AdminApprovalStatus.APPROVED:
        raise ValidationError({"detail": "Accounting posting requires admin approval status APPROVED."})

    _assert_schedule_preview_exists(locked_event)

    if financial_preview is not None:
        financial_preview = ContractRecontractFinancialImpactPreview.objects.select_for_update().get(pk=financial_preview.pk)
        if financial_preview.event_id != locked_event.id:
            raise ValidationError({"detail": "Financial impact preview does not belong to this recontract event."})
        if (
            financial_preview.accounting_preview_status != ContractRecontractFinancialImpactPreview.PreviewStatus.PREVIEWED
            or financial_preview.reconciliation_preview_status != ContractRecontractFinancialImpactPreview.PreviewStatus.PREVIEWED
        ):
            raise ValidationError({"detail": "Accounting posting requires PREVIEWED financial impact preview statuses."})
    else:
        financial_preview = _latest_financial_preview(locked_event)

    if financial_preview is None:
        raise ValidationError({"detail": "Accounting posting requires financial impact preview evidence."})
    if financial_preview.blocked_reason:
        raise ValidationError({"detail": f"Accounting posting blocked: {financial_preview.blocked_reason}"})

    existing = _existing_bridge(locked_event)
    if existing is not None:
        raise _duplicate_posting_error(existing)

    amount, journal_lines, response_lines, amount_metadata = _build_posting_lines(
        event=locked_event,
        financial_preview=financial_preview,
    )
    entry_date = locked_event.effective_date_preview or timezone.localdate()

    try:
        journal_entry, created = post_bridge_entry(
            source_instance=locked_event,
            purpose=POSTING_PURPOSE,
            entry_date=entry_date,
            memo=f"Product recontract accounting evidence for amendment {locked_event.amendment_id}",
            lines=journal_lines,
            voucher_type="CONTRACT_RECONTRACT",
            source_type="CONTRACT_RECONTRACT_EVENT",
            source_reference=f"RECONTRACT-{locked_event.id}",
            source_document_no=f"AMEND-{locked_event.amendment_id}",
            source_event_date=entry_date,
            trace_metadata={
                "phase": PHASE_6F2,
                "event": "CONTRACT_RECONTRACT_ACCOUNTING_POSTED",
                "recontract_event_id": locked_event.id,
                "amendment_id": locked_event.amendment_id,
                "subscription_id": locked_event.subscription_id,
                "financial_impact_preview_id": financial_preview.id,
                "impact_type": locked_event.impact_type,
                "amount": _money(amount),
                "old_product_id": locked_event.old_product_id,
                "new_product_id": locked_event.new_product_id,
                "source_record_mutation": False,
                "execution_performed": False,
                "receipt_created": False,
                "payment_created": False,
                "settlement_created": False,
                "reconciliation_created": False,
                **amount_metadata,
            },
            posted_by=actor,
        )
    except ValidationError:
        raise
    except ValueError as exc:
        raise ValidationError({"detail": str(exc)}) from exc

    bridge = _existing_bridge(locked_event)
    if bridge is None:
        raise ValidationError({"detail": "Accounting bridge posting was not persisted."})
    if not created:
        raise _duplicate_posting_error(bridge)

    posted_at = timezone.now()
    metadata = locked_event.metadata or {}
    metadata.update(
        {
            "phase": PHASE_6F2,
            "accounting_posting_status": "POSTED",
            "accounting_posting_bridge_id": bridge.id,
            "accounting_posting_journal_entry_id": journal_entry.id,
            "accounting_posting_journal_entry_no": journal_entry.entry_no,
            "accounting_posting_posted_at": posted_at.isoformat(),
            "latest_financial_impact_preview_id": financial_preview.id,
            "source_record_mutation": False,
            "execution_performed": False,
            "receipt_created": False,
            "payment_created": False,
            "settlement_created": False,
            "reconciliation_created": False,
            "accounting_posting_amounts": amount_metadata,
            "accounting_posting_lines": response_lines,
        }
    )
    locked_event.metadata = metadata
    locked_event.save(update_fields=["metadata", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_APPROVED,
        instance=locked_event.amendment,
        performed_by=actor,
        metadata={
            "event": "CONTRACT_RECONTRACT_ACCOUNTING_POSTED",
            "phase": PHASE_6F2,
            "amendment_id": locked_event.amendment_id,
            "recontract_event_id": locked_event.id,
            "financial_impact_preview_id": financial_preview.id,
            "accounting_bridge_posting_id": bridge.id,
            "journal_entry_id": journal_entry.id,
            "journal_entry_no": journal_entry.entry_no,
            "impact_type": locked_event.impact_type,
            "amount": _money(amount),
            "source_record_mutation": False,
            "execution_performed": False,
            "reconciliation_created": False,
        },
    )

    return {
        "posting_record_id": bridge.id,
        "event_id": locked_event.id,
        "financial_impact_preview_id": financial_preview.id,
        "impact_type": locked_event.impact_type,
        "amount": _money(amount),
        "journal_entry": {
            "id": journal_entry.id,
            "entry_no": journal_entry.entry_no,
            "status": journal_entry.status,
        },
        "posting_status": "POSTED",
        "source_record_mutation": False,
        "execution_performed": False,
        "payment_created": False,
        "receipt_created": False,
        "settlement_created": False,
        "reconciliation_created": False,
        "lines": response_lines,
        "amounts": amount_metadata,
    }
