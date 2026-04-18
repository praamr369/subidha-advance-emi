from __future__ import annotations

from django.db import transaction

from accounting.models import AccountingPeriod, ChartOfAccount, DocumentSequence, FinanceAccount
from accounts.models import User, UserRole
from branch_control.models import Branch, BranchStatus, CashCounter
from inventory.models import InventoryItem, StockLocation
from subscriptions.models import Batch, Customer, Payment, Product, Subscription
from subscriptions.models_business_setup import BusinessProfile


def get_active_business_profile():
    return BusinessProfile.objects.filter(is_active=True).order_by("-created_at", "-id").first()


@transaction.atomic
def upsert_business_profile(*, data: dict, instance: BusinessProfile | None = None) -> BusinessProfile:
    payload = dict(data)
    payload.setdefault("is_active", True)

    if instance is None:
        profile = BusinessProfile(**payload)
    else:
        for key, value in payload.items():
            setattr(instance, key, value)
        profile = instance

    profile.save()

    if profile.is_active:
        BusinessProfile.objects.filter(is_active=True).exclude(pk=profile.pk).update(is_active=False)

    return profile


def get_reset_preview():
    return {
        "business_profiles": BusinessProfile.objects.count(),
        "users_total": User.objects.count(),
        "users_admin": User.objects.filter(role=UserRole.ADMIN).count(),
        "users_cashier": User.objects.filter(role=UserRole.CASHIER).count(),
        "users_partner": User.objects.filter(role=UserRole.PARTNER).count(),
        "users_customer": User.objects.filter(role=UserRole.CUSTOMER).count(),
        "branches_total": Branch.objects.count(),
        "branches_active": Branch.objects.filter(status=BranchStatus.ACTIVE).count(),
        "cash_counters_total": CashCounter.objects.count(),
        "cash_counters_active": CashCounter.objects.filter(is_active=True).count(),
        "accounting_chart_accounts": ChartOfAccount.objects.count(),
        "accounting_finance_accounts": FinanceAccount.objects.count(),
        "accounting_periods": AccountingPeriod.objects.count(),
        "accounting_document_sequences": DocumentSequence.objects.count(),
        "products": Product.objects.count(),
        "batches": Batch.objects.count(),
        "customers": Customer.objects.count(),
        "subscriptions": Subscription.objects.count(),
        "payments": Payment.objects.count(),
        "inventory_stock_locations": StockLocation.objects.count(),
        "inventory_items": InventoryItem.objects.count(),
    }
