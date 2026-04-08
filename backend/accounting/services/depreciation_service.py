from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone

from accounting.models import (
    MONEY_ZERO,
    Asset,
    AssetDepreciationMethod,
    AssetStatus,
    DepreciationLine,
    DepreciationRun,
    DepreciationRunStatus,
)
from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts


def _money(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


def _annual_rate_for(asset: Asset) -> Decimal:
    category = asset.category
    if category.rate_annual not in {None, ""}:
        return _money(category.rate_annual)
    useful_life_months = max(category.useful_life_months or 1, 1)
    useful_life_years = Decimal(useful_life_months) / Decimal("12")
    if useful_life_years <= 0:
        return Decimal("0.00")
    return (Decimal("100.00") / useful_life_years).quantize(Decimal("0.01"))


def _carrying_value(asset: Asset) -> Decimal:
    return _money(asset.cost_amount) - _money(asset.accumulated_depreciation)


def calculate_asset_depreciation(asset: Asset) -> Decimal:
    depreciable_base = _money(asset.cost_amount) - _money(asset.salvage_value)
    if depreciable_base <= MONEY_ZERO:
        return MONEY_ZERO

    carrying_value = _carrying_value(asset)
    remaining_value = carrying_value - _money(asset.salvage_value)
    if remaining_value <= MONEY_ZERO:
        return MONEY_ZERO

    if asset.category.method == AssetDepreciationMethod.WDM:
        annual_rate = _annual_rate_for(asset)
        depreciation_amount = (
            carrying_value * annual_rate / Decimal("100.00") / Decimal("12.00")
        )
    else:
        useful_life_months = max(asset.category.useful_life_months or 1, 1)
        depreciation_amount = depreciable_base / Decimal(useful_life_months)

    depreciation_amount = depreciation_amount.quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    return min(max(depreciation_amount, MONEY_ZERO), remaining_value)


@transaction.atomic
def run_depreciation(*, run_id: int, performed_by):
    depreciation_run = (
        DepreciationRun.objects.select_for_update()
        .select_related("created_by")
        .prefetch_related("lines")
        .get(pk=run_id)
    )
    if depreciation_run.status == DepreciationRunStatus.POSTED:
        raise ValueError("Posted depreciation runs cannot be recalculated.")
    if depreciation_run.status == DepreciationRunStatus.CANCELLED:
        raise ValueError("Cancelled depreciation runs cannot be recalculated.")

    assets = list(
        Asset.objects.select_related("category")
        .filter(
            status=AssetStatus.ACTIVE,
            in_service_date__lte=depreciation_run.period_end,
        )
        .order_by("asset_code", "id")
    )
    created_count = 0
    existing_count = 0
    for asset in assets:
        amount = calculate_asset_depreciation(asset)
        if amount <= MONEY_ZERO:
            continue
        _, created = DepreciationLine.objects.update_or_create(
            run=depreciation_run,
            asset=asset,
            defaults={"depreciation_amount": amount},
        )
        created_count += 1 if created else 0
        existing_count += 0 if created else 1

    depreciation_run.status = DepreciationRunStatus.RUNNING
    depreciation_run.executed_at = timezone.now()
    depreciation_run.save(update_fields=["status", "executed_at", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_DEPRECIATION_RUN_EXECUTED",
        instance=depreciation_run,
        performed_by=performed_by,
        metadata={
            "run_id": depreciation_run.id,
            "run_code": depreciation_run.run_code,
            "created_count": created_count,
            "existing_count": existing_count,
        },
    )
    return depreciation_run, True


@transaction.atomic
def post_depreciation_run(*, run_id: int, posted_by):
    depreciation_run = (
        DepreciationRun.objects.select_for_update()
        .prefetch_related("lines", "lines__asset", "lines__asset__category")
        .get(pk=run_id)
    )
    if depreciation_run.status == DepreciationRunStatus.POSTED:
        return depreciation_run, False
    if depreciation_run.status not in {DepreciationRunStatus.RUNNING, DepreciationRunStatus.DRAFT}:
        raise ValueError("Only draft or running depreciation runs can be posted.")

    accounts = ensure_phase3_system_accounts()
    posted_count = 0
    for line in depreciation_run.lines.select_related("asset").all():
        if line.journal_entry_id:
            continue
        posted_journal, _ = post_bridge_entry(
            source_instance=line,
            purpose="ASSET_DEPRECIATION",
            entry_date=depreciation_run.period_end,
            memo=f"Depreciation {depreciation_run.run_code} {line.asset.asset_code}",
            lines=[
                {
                    "chart_account": accounts["DEPRECIATION_EXPENSE"],
                    "description": line.asset.asset_code,
                    "debit_amount": line.depreciation_amount,
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": accounts["ACCUMULATED_DEPRECIATION"],
                    "description": line.asset.asset_code,
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": line.depreciation_amount,
                },
            ],
            posted_by=posted_by,
        )
        line.journal_entry = posted_journal
        line.save(update_fields=["journal_entry", "updated_at"])
        asset = line.asset
        asset.accumulated_depreciation = _money(asset.accumulated_depreciation) + _money(
            line.depreciation_amount
        )
        asset.save(update_fields=["accumulated_depreciation", "updated_at"])
        posted_count += 1

    depreciation_run.status = DepreciationRunStatus.POSTED
    depreciation_run.posted_at = timezone.now()
    depreciation_run.save(update_fields=["status", "posted_at", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_DEPRECIATION_RUN_POSTED",
        instance=depreciation_run,
        performed_by=posted_by,
        metadata={
            "run_id": depreciation_run.id,
            "run_code": depreciation_run.run_code,
            "posted_count": posted_count,
        },
    )
    return depreciation_run, True


@transaction.atomic
def cancel_depreciation_run(*, run_id: int, performed_by, reason: str = ""):
    depreciation_run = DepreciationRun.objects.select_for_update().get(pk=run_id)
    if depreciation_run.status == DepreciationRunStatus.CANCELLED:
        return depreciation_run, False
    if depreciation_run.status == DepreciationRunStatus.POSTED:
        raise ValueError("Posted depreciation runs cannot be cancelled.")

    depreciation_run.status = DepreciationRunStatus.CANCELLED
    depreciation_run.save(update_fields=["status", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_DEPRECIATION_RUN_CANCELLED",
        instance=depreciation_run,
        performed_by=performed_by,
        metadata={
            "run_id": depreciation_run.id,
            "run_code": depreciation_run.run_code,
            "reason": (reason or "").strip(),
        },
    )
    return depreciation_run, True
