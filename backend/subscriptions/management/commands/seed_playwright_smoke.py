import json
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import UserRole
from services.subscriptions.create_subscription import create_subscription
from subscriptions.models import (
    Batch,
    BatchStatus,
    Customer,
    KycStatus,
    LuckyId,
    LuckyIdStatus,
    Product,
)
from subscriptions.services.payment_service import record_emi_payment, verify_payment

SMOKE_META_FILENAME = "playwright-smoke-meta.json"
REAL_LOGIN_SECRET = "SmokeLogin123!"
INVALID_LOGIN_SECRET = "SmokeLogin123!x"


class Command(BaseCommand):
    help = "Seed deterministic data for Playwright smoke automation."

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        today = timezone.localdate()
        meta_path = Path(settings.BASE_DIR) / SMOKE_META_FILENAME

        admin = self._upsert_user(
            User,
            username="smoke_admin",
            phone="9100000001",
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        cashier = self._upsert_user(
            User,
            username="smoke_cashier",
            phone="9100000002",
            role=UserRole.CASHIER,
        )
        partner = self._upsert_user(
            User,
            username="smoke_partner",
            phone="9100000003",
            role=UserRole.PARTNER,
            commission_rate=Decimal("5.00"),
        )
        customer_user = self._upsert_user(
            User,
            username="smoke_customer",
            phone="9100000004",
            role=UserRole.CUSTOMER,
        )
        cashier_customer_user = self._upsert_user(
            User,
            username="smoke_customer_cashier",
            phone="9100000005",
            role=UserRole.CUSTOMER,
        )

        customer = Customer.objects.update_or_create(
            user=customer_user,
            defaults={
                "name": "Smoke Customer",
                "phone": customer_user.phone,
                "kyc_status": KycStatus.VERIFIED,
                "city": "Kolkata",
                "address": "Smoke Customer Address",
            },
        )[0]
        cashier_customer = Customer.objects.update_or_create(
            user=cashier_customer_user,
            defaults={
                "name": "Cashier Flow Customer",
                "phone": cashier_customer_user.phone,
                "kyc_status": KycStatus.VERIFIED,
                "city": "Kolkata",
                "address": "Cashier Flow Address",
            },
        )[0]

        product = Product.objects.update_or_create(
            product_code="SMOKE-EMI-001",
            defaults={
                "name": "Smoke EMI Product",
                "base_price": Decimal("1200.00"),
                "category": "Furniture",
                "subcategory": "Chair",
                "description": "Seeded product for deterministic smoke automation.",
                "is_active": True,
                "is_emi_enabled": True,
                "is_rent_enabled": True,
                "is_lease_enabled": True,
            },
        )[0]

        paid_batch = self._upsert_open_batch(
            code="SMOKEPAID",
            start_date=today - timedelta(days=45),
            draw_day=5,
            duration_months=6,
        )
        admin_batch = self._upsert_open_batch(
            code="SMOKEADMN",
            start_date=today - timedelta(days=10),
            draw_day=7,
            duration_months=6,
        )
        cashier_batch = self._upsert_open_batch(
            code="SMOKECASH",
            start_date=today - timedelta(days=5),
            draw_day=9,
            duration_months=6,
        )

        paid_subscription = create_subscription(
            customer=customer,
            product=product,
            batch=paid_batch,
            lucky_number=1,
            tenure_months=paid_batch.duration_months,
            partner=partner,
            start_date=paid_batch.start_date,
            performed_by=admin,
        )
        admin_subscription = create_subscription(
            customer=customer,
            product=product,
            batch=admin_batch,
            lucky_number=2,
            tenure_months=admin_batch.duration_months,
            partner=partner,
            start_date=admin_batch.start_date,
            performed_by=admin,
        )
        cashier_subscription = create_subscription(
            customer=cashier_customer,
            product=product,
            batch=cashier_batch,
            lucky_number=3,
            tenure_months=cashier_batch.duration_months,
            partner=partner,
            start_date=cashier_batch.start_date,
            performed_by=admin,
        )

        paid_subscription.contract_reference = "SMOKE-SUB-PAID"
        paid_subscription.save(update_fields=["contract_reference"])
        admin_subscription.contract_reference = "SMOKE-SUB-ADMIN"
        admin_subscription.save(update_fields=["contract_reference"])
        cashier_subscription.contract_reference = "SMOKE-SUB-CASHIER"
        cashier_subscription.save(update_fields=["contract_reference"])

        paid_emi = paid_subscription.emis.order_by("month_no").first()
        admin_emi = admin_subscription.emis.order_by("month_no").first()
        cashier_emi = cashier_subscription.emis.order_by("month_no").first()

        paid_payment_result = record_emi_payment(
            emi_id=paid_emi.id,
            amount=paid_emi.amount,
            collected_by=admin,
            method="UPI",
            reference_no="SMOKE-PAID-001",
            note="Seeded payment for partner and customer smoke views.",
            payment_date=today - timedelta(days=1),
        )
        verify_payment(payment_id=paid_payment_result["payment"].id, verified_by=admin)

        metadata = {
            "roles": {
                "admin": {
                    "id": admin.id,
                    "name": admin.username,
                    "role": admin.role,
                    "dashboard_path": "/admin",
                },
                "cashier": {
                    "id": cashier.id,
                    "name": cashier.username,
                    "role": cashier.role,
                    "dashboard_path": "/cashier",
                },
                "partner": {
                    "id": partner.id,
                    "name": partner.username,
                    "role": partner.role,
                    "dashboard_path": "/partner",
                },
                "customer": {
                    "id": customer_user.id,
                    "name": customer_user.username,
                    "role": customer_user.role,
                    "dashboard_path": "/customer",
                },
            },
            "real_login": {
                "secret": REAL_LOGIN_SECRET,
                "invalid_secret": INVALID_LOGIN_SECRET,
                "roles": {
                    "admin": {
                        "username": admin.username,
                        "dashboard_path": "/admin",
                    },
                    "cashier": {
                        "username": cashier.username,
                        "dashboard_path": "/cashier",
                    },
                },
            },
            "entities": {
                "admin_collection": {
                    "subscription_id": admin_subscription.id,
                    "emi_id": admin_emi.id,
                    "customer_name": customer.name,
                },
                "cashier_collection": {
                    "subscription_id": cashier_subscription.id,
                    "emi_id": cashier_emi.id,
                    "customer_phone": cashier_customer.phone,
                    "customer_name": cashier_customer.name,
                },
                "preseed_payment": {
                    "payment_id": paid_payment_result["payment"].id,
                    "reference_no": "SMOKE-PAID-001",
                    "subscription_id": paid_subscription.id,
                    "customer_name": customer.name,
                },
                "batch_create": {
                    "status": "DRAFT",
                    "total_slots": 100,
                    "duration_months": 6,
                    "draw_day": 12,
                },
            },
        }

        meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(f"Playwright smoke data seeded at {meta_path}"))

    def _upsert_user(
        self,
        User,
        *,
        username,
        phone,
        role,
        is_staff=False,
        is_superuser=False,
        commission_rate=Decimal("0.00"),
    ):
        user, _ = User.objects.update_or_create(
            username=username,
            defaults={
                "phone": phone,
                "role": role,
                "is_active": True,
                "is_staff": is_staff,
                "is_superuser": is_superuser,
                "commission_rate": commission_rate,
            },
        )
        return user

    def _upsert_open_batch(self, *, code, start_date, draw_day, duration_months):
        batch, _ = Batch.objects.update_or_create(
            batch_code=code,
            defaults={
                "total_slots": 100,
                "duration_months": duration_months,
                "draw_day": draw_day,
                "start_date": start_date,
                "status": BatchStatus.OPEN,
            },
        )

        existing_numbers = set(batch.lucky_ids.values_list("lucky_number", flat=True))
        to_create = [
            LuckyId(
                batch=batch,
                lucky_number=number,
                status=LuckyIdStatus.AVAILABLE,
            )
            for number in range(100)
            if number not in existing_numbers
        ]
        if to_create:
            LuckyId.objects.bulk_create(to_create)

        return batch
