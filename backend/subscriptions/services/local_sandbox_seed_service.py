from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from accounts.models import UserRole
from billing.models import DirectSale
from inventory.models import Warehouse
from subscriptions.models import (
    Batch,
    Customer,
    Emi,
    EmiStatus,
    LuckyDraw,
    LuckyId,
    LuckyIdStatus,
    Payment,
    PaymentMethod,
    Product,
    ProductCategoryMaster,
    Subscription,
    SubscriptionStatus,
)
from tests.helpers import create_batch, create_lucky_id, create_product, create_subscription


def _assert_local_only():
    env = (getattr(settings, "ENVIRONMENT_NAME", "") or "").lower()
    if not (settings.DEBUG or env in {"development", "test", "local"}):
        raise ValueError("Sandbox seed is disabled outside local/test environments.")


def seed_local_sandbox(*, performed_by):
    _assert_local_only()
    User = get_user_model()

    with transaction.atomic():
        partner, _ = User.objects.get_or_create(
            username="SANDBOX-PARTNER",
            defaults={"role": UserRole.PARTNER, "is_active": True},
        )
        cashier, _ = User.objects.get_or_create(
            username="SANDBOX-CASHIER",
            defaults={"role": UserRole.CASHIER, "is_active": True, "is_staff": True},
        )
        customer_user, _ = User.objects.get_or_create(
            username="SANDBOX-CUSTOMER",
            defaults={"role": UserRole.CUSTOMER, "is_active": True},
        )
        customer, _ = Customer.objects.get_or_create(
            user=customer_user,
            defaults={"name": "DEMO CUSTOMER", "phone": "LOCAL-9000000000", "kyc_status": "PENDING"},
        )

        category, _ = ProductCategoryMaster.objects.get_or_create(name="SANDBOX-CAT", defaults={"is_active": True})
        product = create_product(name="DEMO-PRODUCT", product_code="SANDBOX-PROD-001", base_price=Decimal("15000.00"))
        product.category = category.name
        product.save(update_fields=["category"])

        batch = create_batch(batch_code="SANDBOX-BATCH-001")
        lucky = create_lucky_id(batch=batch, lucky_number=999, status=LuckyIdStatus.AVAILABLE)
        subscription = create_subscription(customer=customer, product=product, batch=batch, lucky_id=lucky, partner=partner)

        emi_paid = Emi.objects.create(subscription=subscription, month_no=1, due_date=timezone.localdate(), amount=Decimal("1000.00"), status=EmiStatus.PAID)
        emi_overdue = Emi.objects.create(subscription=subscription, month_no=2, due_date=timezone.localdate() - timedelta(days=30), amount=Decimal("1000.00"), status=EmiStatus.PENDING)
        Payment.objects.create(subscription=subscription, emi=emi_paid, amount=Decimal("1000.00"), payment_date=timezone.localdate(), method=PaymentMethod.CASH)

        advanced = {"direct_sales_created": 0, "purchase_bills_created": 0, "service_tickets_created": 0}
        doc_series = getattr(settings, "DIRECT_SALE_DEFAULT_DOC_SERIES_ID", None)
        if doc_series:
            try:
                for sale_no, status, received in (
                    ("SANDBOX-DS-PAID-001", "INVOICED", Decimal("5000.00")),
                    ("SANDBOX-DS-OUT-001", "INVOICED", Decimal("1000.00")),
                    ("SANDBOX-DS-CANCEL-001", "CANCELLED", Decimal("0.00")),
                ):
                    DirectSale.objects.get_or_create(
                        sale_no=sale_no,
                        defaults={
                            "sale_date": timezone.localdate(),
                            "financial_year": f"{timezone.localdate().year}-{str(timezone.localdate().year + 1)[-2:]}",
                            "doc_series_id": int(doc_series),
                            "customer": customer,
                            "status": status,
                            "grand_total": Decimal("5000.00"),
                            "received_total": received,
                            "balance_total": Decimal("5000.00") - received,
                        },
                    )
                    advanced["direct_sales_created"] += 1
            except Exception:
                pass

        from inventory.models import StockLocation
        location = StockLocation.objects.order_by("id").first()
        if location:
            Warehouse.objects.get_or_create(code="SANDBOX-WH-001", defaults={"name": "SANDBOX-WH", "stock_location": location, "is_active": True})

        LuckyDraw.objects.get_or_create(batch=batch, draw_month=timezone.localdate().replace(day=1), defaults={"is_revealed": False})

    return {
        "seeded": True,
        "customer_id": customer.id,
        "subscription_id": subscription.id,
        "emi_paid_id": emi_paid.id,
        "emi_overdue_id": emi_overdue.id,
        "partner_username": partner.username,
        "cashier_username": cashier.username,
        "advanced": advanced,
    }
