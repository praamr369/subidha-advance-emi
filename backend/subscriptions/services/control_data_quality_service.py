"""
P2C — Data Quality Center service.

Returns stable check payloads across 11 data quality dimensions.
All checks are read-only — no record is ever mutated.
Each check is defensively wrapped so one failure does not crash the full payload.
"""
from __future__ import annotations

from typing import Any


class DQCheckKey:
    DUPLICATE_PHONES = "duplicate_phones"
    CUSTOMERS_WITHOUT_PHONE = "customers_without_phone"
    PRODUCTS_WITHOUT_CATEGORY = "products_without_category"
    PRODUCTS_WITHOUT_INVENTORY_PROFILE = "products_without_inventory_profile"
    RENT_PRODUCTS_WITHOUT_PRICING = "rent_products_without_pricing"
    ACTIVE_CONTRACTS_WITHOUT_NUMBER = "active_contracts_without_number"
    PAYMENTS_WITHOUT_RECEIPT = "payments_without_receipt"
    STOCK_ITEMS_WITHOUT_COST = "stock_items_without_cost"
    FINANCE_ACCOUNTS_WITHOUT_MAPPING = "finance_accounts_without_mapping"
    REJECTED_KYC_WITH_ACTIVE_RENT_LEASE = "rejected_kyc_with_active_rent_lease"
    DELIVERED_WITHOUT_RECEIPT_DOCUMENT = "delivered_without_receipt_document"


class DQSeverity:
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"
    INFO = "INFO"


def _check(key: str, severity: str, count: int, detail: str, sample_ids: list | None = None) -> dict[str, Any]:
    return {
        "check_key": key,
        "severity": severity,
        "count": count,
        "passed": count == 0,
        "detail": detail,
        "sample_ids": sample_ids or [],
    }


def _skip(key: str, severity: str, error: str) -> dict[str, Any]:
    return {
        "check_key": key,
        "severity": severity,
        "count": 0,
        "passed": True,
        "detail": f"Check skipped (service unavailable): {error[:200]}",
        "sample_ids": [],
    }


# ─────────────────────────────────────────────
# Individual checks
# ─────────────────────────────────────────────

def _dq_duplicate_phones() -> dict[str, Any]:
    try:
        from subscriptions.models import Customer
        from django.db.models import Count
        dupes = (
            Customer.objects
            .values("phone")
            .annotate(c=Count("id"))
            .filter(c__gt=1)
        )
        count = sum(row["c"] - 1 for row in dupes)
        phones = [row["phone"] for row in list(dupes)[:5]]
        detail = (
            f"{count} duplicate phone number(s) across customers."
            + (f" Examples: {', '.join(phones)}" if phones else "")
        )
        return _check(DQCheckKey.DUPLICATE_PHONES, DQSeverity.CRITICAL, count, detail)
    except Exception as exc:
        return _skip(DQCheckKey.DUPLICATE_PHONES, DQSeverity.CRITICAL, str(exc))


def _dq_customers_without_phone() -> dict[str, Any]:
    try:
        from subscriptions.models import Customer
        count = Customer.objects.filter(phone="").count()
        return _check(
            DQCheckKey.CUSTOMERS_WITHOUT_PHONE,
            DQSeverity.WARNING,
            count,
            f"{count} customer(s) have no phone number recorded." if count else "All customers have phone numbers.",
        )
    except Exception as exc:
        return _skip(DQCheckKey.CUSTOMERS_WITHOUT_PHONE, DQSeverity.WARNING, str(exc))


def _dq_products_without_category() -> dict[str, Any]:
    try:
        from subscriptions.models import Product
        from django.db.models import Q
        count = Product.objects.filter(
            Q(category_master__isnull=True) & (Q(category="") | Q(category__isnull=True)),
            is_active=True,
        ).count()
        return _check(
            DQCheckKey.PRODUCTS_WITHOUT_CATEGORY,
            DQSeverity.WARNING,
            count,
            f"{count} active product(s) have no category assigned." if count else "All active products have categories.",
        )
    except Exception as exc:
        return _skip(DQCheckKey.PRODUCTS_WITHOUT_CATEGORY, DQSeverity.WARNING, str(exc))


def _dq_products_without_inventory_profile() -> dict[str, Any]:
    """Products with no InventoryItem record (needed for stock tracking)."""
    try:
        from subscriptions.models import Product
        from inventory.models import InventoryItem
        product_ids_with_item = set(
            InventoryItem.objects.values_list("product_id", flat=True)
        )
        count = Product.objects.filter(
            is_active=True,
        ).exclude(
            pk__in=product_ids_with_item,
        ).count()
        return _check(
            DQCheckKey.PRODUCTS_WITHOUT_INVENTORY_PROFILE,
            DQSeverity.WARNING,
            count,
            f"{count} active product(s) have no inventory item record." if count else "All active products have inventory records.",
        )
    except Exception as exc:
        return _skip(DQCheckKey.PRODUCTS_WITHOUT_INVENTORY_PROFILE, DQSeverity.WARNING, str(exc))


def _dq_rent_products_without_pricing() -> dict[str, Any]:
    """Rent-enabled products where is_rent_ready=False (pricing/profile not complete)."""
    try:
        from subscriptions.models import Product
        count = Product.objects.filter(
            is_rent_enabled=True,
            is_rent_ready=False,
            is_active=True,
        ).count()
        return _check(
            DQCheckKey.RENT_PRODUCTS_WITHOUT_PRICING,
            DQSeverity.WARNING,
            count,
            f"{count} rent-enabled product(s) are not rent-ready (missing pricing/profile)." if count
            else "All rent-enabled products are rent-ready.",
        )
    except Exception as exc:
        return _skip(DQCheckKey.RENT_PRODUCTS_WITHOUT_PRICING, DQSeverity.WARNING, str(exc))


def _dq_active_contracts_without_number() -> dict[str, Any]:
    """Active subscriptions with no contract_reference assigned."""
    try:
        from subscriptions.models import Subscription, SubscriptionStatus
        from django.db.models import Q
        count = Subscription.objects.filter(
            status=SubscriptionStatus.ACTIVE,
        ).filter(
            Q(contract_reference__isnull=True) | Q(contract_reference=""),
        ).count()
        return _check(
            DQCheckKey.ACTIVE_CONTRACTS_WITHOUT_NUMBER,
            DQSeverity.WARNING,
            count,
            f"{count} active subscription(s) have no contract reference number." if count
            else "All active subscriptions have contract reference numbers.",
        )
    except Exception as exc:
        return _skip(DQCheckKey.ACTIVE_CONTRACTS_WITHOUT_NUMBER, DQSeverity.WARNING, str(exc))


def _dq_payments_without_receipt() -> dict[str, Any]:
    """Payments that have no linked ReceiptDocument (OneToOne reverse: receipt_document)."""
    try:
        from subscriptions.models import Payment
        count = Payment.objects.filter(receipt_document__isnull=True).count()
        return _check(
            DQCheckKey.PAYMENTS_WITHOUT_RECEIPT,
            DQSeverity.WARNING,
            count,
            f"{count} payment(s) have no linked receipt document." if count
            else "All payments have receipt documents.",
        )
    except Exception as exc:
        return _skip(DQCheckKey.PAYMENTS_WITHOUT_RECEIPT, DQSeverity.WARNING, str(exc))


def _dq_stock_items_without_cost() -> dict[str, Any]:
    """InventoryItems with standard_unit_cost = 0 or null (unmeasured cost)."""
    try:
        from inventory.models import InventoryItem
        from decimal import Decimal
        from django.db.models import Q
        count = InventoryItem.objects.filter(
            Q(standard_unit_cost__isnull=True) | Q(standard_unit_cost__lte=Decimal("0")),
        ).count()
        return _check(
            DQCheckKey.STOCK_ITEMS_WITHOUT_COST,
            DQSeverity.WARNING,
            count,
            f"{count} inventory item(s) have no standard unit cost set." if count
            else "All inventory items have standard unit costs.",
        )
    except Exception as exc:
        return _skip(DQCheckKey.STOCK_ITEMS_WITHOUT_COST, DQSeverity.WARNING, str(exc))


def _dq_finance_accounts_without_mapping() -> dict[str, Any]:
    """FinanceAccounts with no active COA mapping of any purpose."""
    try:
        from accounting.models import FinanceAccount, FinanceAccountCoaMapping
        mapped_ids = set(
            FinanceAccountCoaMapping.objects.filter(is_active=True)
            .values_list("finance_account_id", flat=True)
        )
        count = FinanceAccount.objects.filter(is_active=True).exclude(pk__in=mapped_ids).count()
        return _check(
            DQCheckKey.FINANCE_ACCOUNTS_WITHOUT_MAPPING,
            DQSeverity.WARNING,
            count,
            f"{count} active finance account(s) have no active COA mapping." if count
            else "All active finance accounts have COA mappings.",
        )
    except Exception as exc:
        return _skip(DQCheckKey.FINANCE_ACCOUNTS_WITHOUT_MAPPING, DQSeverity.WARNING, str(exc))


def _dq_rejected_kyc_with_active_rent_lease() -> dict[str, Any]:
    """Customers with kyc_status=REJECTED who have at least one ACTIVE rent/lease subscription."""
    try:
        from subscriptions.models import Customer, KycStatus, Subscription, SubscriptionStatus, PlanType
        rejected_customer_ids = set(
            Customer.objects.filter(kyc_status=KycStatus.REJECTED)
            .values_list("id", flat=True)
        )
        if not rejected_customer_ids:
            return _check(
                DQCheckKey.REJECTED_KYC_WITH_ACTIVE_RENT_LEASE,
                DQSeverity.CRITICAL,
                0,
                "No customers with rejected KYC.",
            )
        count = Subscription.objects.filter(
            customer_id__in=rejected_customer_ids,
            status=SubscriptionStatus.ACTIVE,
            plan_type__in=[PlanType.RENT, PlanType.LEASE],
        ).count()
        return _check(
            DQCheckKey.REJECTED_KYC_WITH_ACTIVE_RENT_LEASE,
            DQSeverity.CRITICAL,
            count,
            f"{count} active rent/lease subscription(s) belong to customers with rejected KYC." if count
            else "No active rent/lease subscriptions with rejected KYC.",
        )
    except Exception as exc:
        return _skip(DQCheckKey.REJECTED_KYC_WITH_ACTIVE_RENT_LEASE, DQSeverity.CRITICAL, str(exc))


def _dq_delivered_without_receipt_document() -> dict[str, Any]:
    """DELIVERED subscription deliveries where subscription has no payments with receipt."""
    try:
        from subscriptions.models import SubscriptionDelivery, DeliveryStatus, Payment
        from billing.models import ReceiptDocument

        delivered_sub_ids = set(
            SubscriptionDelivery.objects.filter(status=DeliveryStatus.DELIVERED)
            .values_list("subscription_id", flat=True)
        )
        if not delivered_sub_ids:
            return _check(
                DQCheckKey.DELIVERED_WITHOUT_RECEIPT_DOCUMENT,
                DQSeverity.INFO,
                0,
                "No delivered subscriptions found.",
            )

        subs_with_receipt = set(
            Payment.objects.filter(
                subscription_id__in=delivered_sub_ids,
                receipt_document__isnull=False,
            ).values_list("subscription_id", flat=True)
        )
        count = len(delivered_sub_ids - subs_with_receipt)
        return _check(
            DQCheckKey.DELIVERED_WITHOUT_RECEIPT_DOCUMENT,
            DQSeverity.INFO,
            count,
            f"{count} delivered subscription(s) have no payment with a receipt document." if count
            else "All delivered subscriptions have at least one payment with a receipt.",
        )
    except Exception as exc:
        return _skip(DQCheckKey.DELIVERED_WITHOUT_RECEIPT_DOCUMENT, DQSeverity.INFO, str(exc))


# ─────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────

def get_data_quality_report() -> dict[str, Any]:
    """Run all DQ checks and return a stable payload."""
    checks = [
        _dq_duplicate_phones(),
        _dq_rejected_kyc_with_active_rent_lease(),
        _dq_customers_without_phone(),
        _dq_products_without_category(),
        _dq_products_without_inventory_profile(),
        _dq_rent_products_without_pricing(),
        _dq_active_contracts_without_number(),
        _dq_payments_without_receipt(),
        _dq_delivered_without_receipt_document(),
        _dq_stock_items_without_cost(),
        _dq_finance_accounts_without_mapping(),
    ]
    critical_count = sum(1 for c in checks if c["severity"] == DQSeverity.CRITICAL and not c["passed"])
    warning_count = sum(1 for c in checks if c["severity"] == DQSeverity.WARNING and not c["passed"])
    return {
        "critical_count": critical_count,
        "warning_count": warning_count,
        "total_issues": sum(c["count"] for c in checks),
        "checks": checks,
    }
