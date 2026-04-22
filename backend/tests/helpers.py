from decimal import Decimal
from datetime import date

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
)
from accounts.models import User, UserRole
from subscriptions.models import (
    Batch,
    Customer,
    DeliveryStatus,
    Emi,
    EmiStatus,
    LuckyId,
    LuckyIdStatus,
    PlanType,
    Product,
    Subscription,
    SubscriptionDelivery,
    SubscriptionStatus,
)


def create_user(
    *,
    username: str,
    password: str = "TestPass123!",
    role: str = UserRole.CUSTOMER,
    phone: str = "",
    email: str = "",
    first_name: str = "",
    is_staff: bool = False,
    is_superuser: bool = False,
):
    ensure_default_payment_collection_accounts()
    return User.objects.create_user(
        username=username,
        password=password,
        role=role,
        phone=phone,
        email=email,
        first_name=first_name,
        is_staff=is_staff,
        is_superuser=is_superuser,
    )


def create_admin_user(username="admin_test", phone="9000000001", email=""):
    return create_user(
        username=username,
        password="AdminPass123!",
        role=UserRole.ADMIN,
        phone=phone,
        email=email,
        first_name="Admin",
        is_staff=True,
    )


def create_partner_user(username="partner_test", phone="9000000002", email=""):
    return create_user(
        username=username,
        password="PartnerPass123!",
        role=UserRole.PARTNER,
        phone=phone,
        email=email,
        first_name="Partner",
    )


def create_cashier_user(username="cashier_test", phone="9000000004", email=""):
    return create_user(
        username=username,
        password="CashierPass123!",
        role=UserRole.CASHIER,
        phone=phone,
        email=email,
        first_name="Cashier",
        is_staff=True,
    )


def create_customer_user(username="customer_test", phone="9000000003", email=""):
    return create_user(
        username=username,
        password="CustomerPass123!",
        role=UserRole.CUSTOMER,
        phone=phone,
        email=email,
        first_name="Customer",
    )


def create_customer_profile(*, user=None, name="Test Customer", phone="9000000003", email=""):
    if user is None:
        user = create_customer_user(phone=phone, email=email)
    return Customer.objects.create(
        user=user,
        name=name,
        phone=phone,
        kyc_status="PENDING",
    )


def create_product(
    *,
    name="Test Product",
    product_code="TP-001",
    base_price=Decimal("15000.00"),
):
    return Product.objects.create(
        name=name,
        product_code=product_code,
        base_price=base_price,
        category="Electronics",
        subcategory="OTG",
        description="Test product",
        is_active=True,
        is_emi_enabled=True,
        is_rent_enabled=False,
        is_lease_enabled=False,
    )


def create_batch(
    *,
    batch_code="APRIL2026",
    duration_months=15,
    total_slots=100,
    draw_day=5,
    start_date=date(2026, 3, 1),
    status="OPEN",
):
    return Batch.objects.create(
        batch_code=batch_code,
        total_slots=total_slots,
        duration_months=duration_months,
        draw_day=draw_day,
        start_date=start_date,
        status=status,
    )


def create_lucky_id(*, batch, lucky_number=1, status=LuckyIdStatus.AVAILABLE):
    existing = LuckyId.objects.filter(batch=batch, lucky_number=lucky_number).first()
    if existing:
        if existing.status != status:
            existing.status = status
            existing.save(update_fields=["status"])
        return existing

    return LuckyId.objects.create(
        batch=batch,
        lucky_number=lucky_number,
        status=status,
    )


def create_subscription(
    *,
    customer,
    product,
    batch,
    lucky_id,
    partner=None,
    total_amount=Decimal("15000.00"),
    monthly_amount=Decimal("1000.00"),
    tenure_months=15,
    start_date=date(2026, 3, 1),
    status=SubscriptionStatus.ACTIVE,
):
    return Subscription.objects.create(
        customer=customer,
        product=product,
        batch=batch,
        lucky_id=lucky_id,
        partner=partner,
        plan_type=PlanType.EMI,
        tenure_months=tenure_months,
        start_date=start_date,
        total_amount=total_amount,
        monthly_amount=monthly_amount,
        status=status,
        waived_amount=Decimal("0.00"),
    )


def create_emi(
    *,
    subscription,
    month_no=1,
    amount=Decimal("1000.00"),
    due_date=date(2026, 3, 7),
    status=EmiStatus.PENDING,
):
    return Emi.objects.create(
        subscription=subscription,
        month_no=month_no,
        due_date=due_date,
        amount=amount,
        status=status,
    )


def create_delivery(
    *,
    subscription,
    status=DeliveryStatus.PENDING,
    delivery_reference="DLV-TEST-001",
    scheduled_date=None,
    receiver_name="Receiver",
    receiver_phone="9000000000",
    delivery_address_snapshot="Test Address",
    notes="",
    failure_reason="",
    created_by=None,
    updated_by=None,
):
    payload = {
        "subscription": subscription,
        "status": status,
        "delivery_reference": delivery_reference,
        "receiver_name": receiver_name,
        "receiver_phone": receiver_phone,
        "delivery_address_snapshot": delivery_address_snapshot,
        "notes": notes,
        "failure_reason": failure_reason,
        "created_by": created_by,
        "updated_by": updated_by,
    }
    if scheduled_date is not None:
        payload["scheduled_date"] = scheduled_date

    if status == DeliveryStatus.DISPATCHED:
        from django.utils import timezone
        payload["dispatched_at"] = timezone.now()
    elif status == DeliveryStatus.OUT_FOR_DELIVERY:
        from django.utils import timezone
        payload["out_for_delivery_at"] = timezone.now()
    elif status == DeliveryStatus.DELIVERED:
        from django.utils import timezone
        payload["delivered_at"] = timezone.now()
    elif status == DeliveryStatus.FAILED:
        from django.utils import timezone
        payload["failed_at"] = timezone.now()
        payload["failure_reason"] = failure_reason or "Delivery failed"
    elif status == DeliveryStatus.CANCELLED:
        from django.utils import timezone
        payload["cancelled_at"] = timezone.now()
        payload["failure_reason"] = failure_reason or "Delivery cancelled"
    elif status == DeliveryStatus.RETURN_REQUESTED:
        from django.utils import timezone
        payload["return_requested_at"] = timezone.now()
    elif status == DeliveryStatus.RETURNED:
        from django.utils import timezone
        payload["returned_at"] = timezone.now()

    return SubscriptionDelivery.objects.create(**payload)


def create_finance_account(
    *,
    code="TEST-FIN-001",
    name="Test Finance Account",
    kind="CASH",
    opening_balance=Decimal("0.00"),
):
    return FinanceAccount.objects.create(
        name=name,
        kind=kind,
        is_active=True,
        chart_account=ChartOfAccount.objects.create(
            code=code,
            name=f"{name} Ledger",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        ),
        opening_balance=opening_balance,
    )


def create_payment_collection_finance_account(
    *,
    code="TEST-COLLECT-FIN-001",
    name="Test Collection Finance Account",
    kind="CASH",
    opening_balance=Decimal("0.00"),
):
    """
    Shared test helper for a normal operational collection account.

    Keeps finance hardening expectations explicit by always creating an active
    finance account backed by an active posting-capable chart account.
    """
    return create_finance_account(
        code=code,
        name=name,
        kind=kind,
        opening_balance=opening_balance,
    )


def ensure_default_payment_collection_accounts():
    """
    Provide stable operational fallback accounts for legacy test fixtures.

    Production logic still enforces finance-account selection whenever no
    operational account can be resolved. These defaults only keep old test
    setups aligned with the hardened collection path.
    """
    defaults = (
        ("TEST-DEFAULT-CASH", "Default Test Cash Account", FinanceAccountKind.CASH),
        ("TEST-DEFAULT-BANK", "Default Test Bank Account", FinanceAccountKind.BANK),
        ("TEST-DEFAULT-UPI", "Default Test UPI Account", FinanceAccountKind.UPI),
    )
    accounts = {}
    for code, name, kind in defaults:
        chart_account, _ = ChartOfAccount.objects.get_or_create(
            code=code,
            defaults={
                "name": f"{name} Ledger",
                "account_type": ChartOfAccountType.ASSET,
                "is_active": True,
                "allow_manual_posting": True,
            },
        )
        updates = []
        if not chart_account.is_active:
            chart_account.is_active = True
            updates.append("is_active")
        if not chart_account.allow_manual_posting:
            chart_account.allow_manual_posting = True
            updates.append("allow_manual_posting")
        if updates:
            chart_account.save(update_fields=updates)

        finance_account, _ = FinanceAccount.objects.get_or_create(
            name=name,
            defaults={
                "kind": kind,
                "chart_account": chart_account,
                "opening_balance": Decimal("0.00"),
                "is_active": True,
            },
        )
        finance_updates = []
        if finance_account.kind != kind:
            finance_account.kind = kind
            finance_updates.append("kind")
        if finance_account.chart_account_id != chart_account.id:
            finance_account.chart_account = chart_account
            finance_updates.append("chart_account")
        if not finance_account.is_active:
            finance_account.is_active = True
            finance_updates.append("is_active")
        if finance_updates:
            finance_account.save(update_fields=finance_updates)
        accounts[kind] = finance_account
    return accounts
