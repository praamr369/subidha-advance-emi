from __future__ import annotations

import hashlib
import json
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import UserRole
from subscriptions.models import (
    Batch,
    BatchStatus,
    Customer,
    Emi,
    EmiStatus,
    KycStatus,
    LuckyDraw,
    LuckyId,
    LuckyIdStatus,
    MONEY_ZERO,
    PartnerCollectionRequest,
    PartnerCollectionRequestStatus,
    Payment,
    PlanType,
    Product,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.payment_service import (
    record_emi_payment,
    reverse_payment_for_admin,
)


SMOKE_PASSWORD = "SmokePass123!"


class Command(BaseCommand):
    help = (
        "Seed a deterministic, role-safe Playwright smoke dataset without "
        "touching unrelated business records."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--json",
            action="store_true",
            help="Print the smoke manifest as JSON only.",
        )

    def handle(self, *args, **options):
        manifest = build_smoke_manifest()

        if options["json"]:
            self.stdout.write(json.dumps(manifest, indent=2, sort_keys=True))
            return

        self.stdout.write(self.style.SUCCESS("Playwright smoke data is ready."))
        self.stdout.write(json.dumps(manifest, indent=2, sort_keys=True))


def build_smoke_manifest() -> dict:
    User = get_user_model()
    today = timezone.localdate()
    now = timezone.now()

    admin_user = ensure_user(
        User,
        username="smoke_admin",
        role=UserRole.ADMIN,
        phone="9800000001",
        first_name="Smoke",
        last_name="Admin",
        is_staff=True,
    )
    cashier_user = ensure_user(
        User,
        username="smoke_cashier",
        role=UserRole.CASHIER,
        phone="9800000002",
        first_name="Smoke",
        last_name="Cashier",
    )
    partner_user = ensure_user(
        User,
        username="smoke_partner",
        role=UserRole.PARTNER,
        phone="9800000003",
        first_name="Smoke",
        last_name="Partner",
        commission_rate=Decimal("5.00"),
    )
    customer_user = ensure_user(
        User,
        username="smoke_customer",
        role=UserRole.CUSTOMER,
        phone="9800000004",
        first_name="Smoke",
        last_name="Customer",
    )
    other_customer_user = ensure_user(
        User,
        username="smoke_customer_other",
        role=UserRole.CUSTOMER,
        phone="9800000005",
        first_name="Other",
        last_name="Customer",
    )

    primary_customer = ensure_customer(
        user=customer_user,
        name="Smoke Customer",
        phone="9800000004",
        kyc_status=KycStatus.VERIFIED,
    )
    other_customer = ensure_customer(
        user=other_customer_user,
        name="Other Smoke Customer",
        phone="9800000005",
        kyc_status=KycStatus.VERIFIED,
    )

    primary_product = ensure_product(
        product_code="PW-SMOKE-SOFA",
        name="Smoke Test Sofa",
        base_price=Decimal("12000.00"),
        category="Furniture",
        subcategory="Sofa",
        description="Deterministic Playwright smoke product.",
    )
    winner_product = ensure_product(
        product_code="PW-SMOKE-WINNER",
        name="Winner Test Wardrobe",
        base_price=Decimal("18000.00"),
        category="Furniture",
        subcategory="Wardrobe",
        description="Winner-history smoke product.",
    )

    active_batch = ensure_batch(
        batch_code="PW-SMOKE-ACTIVE",
        duration_months=12,
        total_slots=100,
        draw_day=5,
        start_date=today - timedelta(days=90),
        status=BatchStatus.OPEN,
    )
    winner_batch = ensure_batch(
        batch_code="PW-SMOKE-WINNER",
        duration_months=12,
        total_slots=100,
        draw_day=10,
        start_date=today - timedelta(days=180),
        status=BatchStatus.OPEN,
    )

    primary_lucky = ensure_lucky_id(active_batch, lucky_number=11)
    other_lucky = ensure_lucky_id(active_batch, lucky_number=12)
    winner_lucky = ensure_lucky_id(winner_batch, lucky_number=21)

    primary_subscription = ensure_subscription(
        contract_reference="PW-SMOKE-SUB-PRIMARY",
        customer=primary_customer,
        product=primary_product,
        batch=active_batch,
        lucky_id=primary_lucky,
        partner=partner_user,
        plan_type=PlanType.EMI,
        tenure_months=12,
        total_amount=Decimal("12000.00"),
        monthly_amount=Decimal("1000.00"),
        start_date=today - timedelta(days=90),
        status=SubscriptionStatus.ACTIVE,
        winner_month=None,
        waived_amount=MONEY_ZERO,
    )
    other_subscription = ensure_subscription(
        contract_reference="PW-SMOKE-SUB-OTHER",
        customer=other_customer,
        product=primary_product,
        batch=active_batch,
        lucky_id=other_lucky,
        partner=None,
        plan_type=PlanType.EMI,
        tenure_months=12,
        total_amount=Decimal("12000.00"),
        monthly_amount=Decimal("1000.00"),
        start_date=today - timedelta(days=60),
        status=SubscriptionStatus.ACTIVE,
        winner_month=None,
        waived_amount=MONEY_ZERO,
    )
    winner_subscription = ensure_subscription(
        contract_reference="PW-SMOKE-SUB-WINNER",
        customer=other_customer,
        product=winner_product,
        batch=winner_batch,
        lucky_id=winner_lucky,
        partner=None,
        plan_type=PlanType.EMI,
        tenure_months=12,
        total_amount=Decimal("18000.00"),
        monthly_amount=Decimal("1500.00"),
        start_date=today - timedelta(days=180),
        status=SubscriptionStatus.WON,
        winner_month=2,
        waived_amount=Decimal("1500.00"),
    )

    primary_paid_emi = ensure_emi(
        subscription=primary_subscription,
        month_no=1,
        due_date=today - timedelta(days=60),
        amount=Decimal("1000.00"),
        status=EmiStatus.PENDING,
    )
    primary_collectible_emi = ensure_emi(
        subscription=primary_subscription,
        month_no=2,
        due_date=today,
        amount=Decimal("1000.00"),
        status=EmiStatus.PENDING,
    )
    primary_overdue_emi = ensure_emi(
        subscription=primary_subscription,
        month_no=3,
        due_date=today - timedelta(days=10),
        amount=Decimal("1000.00"),
        status=EmiStatus.PENDING,
    )

    other_paid_emi = ensure_emi(
        subscription=other_subscription,
        month_no=1,
        due_date=today - timedelta(days=40),
        amount=Decimal("1000.00"),
        status=EmiStatus.PENDING,
    )

    winner_paid_emi = ensure_emi(
        subscription=winner_subscription,
        month_no=1,
        due_date=today - timedelta(days=150),
        amount=Decimal("1500.00"),
        status=EmiStatus.PAID,
    )
    winner_month_emi = ensure_emi(
        subscription=winner_subscription,
        month_no=2,
        due_date=today - timedelta(days=120),
        amount=Decimal("1500.00"),
        status=EmiStatus.PAID,
    )
    winner_waived_emi = ensure_emi(
        subscription=winner_subscription,
        month_no=3,
        due_date=today - timedelta(days=90),
        amount=Decimal("1500.00"),
        status=EmiStatus.WAIVED,
    )

    reset_pending_emi_for_smoke(primary_collectible_emi, admin_user)
    reset_pending_emi_for_smoke(primary_overdue_emi, admin_user)

    primary_payment = ensure_payment(
        emi=primary_paid_emi,
        amount=Decimal("1000.00"),
        collected_by=cashier_user,
        method="CASH",
        reference_no="PW-SMOKE-SEED-PAID-001",
        payment_date=today - timedelta(days=58),
    )
    other_customer_payment = ensure_payment(
        emi=other_paid_emi,
        amount=Decimal("1000.00"),
        collected_by=cashier_user,
        method="UPI",
        reference_no="PW-SMOKE-SEED-OTHER-001",
        payment_date=today - timedelta(days=38),
    )

    request_obj = ensure_partner_collection_request(
        partner=partner_user,
        subscription=primary_subscription,
        customer=primary_customer,
        amount=Decimal("1000.00"),
        payment_method="BANK",
        payment_date=today - timedelta(days=1),
        reference_no="PW-SMOKE-PARTNER-REQ-001",
        notes="Playwright smoke partner collection request.",
        status=PartnerCollectionRequestStatus.SUBMITTED,
    )

    winner_draw = ensure_revealed_winner_draw(
        batch=winner_batch,
        draw_month=2,
        winner_lucky=winner_lucky,
        winner_subscription=winner_subscription,
        draw_date=now - timedelta(days=7),
        waived_emi_count=1,
        waived_amount=Decimal("1500.00"),
    )

    manifest = {
        "credentials": {
            "admin": build_role_manifest(admin_user, "/admin"),
            "cashier": build_role_manifest(cashier_user, "/cashier"),
            "customer": build_role_manifest(customer_user, "/customer"),
            "partner": build_role_manifest(partner_user, "/partner"),
        },
        "entities": {
            "admin": {
                "customer_id": primary_customer.id,
                "customer_name": primary_customer.name,
                "subscription_id": primary_subscription.id,
                "subscription_number": f"SUB-{primary_subscription.id}",
                "pending_emi_id": primary_collectible_emi.id,
                "search_query": primary_customer.phone,
                "product_id": primary_product.id,
            },
            "cashier": {
                "customer_id": primary_customer.id,
                "customer_name": primary_customer.name,
                "customer_phone": primary_customer.phone,
                "subscription_id": primary_subscription.id,
                "subscription_number": f"SUB-{primary_subscription.id}",
                "lucky_number": primary_lucky.lucky_number,
                "collectible_emi_id": primary_collectible_emi.id,
                "history_payment_id": primary_payment.id,
            },
            "customer": {
                "subscription_id": primary_subscription.id,
                "subscription_number": f"SUB-{primary_subscription.id}",
                "own_payment_id": primary_payment.id,
                "other_payment_id": other_customer_payment.id,
            },
            "partner": {
                "customer_id": primary_customer.id,
                "subscription_id": primary_subscription.id,
                "subscription_number": f"SUB-{primary_subscription.id}",
                "collection_request_id": request_obj.id,
            },
            "public": {
                "product_id": primary_product.id,
                "product_name": primary_product.name,
                "winner_draw_id": winner_draw.id,
            },
        },
    }

    # Keep winner EMI rows in a visibly consistent state for public trust tests.
    winner_paid_emi.refresh_from_db()
    winner_month_emi.refresh_from_db()
    winner_waived_emi.refresh_from_db()

    return manifest


def ensure_user(
    User,
    *,
    username: str,
    role: str,
    phone: str,
    first_name: str,
    last_name: str,
    is_staff: bool = False,
    commission_rate: Decimal = Decimal("0.00"),
):
    user = User.objects.filter(username=username).first()
    if user is None:
        user = User(
            username=username,
            role=role,
            phone=phone,
            first_name=first_name,
            last_name=last_name,
            is_staff=is_staff,
        )

    user.role = role
    user.phone = phone
    user.first_name = first_name
    user.last_name = last_name
    user.is_staff = is_staff
    user.is_superuser = False
    user.is_active = True
    if role == UserRole.PARTNER:
        user.commission_rate = commission_rate
    user.set_password(SMOKE_PASSWORD)
    user.save()
    return user


def ensure_customer(*, user, name: str, phone: str, kyc_status: str) -> Customer:
    customer = Customer.objects.filter(user=user).first()
    if customer is None:
        customer = Customer(user=user)

    customer.name = name
    customer.phone = phone
    customer.kyc_status = kyc_status
    customer.address = "Smoke Fixture Address"
    customer.city = "Dhaka"
    customer.save()
    return customer


def ensure_product(
    *,
    product_code: str,
    name: str,
    base_price: Decimal,
    category: str,
    subcategory: str,
    description: str,
) -> Product:
    product = Product.objects.filter(product_code=product_code).first()
    if product is None:
        product = Product(product_code=product_code)

    product.name = name
    product.base_price = base_price
    product.category = category
    product.subcategory = subcategory
    product.description = description
    product.is_active = True
    product.plan_type_default = PlanType.EMI
    product.is_emi_enabled = True
    product.is_rent_enabled = False
    product.is_lease_enabled = False
    product.save()
    return product


def ensure_batch(
    *,
    batch_code: str,
    duration_months: int,
    total_slots: int,
    draw_day: int,
    start_date,
    status: str,
) -> Batch:
    batch = Batch.objects.filter(batch_code=batch_code).first()
    if batch is None:
        batch = Batch(batch_code=batch_code)

    batch.duration_months = duration_months
    batch.total_slots = total_slots
    batch.draw_day = draw_day
    batch.start_date = start_date
    batch.status = status
    batch.save()
    return batch


def ensure_lucky_id(batch: Batch, *, lucky_number: int) -> LuckyId:
    lucky_id = LuckyId.objects.filter(batch=batch, lucky_number=lucky_number).first()
    if lucky_id is None:
        lucky_id = LuckyId(batch=batch, lucky_number=lucky_number)

    if lucky_id.status not in {
        LuckyIdStatus.ASSIGNED,
        LuckyIdStatus.WON,
    }:
        lucky_id.status = LuckyIdStatus.AVAILABLE
    lucky_id.save()
    return lucky_id


def ensure_subscription(
    *,
    contract_reference: str,
    customer: Customer,
    product: Product,
    batch: Batch,
    lucky_id: LuckyId,
    partner,
    plan_type: str,
    tenure_months: int,
    total_amount: Decimal,
    monthly_amount: Decimal,
    start_date,
    status: str,
    winner_month,
    waived_amount: Decimal,
) -> Subscription:
    subscription = Subscription.objects.filter(
        contract_reference=contract_reference
    ).first()
    if subscription is None:
        subscription = Subscription(contract_reference=contract_reference)

    subscription.customer = customer
    subscription.product = product
    subscription.batch = batch
    subscription.lucky_id = lucky_id
    subscription.partner = partner
    subscription.plan_type = plan_type
    subscription.tenure_months = tenure_months
    subscription.total_amount = total_amount
    subscription.monthly_amount = monthly_amount
    subscription.start_date = start_date
    subscription.status = status
    subscription.winner_month = winner_month
    subscription.waived_amount = waived_amount
    subscription.contract_reference = contract_reference
    subscription.save()
    return subscription


def ensure_emi(
    *,
    subscription: Subscription,
    month_no: int,
    due_date,
    amount: Decimal,
    status: str,
) -> Emi:
    emi = Emi.objects.filter(subscription=subscription, month_no=month_no).first()
    if emi is None:
        emi = Emi(subscription=subscription, month_no=month_no)

    emi.due_date = due_date
    emi.amount = amount
    emi.status = status
    emi.save()
    return emi


def ensure_payment(
    *,
    emi: Emi,
    amount: Decimal,
    collected_by,
    method: str,
    reference_no: str,
    payment_date,
) -> Payment:
    existing = Payment.objects.filter(reference_no=reference_no).first()
    if existing:
        return existing

    result = record_emi_payment(
        emi_id=emi.id,
        amount=amount,
        collected_by=collected_by,
        method=method,
        reference_no=reference_no,
        payment_date=payment_date,
    )
    return result["payment"]


def reset_pending_emi_for_smoke(emi: Emi, admin_user) -> None:
    active_payments = Payment.objects.filter(emi=emi).exclude(
        allocation_metadata__reversal__is_reversed=True
    )

    for payment in active_payments:
        reverse_payment_for_admin(
            payment_id=payment.id,
            reversed_by=admin_user,
            reason="Reset Playwright smoke EMI to baseline pending state.",
        )

    emi.refresh_from_db()
    if emi.status != EmiStatus.PENDING:
        emi.status = EmiStatus.PENDING
        emi.save(update_fields=["status"])

    subscription = emi.subscription
    subscription.refresh_from_db()
    if subscription.status not in {
        SubscriptionStatus.WON,
        SubscriptionStatus.DEFAULTED,
    }:
        subscription.status = SubscriptionStatus.ACTIVE
        subscription.save(update_fields=["status"])


def ensure_partner_collection_request(
    *,
    partner,
    subscription: Subscription,
    customer: Customer,
    amount: Decimal,
    payment_method: str,
    payment_date,
    reference_no: str,
    notes: str,
    status: str,
) -> PartnerCollectionRequest:
    request_obj = PartnerCollectionRequest.objects.filter(
        partner=partner,
        subscription=subscription,
        reference_no=reference_no,
    ).first()
    if request_obj is None:
        request_obj = PartnerCollectionRequest(
            partner=partner,
            subscription=subscription,
            customer=customer,
        )

    request_obj.amount = amount
    request_obj.payment_method = payment_method
    request_obj.payment_date = payment_date
    request_obj.reference_no = reference_no
    request_obj.notes = notes
    request_obj.status = status
    request_obj.review_note = ""
    request_obj.reviewed_by = None
    request_obj.reviewed_at = None
    request_obj.approved_payment = None
    request_obj.approved_emi = None
    request_obj.save()
    return request_obj


def ensure_revealed_winner_draw(
    *,
    batch: Batch,
    draw_month: int,
    winner_lucky: LuckyId,
    winner_subscription: Subscription,
    draw_date,
    waived_emi_count: int,
    waived_amount: Decimal,
) -> LuckyDraw:
    seed = "PW-SMOKE-WINNER-SEED"
    committed_hash = hashlib.sha256(seed.encode("utf-8")).hexdigest()

    draw = LuckyDraw.objects.filter(batch=batch, draw_month=draw_month).first()
    if draw is None:
        draw = LuckyDraw(batch=batch, draw_month=draw_month)

    draw.committed_hash = committed_hash
    draw.revealed_seed = seed
    draw.winner_lucky_id = winner_lucky
    draw.winner_subscription = winner_subscription
    draw.draw_date = draw_date
    draw.is_revealed = True
    draw.revealed_at = draw_date
    draw.waived_emi_count = waived_emi_count
    draw.waived_amount = waived_amount
    draw.waiver_scope = "FUTURE_EMI_ONLY"
    draw.save()
    return draw


def build_role_manifest(user, dashboard: str) -> dict:
    refresh = RefreshToken.for_user(user)
    return {
        "user_id": user.id,
        "name": user.get_full_name().strip() or user.username,
        "username": user.username,
        "password": SMOKE_PASSWORD,
        "role": user.role,
        "dashboard": dashboard,
        "access_token": str(refresh.access_token),
        "refresh_token": str(refresh),
    }
