import hashlib
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
    LuckyDraw,
    LuckyId,
    LuckyIdStatus,
    PartnerCollectionRequest,
    PartnerCollectionRequestStatus,
    Payment,
    Product,
    Subscription,
)
from subscriptions.services.lucky_draw_service import reveal_and_execute_draw
from subscriptions.services.payment_service import record_emi_payment, verify_payment
from subscriptions.services.winner_state_service import WAIVER_SCOPE_FUTURE_ONLY

SMOKE_META_FILENAME = "playwright-smoke-meta.json"
REAL_LOGIN_SECRET = "SmokeLogin123!"
INVALID_LOGIN_SECRET = "SmokeLogin123!x"
WINNER_REVEAL_SEED = "playwright-smoke-deterministic-winner-seed"


class Command(BaseCommand):
    help = "Seed deterministic data for Playwright smoke automation."

    def add_arguments(self, parser):
        parser.add_argument(
            "--json",
            action="store_true",
            dest="emit_json",
            help="Emit the structured smoke manifest JSON to stdout.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        emit_json = bool(options.get("emit_json"))
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
        winner_customer_user = self._upsert_user(
            User,
            username="smoke_customer_winner",
            phone="9100000006",
            role=UserRole.CUSTOMER,
        )

        customer = self._upsert_customer(
            customer_user,
            name="Smoke Customer",
            city="Kolkata",
            address="Smoke Customer Address",
        )
        cashier_customer = self._upsert_customer(
            cashier_customer_user,
            name="Cashier Flow Customer",
            city="Kolkata",
            address="Cashier Flow Address",
        )
        winner_customer = self._upsert_customer(
            winner_customer_user,
            name="PW-SMOKE-WINNER",
            city="Dhaka",
            address="Winner Smoke Address",
        )

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
            start_date=today - timedelta(days=35),
            draw_day=9,
            duration_months=6,
        )
        winner_batch = self._upsert_open_batch(
            code="SMOKEWIN",
            start_date=today - timedelta(days=50),
            draw_day=11,
            duration_months=6,
        )

        paid_subscription = self._upsert_subscription(
            customer=customer,
            product=product,
            batch=paid_batch,
            lucky_number=1,
            tenure_months=paid_batch.duration_months,
            partner=partner,
            start_date=paid_batch.start_date,
            performed_by=admin,
        )
        admin_subscription = self._upsert_subscription(
            customer=customer,
            product=product,
            batch=admin_batch,
            lucky_number=2,
            tenure_months=admin_batch.duration_months,
            partner=partner,
            start_date=admin_batch.start_date,
            performed_by=admin,
        )
        cashier_subscription = self._upsert_subscription(
            customer=cashier_customer,
            product=product,
            batch=cashier_batch,
            lucky_number=3,
            tenure_months=cashier_batch.duration_months,
            partner=partner,
            start_date=cashier_batch.start_date,
            performed_by=admin,
        )
        winner_subscription = self._upsert_subscription(
            customer=winner_customer,
            product=product,
            batch=winner_batch,
            lucky_number=4,
            tenure_months=winner_batch.duration_months,
            partner=partner,
            start_date=winner_batch.start_date,
            performed_by=admin,
        )

        self._set_contract_reference(paid_subscription, "SMOKE-SUB-PAID")
        self._set_contract_reference(admin_subscription, "SMOKE-SUB-ADMIN")
        self._set_contract_reference(cashier_subscription, "SMOKE-SUB-CASHIER")
        self._set_contract_reference(winner_subscription, "PW-SMOKE-WINNER-SUB")

        paid_emis = list(paid_subscription.emis.order_by("month_no"))
        admin_emis = list(admin_subscription.emis.order_by("month_no"))
        cashier_emis = list(cashier_subscription.emis.order_by("month_no"))

        paid_emi = paid_emis[0]
        admin_emi = admin_emis[0]
        cashier_history_emi = cashier_emis[0]
        cashier_collectible_emi = cashier_emis[1]

        paid_payment = self._upsert_payment(
            emi=paid_emi,
            amount=paid_emi.amount,
            collected_by=admin,
            method="UPI",
            reference_no="SMOKE-PAID-001",
            note="Seeded payment for partner and customer smoke views.",
            payment_date=today - timedelta(days=1),
            verified_by=admin,
        )
        cashier_history_payment = self._upsert_payment(
            emi=cashier_history_emi,
            amount=cashier_history_emi.amount,
            collected_by=cashier,
            method="CASH",
            reference_no="SMOKE-CASH-001",
            note="Seeded cashier history payment so Month 2 remains collectible.",
            payment_date=today - timedelta(days=2),
            verified_by=admin,
        )

        collection_request = self._upsert_collection_request(
            partner=partner,
            subscription=admin_subscription,
            customer=customer,
            amount=admin_emi.amount,
            payment_method="CASH",
            payment_date=today,
            reference_no="SMOKE-COLLECT-001",
            notes="Seeded partner collection request for direct detail smoke coverage.",
        )

        winner_draw = self._upsert_revealed_draw(
            batch=winner_batch,
            winner_subscription=winner_subscription,
            performed_by=admin,
            draw_date=timezone.now() - timedelta(days=3),
        )

        legacy_metadata = {
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
                    "emi_id": cashier_collectible_emi.id,
                    "customer_phone": cashier_customer.phone,
                    "customer_name": cashier_customer.name,
                },
                "preseed_payment": {
                    "payment_id": paid_payment.id,
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

        manifest = {
            "credentials": {
                "admin": self._build_credentials(admin, "/admin"),
                "cashier": self._build_credentials(cashier, "/cashier"),
                "customer": self._build_credentials(customer_user, "/customer"),
                "partner": self._build_credentials(partner, "/partner"),
            },
            "entities": {
                "admin": {
                    "customer_id": customer.id,
                    "customer_name": customer.name,
                    "subscription_id": admin_subscription.id,
                    "subscription_number": self._subscription_ref(admin_subscription),
                    "pending_emi_id": admin_emi.id,
                    "search_query": customer.phone,
                    "product_id": product.id,
                },
                "cashier": {
                    "customer_id": cashier_customer.id,
                    "customer_name": cashier_customer.name,
                    "customer_phone": cashier_customer.phone,
                    "subscription_id": cashier_subscription.id,
                    "subscription_number": self._subscription_ref(cashier_subscription),
                    "lucky_number": cashier_subscription.lucky_id.lucky_number,
                    "collectible_emi_id": cashier_collectible_emi.id,
                    "history_payment_id": cashier_history_payment.id,
                },
                "customer": {
                    "subscription_id": paid_subscription.id,
                    "subscription_number": self._subscription_ref(paid_subscription),
                    "own_payment_id": paid_payment.id,
                    "other_payment_id": cashier_history_payment.id,
                },
                "partner": {
                    "customer_id": customer.id,
                    "subscription_id": paid_subscription.id,
                    "subscription_number": self._subscription_ref(paid_subscription),
                    "collection_request_id": collection_request.id,
                },
                "public": {
                    "product_id": product.id,
                    "product_name": product.name,
                    "winner_draw_id": winner_draw.id,
                },
            },
        }

        meta_path.write_text(json.dumps(legacy_metadata, indent=2), encoding="utf-8")

        if emit_json:
            self.stdout.write(json.dumps(manifest))
            return

        self.stdout.write(
            self.style.SUCCESS(f"Playwright smoke data seeded at {meta_path}")
        )

    def _build_credentials(self, user, dashboard_path: str):
        return {
            "user_id": user.id,
            "name": user.username,
            "username": user.username,
            "password": REAL_LOGIN_SECRET,
            "role": user.role,
            "dashboard": dashboard_path,
            "access_token": f"PLAYWRIGHT_ROLE:{user.role}",
            "refresh_token": f"PLAYWRIGHT_REFRESH:{user.role}",
        }

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
        user = User.objects.filter(username=username).first()

        if user is None:
            user = User(username=username)

        user.phone = phone
        user.role = role
        user.is_active = True
        user.is_staff = is_staff
        user.is_superuser = is_superuser
        user.commission_rate = commission_rate
        user.set_password(REAL_LOGIN_SECRET)
        user.save()
        return user

    def _upsert_customer(self, user, *, name: str, city: str, address: str):
        return Customer.objects.update_or_create(
            user=user,
            defaults={
                "name": name,
                "phone": user.phone,
                "kyc_status": KycStatus.VERIFIED,
                "city": city,
                "address": address,
            },
        )[0]

    def _upsert_subscription(
        self,
        *,
        customer,
        product,
        batch,
        lucky_number: int,
        tenure_months: int,
        partner,
        start_date,
        performed_by,
    ):
        lucky_id = batch.lucky_ids.get(lucky_number=lucky_number)
        existing = (
            Subscription.objects.select_related("lucky_id", "customer", "product", "partner")
            .filter(lucky_id=lucky_id)
            .first()
        )
        if existing:
            return existing

        return create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_number=lucky_number,
            tenure_months=tenure_months,
            partner=partner,
            start_date=start_date,
            performed_by=performed_by,
        )

    def _set_contract_reference(self, subscription: Subscription, reference: str):
        if subscription.contract_reference == reference:
            return subscription

        subscription.contract_reference = reference
        subscription.save(update_fields=["contract_reference"])
        return subscription

    def _upsert_payment(
        self,
        *,
        emi,
        amount,
        collected_by,
        method,
        reference_no,
        note,
        payment_date,
        verified_by,
    ):
        payment = Payment.objects.filter(reference_no=reference_no).first()
        if payment is None:
            payment = record_emi_payment(
                emi_id=emi.id,
                amount=amount,
                collected_by=collected_by,
                method=method,
                reference_no=reference_no,
                note=note,
                payment_date=payment_date,
            )["payment"]

        if payment.verified_by_id is None:
            verify_payment(payment_id=payment.id, verified_by=verified_by)
            payment.refresh_from_db()

        return payment

    def _upsert_collection_request(
        self,
        *,
        partner,
        subscription,
        customer,
        amount,
        payment_method,
        payment_date,
        reference_no,
        notes,
    ):
        return PartnerCollectionRequest.objects.update_or_create(
            reference_no=reference_no,
            defaults={
                "partner": partner,
                "subscription": subscription,
                "customer": customer,
                "amount": amount,
                "payment_method": payment_method,
                "payment_date": payment_date,
                "notes": notes,
                "status": PartnerCollectionRequestStatus.SUBMITTED,
                "reviewed_by": None,
                "reviewed_at": None,
                "review_note": "",
                "approved_payment": None,
                "approved_emi": None,
            },
        )[0]

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

    def _upsert_revealed_draw(
        self,
        *,
        batch: Batch,
        winner_subscription: Subscription,
        performed_by,
        draw_date,
    ):
        draw = LuckyDraw.objects.filter(batch=batch, draw_month=1).first()

        if draw and draw.is_revealed:
            return draw

        if draw is None:
            draw = LuckyDraw.objects.create(
                batch=batch,
                committed_hash=hashlib.sha256(WINNER_REVEAL_SEED.encode()).hexdigest(),
                draw_date=draw_date,
                draw_month=1,
                is_revealed=False,
                waiver_scope=WAIVER_SCOPE_FUTURE_ONLY,
            )

        reveal_and_execute_draw(
            draw_id=draw.id,
            revealed_seed=WINNER_REVEAL_SEED,
            performed_by=performed_by,
        )

        draw.refresh_from_db()
        winner_subscription.refresh_from_db()
        return draw

    def _subscription_ref(self, subscription: Subscription) -> str:
        return f"SUB-{subscription.id}"
