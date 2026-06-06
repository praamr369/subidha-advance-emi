import logging
from contextlib import contextmanager
from datetime import date
from decimal import Decimal

from accounting.models import (
    AccountingPeriod,
    AccountingPeriodStatus,
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
    FinancialYear,
)
from accounting.services.period_service import financial_year_bounds, financial_year_code
from accounting.services.document_sequence_service import DocumentType, upsert_numbering_profile
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


def ensure_test_financial_year(reference_date: date | None = None, *, performed_by=None):
    """
    Ensure one active test financial year covers the reference date.

    This mirrors production's single-active-FY invariant instead of weakening
    posting validation in tests.
    """
    reference_date = reference_date or date.today()
    fy_start, fy_end = financial_year_bounds(reference_date)
    fy_code = financial_year_code(reference_date)
    FinancialYear.objects.filter(is_active=True).exclude(code=fy_code).update(
        is_active=False,
        activated_by=None,
    )
    financial_year, _ = FinancialYear.objects.get_or_create(
        code=fy_code,
        defaults={
            "name": f"FY {fy_start.year}-{str(fy_end.year)[-2:]}",
            "start_date": fy_start,
            "end_date": fy_end,
            "is_active": True,
            "activated_by": performed_by,
        },
    )
    updates = []
    if financial_year.start_date != fy_start:
        financial_year.start_date = fy_start
        updates.append("start_date")
    if financial_year.end_date != fy_end:
        financial_year.end_date = fy_end
        updates.append("end_date")
    if not financial_year.is_active:
        financial_year.is_active = True
        updates.append("is_active")
    if performed_by is not None and financial_year.activated_by_id != performed_by.id:
        financial_year.activated_by = performed_by
        updates.append("activated_by")
    if updates:
        financial_year.save(update_fields=[*updates, "updated_at"])
    return financial_year


def ensure_test_open_accounting_period(reference_date: date | None = None, *, performed_by=None):
    reference_date = reference_date or date.today()
    financial_year = ensure_test_financial_year(reference_date, performed_by=performed_by)
    fy_code = financial_year.code
    fy_end = financial_year.end_date

    period_start = date(reference_date.year, reference_date.month, 1)
    if reference_date.month == 12:
        next_month = date(reference_date.year + 1, 1, 1)
    else:
        next_month = date(reference_date.year, reference_date.month + 1, 1)
    period_end = min(next_month - date.resolution, fy_end)
    period, _ = AccountingPeriod.objects.get_or_create(
        start_date=period_start,
        end_date=period_end,
        defaults={
            "financial_year": financial_year,
            "code": f"{fy_code}-{reference_date.year}{reference_date.month:02d}",
            "label": reference_date.strftime("%B %Y"),
            "name": reference_date.strftime("%B %Y"),
            "status": AccountingPeriodStatus.OPEN,
        },
    )
    updates = []
    if period.financial_year_id != financial_year.id:
        period.financial_year = financial_year
        updates.append("financial_year")
    if period.status != AccountingPeriodStatus.OPEN:
        period.status = AccountingPeriodStatus.OPEN
        updates.append("status")
    if period.is_locked:
        period.is_locked = False
        updates.append("is_locked")
    if period.locked_at is not None:
        period.locked_at = None
        updates.append("locked_at")
    if period.locked_by_id is not None:
        period.locked_by = None
        updates.append("locked_by")
    if period.lock_reason:
        period.lock_reason = ""
        updates.append("lock_reason")
    if updates:
        period.save(update_fields=[*updates, "updated_at"])
    return financial_year, period


def ensure_open_accounting_period_for_date(reference_date: date, *, performed_by=None):
    return ensure_test_open_accounting_period(reference_date, performed_by=performed_by)


def ensure_test_journal_numbering_profile(reference_date: date | None = None, *, performed_by=None):
    reference_date = reference_date or date.today()
    ensure_test_open_accounting_period(reference_date, performed_by=performed_by)
    return upsert_numbering_profile(
        document_type=DocumentType.JOURNAL_ENTRY,
        reference_date=reference_date,
        performed_by=performed_by,
    )


def ensure_test_accounting_posting_prerequisites(reference_date: date | None = None, *, posting_date: date | None = None, performed_by=None):
    posting_date = posting_date or reference_date or date.today()
    financial_year, period = ensure_test_open_accounting_period(posting_date, performed_by=performed_by)
    numbering_profile = ensure_test_journal_numbering_profile(posting_date, performed_by=performed_by)
    return {
        "financial_year": financial_year,
        "accounting_period": period,
        "journal_numbering_profile": numbering_profile,
    }


def ensure_journal_numbering_profile_for_date(reference_date: date, *, performed_by=None):
    return ensure_test_journal_numbering_profile(reference_date, performed_by=performed_by)


def ensure_document_numbering_profile_for_date(document_type: str, reference_date: date, *, performed_by=None):
    ensure_open_accounting_period_for_date(reference_date, performed_by=performed_by)
    return upsert_numbering_profile(
        document_type=document_type,
        reference_date=reference_date,
        performed_by=performed_by,
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


def ensure_test_collection_purpose_mapping(*, finance_account, purpose: str | None = None, is_default: bool = False):
    purpose = purpose or {
        FinanceAccountKind.CASH: FinanceAccountMappingPurpose.CASH_COLLECTION,
        FinanceAccountKind.BANK: FinanceAccountMappingPurpose.BANK_COLLECTION,
        FinanceAccountKind.UPI: FinanceAccountMappingPurpose.UPI_COLLECTION,
    }.get(finance_account.kind)
    if not purpose:
        raise ValueError(f"No collection mapping purpose is defined for {finance_account.kind}.")

    finance_updates = []
    if not finance_account.is_active:
        finance_account.is_active = True
        finance_updates.append("is_active")
    if not finance_account.is_real_settlement_account:
        finance_account.is_real_settlement_account = True
        finance_updates.append("is_real_settlement_account")
    if finance_updates:
        finance_account.save(update_fields=[*finance_updates, "updated_at"])

    chart_account = finance_account.chart_account
    chart_updates = []
    if not chart_account.is_active:
        chart_account.is_active = True
        chart_updates.append("is_active")
    if not chart_account.allow_manual_posting:
        chart_account.allow_manual_posting = True
        chart_updates.append("allow_manual_posting")
    if chart_updates:
        chart_account.save(update_fields=chart_updates)

    if is_default:
        FinanceAccountCoaMapping.objects.filter(
            purpose=purpose,
            is_active=True,
            is_default=True,
        ).exclude(finance_account=finance_account).update(is_default=False)

    mapping, _ = FinanceAccountCoaMapping.objects.update_or_create(
        finance_account=finance_account,
        purpose=purpose,
        defaults={
            "chart_account": chart_account,
            "is_active": True,
            "is_default": is_default
            or not FinanceAccountCoaMapping.objects.filter(
                purpose=purpose,
                is_active=True,
                is_default=True,
            )
            .exclude(finance_account=finance_account)
            .exists(),
            "notes": "Test collection purpose mapping.",
        },
    )
    return mapping


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
                "is_real_settlement_account": True,
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
        if not finance_account.is_real_settlement_account:
            finance_account.is_real_settlement_account = True
            finance_updates.append("is_real_settlement_account")
        if finance_updates:
            finance_account.save(update_fields=finance_updates)
        purpose = {
            FinanceAccountKind.CASH: FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountKind.BANK: FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountKind.UPI: FinanceAccountMappingPurpose.UPI_COLLECTION,
        }[kind]
        ensure_test_collection_purpose_mapping(finance_account=finance_account, purpose=purpose)
        accounts[kind] = finance_account
    return accounts


@contextmanager
def suppress_expected_request_logs(*extra_logger_names: str):
    """
    Temporarily silence noisy HTTP request logs during intentional negative-path
    API tests (4xx/5xx). Does not affect finance.* audit loggers.
    """
    logger_names = ("django.request", *extra_logger_names)
    loggers = [logging.getLogger(name) for name in logger_names]
    previous = [
        (logger, logger.disabled, logger.level, logger.propagate) for logger in loggers
    ]
    try:
        for logger in loggers:
            logger.disabled = True
        yield
    finally:
        for logger, disabled, level, propagate in previous:
            logger.disabled = disabled
            logger.setLevel(level)
            logger.propagate = propagate
