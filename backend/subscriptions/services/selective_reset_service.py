from __future__ import annotations

from typing import Any

from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection, transaction


RESET_CONFIRM_PHRASE = "RESET LOCAL SANDBOX"

RESET_SCOPE_MODELS: dict[str, tuple[str, ...]] = {
    "customers": ("subscriptions.Customer",),
    "partners": ("accounts.User",),
    "subscriptions": ("subscriptions.Subscription", "subscriptions.Batch", "subscriptions.LuckyId"),
    "payments": ("subscriptions.Emi", "subscriptions.Payment", "subscriptions.PaymentReconciliation"),
    "direct_sales": ("billing.DirectSale", "billing.DirectSaleLine", "billing.DirectSaleReturn", "billing.DirectSaleReturnLine"),
    "purchases": ("inventory.PurchaseBill", "inventory.PurchaseBillLine", "inventory.PurchaseOrder", "inventory.GoodsReceipt"),
    "inventory": ("inventory.StockLedger", "inventory.StockAdjustment", "inventory.StockAdjustmentLine", "inventory.StockReservation"),
    "rent_lease": ("subscriptions.RentSubscriptionProfile", "subscriptions.LeaseSubscriptionProfile", "subscriptions.RentLeaseDemand"),
    "deliveries": ("subscriptions.SubscriptionDelivery",),
    "service_desk": ("service_desk.ServiceDeskCase", "service_desk.ServiceDeskCaseLine"),
    "commissions": ("subscriptions.Commission",),
    "payouts": ("subscriptions.CommissionPayoutBatch", "subscriptions.CommissionPayoutLine"),
    "crm": ("crm.CrmLead", "crm.CrmInteraction", "crm.CrmParty"),
}

SETUP_PRESERVE_MODELS: tuple[str, ...] = (
    "subscriptions.BusinessProfile",
    "accounting.BusinessTaxProfile",
    "accounting.ChartOfAccount",
    "accounting.FinanceAccount",
    "accounting.FinanceAccountCoaMapping",
    "accounting.AccountingPostingProfile",
    "branch_control.Branch",
    "branch_control.CashCounter",
    "inventory.Warehouse",
    "inventory.StockLocation",
)


def _is_local():
    env = (getattr(settings, "ENVIRONMENT_NAME", "") or "").lower()
    return bool(settings.DEBUG or env in {"development", "test", "local"})


def _resolve_model(label: str):
    app_label, model_name = label.split(".", 1)
    try:
        return apps.get_model(app_label, model_name)
    except Exception:
        return None


def _model_count(model) -> int:
    return model.objects.count()


def preview_selective_reset(*, scopes: list[str], sandbox_only: bool = False) -> dict[str, Any]:
    counts: list[dict[str, Any]] = []
    total = 0
    for scope in scopes:
        for label in RESET_SCOPE_MODELS.get(scope, ()):
            model = _resolve_model(label)
            if model is None:
                continue
            qs = model.objects.all()
            if sandbox_only and hasattr(model, "name"):
                qs = qs.filter(name__icontains="SANDBOX")
            c = qs.count()
            total += c
            counts.append({"scope": scope, "label": label, "count": c})
    return {"mode": "dry_run", "scopes": scopes, "total_rows": total, "model_counts": counts}


def execute_selective_reset(
    *,
    scopes: list[str],
    preserve_admin_username: str,
    preserve_setup: bool,
    confirm_phrase: str,
    dry_run: bool,
    sandbox_only: bool = False,
):
    if not _is_local():
        raise ValueError("Selective local sandbox reset is disabled outside local/test environments.")
    if (confirm_phrase or "").strip() != RESET_CONFIRM_PHRASE:
        raise ValueError(f"Provide confirm phrase exactly: {RESET_CONFIRM_PHRASE}")

    preview = preview_selective_reset(scopes=scopes, sandbox_only=sandbox_only)
    if dry_run:
        return preview

    User = get_user_model()
    preserved = User.objects.filter(username=preserve_admin_username).first()
    if preserved is None:
        raise ValueError("Preserved admin username not found.")

    labels_to_reset: list[str] = []
    for scope in scopes:
        labels_to_reset.extend(RESET_SCOPE_MODELS.get(scope, ()))
    if preserve_setup:
        labels_to_reset = [label for label in labels_to_reset if label not in SETUP_PRESERVE_MODELS]

    with transaction.atomic():
        for label in labels_to_reset:
            model = _resolve_model(label)
            if model is None:
                continue
            qs = model.objects.all()
            if label == "accounts.User":
                qs = qs.exclude(id=preserved.id)
            if sandbox_only:
                if hasattr(model, "username"):
                    qs = qs.filter(username__startswith="SANDBOX-")
                elif hasattr(model, "name"):
                    qs = qs.filter(name__icontains="SANDBOX")
            if connection.vendor == "postgresql":
                for obj in qs.iterator():
                    obj.delete()
            else:
                qs.delete()

    return {**preview, "mode": "executed", "preserve_admin_username": preserve_admin_username, "preserve_setup": preserve_setup}
