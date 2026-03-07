import csv
import hashlib
import os
import secrets
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import User, UserRole
from api.v1.permissions import IsAdmin
from api.v1.serializers.admin_resources import (
    BatchAdminSerializer,
    CustomerAdminSerializer,
    EmiAdminSerializer,
    LuckyDrawAdminSerializer,
    LuckyIdAdminSerializer,
    PartnerAdminSerializer,
    PaymentAdminSerializer,
    ProductAdminSerializer,
    SubscriptionAdminSerializer,
)
from subscriptions.models import (
    Batch,
    Customer,
    Emi,
    LuckyDraw,
    LuckyId,
    Payment,
    Product,
    Subscription,
    PlanType,
    SubscriptionStatus,
    LuckyIdStatus,
    EmiStatus,
)


MONEY_ZERO = Decimal("0.00")


class AdminOnlyModelViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


# =====================================================
# BATCH
# =====================================================

class BatchAdminViewSet(AdminOnlyModelViewSet):
    queryset = Batch.objects.all().order_by("-created_at")
    serializer_class = BatchAdminSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        q = self.request.query_params.get("q", "").strip()

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if q:
            queryset = queryset.filter(batch_code__icontains=q)

        return queryset

    @action(detail=True, methods=["get"], url_path="summary")
    def summary(self, request, pk=None):
        batch = self.get_object()

        subscription_count = Subscription.objects.filter(batch=batch).count()
        active_subscription_count = Subscription.objects.filter(
            batch=batch,
            status=SubscriptionStatus.ACTIVE,
        ).count()
        won_subscription_count = Subscription.objects.filter(
            batch=batch,
            status=SubscriptionStatus.WON,
        ).count()

        lucky_qs = LuckyId.objects.filter(batch=batch)
        available_lucky_ids = lucky_qs.filter(status=LuckyIdStatus.AVAILABLE).count()
        assigned_lucky_ids = lucky_qs.filter(status=LuckyIdStatus.ASSIGNED).count()
        won_lucky_ids = lucky_qs.filter(status=LuckyIdStatus.WON).count()

        monthly_booked_value = (
            Subscription.objects.filter(batch=batch).aggregate(
                total=Sum("monthly_amount")
            )["total"]
            or MONEY_ZERO
        )

        return Response(
            {
                "id": batch.id,
                "batch_code": batch.batch_code,
                "status": batch.status,
                "duration_months": batch.duration_months,
                "total_slots": batch.total_slots,
                "draw_day": batch.draw_day,
                "start_date": batch.start_date,
                "subscription_count": subscription_count,
                "active_subscription_count": active_subscription_count,
                "won_subscription_count": won_subscription_count,
                "available_lucky_ids": available_lucky_ids,
                "assigned_lucky_ids": assigned_lucky_ids,
                "won_lucky_ids": won_lucky_ids,
                "monthly_booked_value": str(monthly_booked_value),
                "draw_count": batch.lucky_draws.count(),
            }
        )

    @action(detail=True, methods=["post"], url_path="create-commit")
    @transaction.atomic
    def create_commit(self, request, pk=None):
        batch = Batch.objects.select_for_update().get(pk=pk)

        existing_count = LuckyDraw.objects.select_for_update().filter(batch=batch).count()
        next_month = existing_count + 1

        if next_month > batch.duration_months:
            return Response(
                {"detail": "All monthly draws already created for this batch."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = LuckyDraw.objects.filter(batch=batch, draw_month=next_month).first()
        if existing:
            return Response(
                {"detail": f"Commitment already exists for draw month {next_month}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        secret_seed = secrets.token_hex(16)
        committed_hash = hashlib.sha256(secret_seed.encode()).hexdigest()

        try:
            draw = LuckyDraw.objects.create(
                batch=batch,
                draw_month=next_month,
                committed_hash=committed_hash,
                revealed_seed=None,
                winner_lucky_id=None,
                draw_date=timezone.now(),
                is_revealed=False,
            )
        except IntegrityError:
            return Response(
                {"detail": f"Commitment already exists for draw month {next_month}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "id": draw.id,
                "batch": batch.id,
                "draw_month": draw.draw_month,
                "committed_hash": draw.committed_hash,
                "admin_seed_store_securely": secret_seed,
                "is_revealed": draw.is_revealed,
            },
            status=status.HTTP_201_CREATED,
        )


# =====================================================
# CUSTOMER
# =====================================================

class CustomerAdminViewSet(AdminOnlyModelViewSet):
    queryset = Customer.objects.select_related("user").all().order_by("-created_at")
    serializer_class = CustomerAdminSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        search = (
            self.request.query_params.get("search", "").strip()
            or self.request.query_params.get("q", "").strip()
        )
        kyc_status = self.request.query_params.get("kyc_status")

        if kyc_status:
            queryset = queryset.filter(kyc_status=kyc_status)

        if search:
            search_filter = (
                Q(name__icontains=search)
                | Q(phone__icontains=search)
                | Q(user__username__icontains=search)
            )

            if search.isdigit():
                search_filter = search_filter | Q(id=int(search))

            queryset = queryset.filter(search_filter).distinct()

        return queryset

    @action(detail=False, methods=["get"], url_path="search")
    def search(self, request):
        queryset = self.get_queryset()[:20]
        serializer = self.get_serializer(queryset, many=True)
        return Response(
            {
                "results": serializer.data,
                "count": len(serializer.data),
            }
        )

    @action(detail=True, methods=["get"], url_path="profile-summary")
    def profile_summary(self, request, pk=None):
        customer = self.get_object()

        subscriptions = Subscription.objects.filter(customer=customer)
        payments = Payment.objects.filter(customer=customer)
        emis = Emi.objects.filter(subscription__customer=customer)

        return Response(
            {
                "customer_id": customer.id,
                "name": customer.name,
                "phone": customer.phone,
                "kyc_status": customer.kyc_status,
                "total_subscriptions": subscriptions.count(),
                "active_subscriptions": subscriptions.filter(
                    status=SubscriptionStatus.ACTIVE
                ).count(),
                "won_subscriptions": subscriptions.filter(
                    status=SubscriptionStatus.WON
                ).count(),
                "total_paid": str(
                    payments.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
                ),
                "pending_emis": emis.filter(status=EmiStatus.PENDING).count(),
                "paid_emis": emis.filter(status=EmiStatus.PAID).count(),
                "waived_emis": emis.filter(status=EmiStatus.WAIVED).count(),
            }
        )


# =====================================================
# EMI
# =====================================================

class EmiAdminViewSet(AdminOnlyModelViewSet):
    queryset = (
        Emi.objects.select_related(
            "subscription",
            "subscription__customer",
            "subscription__batch",
            "subscription__lucky_id",
        )
        .all()
        .order_by("due_date", "id")
    )
    serializer_class = EmiAdminSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        subscription_id = self.request.query_params.get("subscription")
        customer_id = self.request.query_params.get("customer")
        status_filter = self.request.query_params.get("status")
        overdue_only = self.request.query_params.get("overdue_only")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")

        if subscription_id:
            queryset = queryset.filter(subscription_id=subscription_id)

        if customer_id:
            queryset = queryset.filter(subscription__customer_id=customer_id)

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if overdue_only in {"true", "1"}:
            queryset = queryset.filter(
                status=EmiStatus.PENDING,
                due_date__lt=timezone.now().date(),
            )

        if date_from:
            queryset = queryset.filter(due_date__gte=date_from)

        if date_to:
            queryset = queryset.filter(due_date__lte=date_to)

        return queryset


# =====================================================
# LUCKY DRAW
# =====================================================

class LuckyDrawAdminViewSet(AdminOnlyModelViewSet):
    queryset = (
        LuckyDraw.objects.select_related("batch", "winner_lucky_id")
        .all()
        .order_by("-draw_date", "-id")
    )
    serializer_class = LuckyDrawAdminSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        batch_id = self.request.query_params.get("batch")
        revealed = self.request.query_params.get("is_revealed")

        if batch_id:
            queryset = queryset.filter(batch_id=batch_id)

        if revealed in {"true", "false"}:
            queryset = queryset.filter(is_revealed=(revealed == "true"))

        return queryset

    @action(detail=True, methods=["post"], url_path="reveal")
    @transaction.atomic
    def reveal(self, request, pk=None):
        draw = LuckyDraw.objects.select_for_update().select_related("batch").get(pk=pk)

        if draw.is_revealed:
            return Response(
                {"detail": "This draw is already revealed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        revealed_seed = (request.data.get("revealed_seed") or "").strip()
        if not revealed_seed:
            return Response(
                {"revealed_seed": "Reveal seed is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        recalculated_hash = hashlib.sha256(revealed_seed.encode()).hexdigest()
        if recalculated_hash != draw.committed_hash:
            return Response(
                {"detail": "Reveal seed does not match committed hash."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        eligible_subscriptions = list(
            Subscription.objects.select_for_update()
            .select_related("lucky_id")
            .filter(
                batch=draw.batch,
                status=SubscriptionStatus.ACTIVE,
                plan_type=PlanType.EMI,
                lucky_id__isnull=False,
            )
            .order_by("id")
        )

        if not eligible_subscriptions:
            return Response(
                {"detail": "No eligible active subscriptions found for this draw."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        seed_int = int(hashlib.sha256(revealed_seed.encode()).hexdigest(), 16)
        winner_index = seed_int % len(eligible_subscriptions)
        winner_subscription = eligible_subscriptions[winner_index]
        winner_lucky_id = winner_subscription.lucky_id

        winner_emis = list(
            Emi.objects.select_for_update().filter(
                subscription=winner_subscription,
                status=EmiStatus.PENDING,
            ).order_by("month_no")
        )

        waiver_total = sum((emi.amount for emi in winner_emis), start=MONEY_ZERO)

        draw.revealed_seed = revealed_seed
        draw.winner_lucky_id = winner_lucky_id
        draw.is_revealed = True
        draw.draw_date = timezone.now()
        draw.save(
            update_fields=[
                "revealed_seed",
                "winner_lucky_id",
                "is_revealed",
                "draw_date",
            ]
        )

        winner_subscription.status = SubscriptionStatus.WON
        winner_subscription.winner_month = draw.draw_month
        winner_subscription.waived_amount = waiver_total
        winner_subscription.save(
            update_fields=["status", "winner_month", "waived_amount"]
        )

        if winner_lucky_id and winner_lucky_id.status != LuckyIdStatus.WON:
            winner_lucky_id.status = LuckyIdStatus.WON
            winner_lucky_id.save(update_fields=["status"])

        if winner_emis:
            Emi.objects.filter(pk__in=[emi.pk for emi in winner_emis]).update(
                status=EmiStatus.WAIVED
            )

        return Response(
            {
                "id": draw.id,
                "draw_month": draw.draw_month,
                "winner_subscription_id": winner_subscription.id,
                "winner_lucky_id": winner_lucky_id.id if winner_lucky_id else None,
                "winner_lucky_number": (
                    winner_lucky_id.lucky_number if winner_lucky_id else None
                ),
                "waived_amount": str(waiver_total),
                "is_revealed": draw.is_revealed,
            }
        )


# =====================================================
# LUCKY ID
# =====================================================

class LuckyIdAdminViewSet(AdminOnlyModelViewSet):
    queryset = (
        LuckyId.objects.select_related("batch")
        .all()
        .order_by("batch_id", "lucky_number")
    )
    serializer_class = LuckyIdAdminSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        batch_id = self.request.query_params.get("batch_id")
        status_filter = self.request.query_params.get("status")

        if batch_id:
            queryset = queryset.filter(batch_id=batch_id)

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        return queryset

    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request):
        queryset = self.get_queryset().filter(status=LuckyIdStatus.AVAILABLE)[:100]
        serializer = self.get_serializer(queryset, many=True)
        return Response(
            {
                "results": serializer.data,
                "count": len(serializer.data),
            }
        )

    @action(detail=False, methods=["get"], url_path="search")
    def search(self, request):
        q = request.query_params.get("q", "").strip()
        queryset = self.get_queryset()

        if q:
            if q.isdigit():
                numeric_value = int(q)
                queryset = queryset.filter(
                    Q(id=numeric_value) | Q(lucky_number=numeric_value)
                ).distinct()
            else:
                queryset = queryset.none()

        queryset = queryset[:20]
        serializer = self.get_serializer(queryset, many=True)
        return Response(
            {
                "results": serializer.data,
                "count": len(serializer.data),
            }
        )


# =====================================================
# PAYMENT
# =====================================================

class PaymentAdminViewSet(AdminOnlyModelViewSet):
    queryset = (
        Payment.objects.select_related(
            "customer",
            "subscription",
            "subscription__batch",
            "subscription__partner",
            "subscription__lucky_id",
            "emi",
            "collected_by",
            "verified_by",
        )
        .all()
        .order_by("-payment_date", "-id")
    )
    serializer_class = PaymentAdminSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        q = self.request.query_params.get("q", "").strip()
        subscription_id = self.request.query_params.get("subscription")
        customer_id = self.request.query_params.get("customer")
        batch_id = self.request.query_params.get("batch")
        partner_id = self.request.query_params.get("partner")
        emi_id = self.request.query_params.get("emi")
        method = self.request.query_params.get("method")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")

        if subscription_id:
            queryset = queryset.filter(subscription_id=subscription_id)

        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)

        if batch_id:
            queryset = queryset.filter(subscription__batch_id=batch_id)

        if partner_id:
            queryset = queryset.filter(subscription__partner_id=partner_id)

        if emi_id:
            queryset = queryset.filter(emi_id=emi_id)

        if method:
            queryset = queryset.filter(method=method)

        if date_from:
            queryset = queryset.filter(payment_date__gte=date_from)

        if date_to:
            queryset = queryset.filter(payment_date__lte=date_to)

        if q:
            search_filter = (
                Q(reference_no__icontains=q)
                | Q(customer__name__icontains=q)
                | Q(customer__phone__icontains=q)
                | Q(subscription__product__name__icontains=q)
                | Q(subscription__product__product_code__icontains=q)
                | Q(subscription__batch__batch_code__icontains=q)
            )
            if q.isdigit():
                numeric_value = int(q)
                search_filter = (
                    search_filter
                    | Q(id=numeric_value)
                    | Q(subscription_id=numeric_value)
                    | Q(subscription__lucky_id__lucky_number=numeric_value)
                )

            queryset = queryset.filter(search_filter).distinct()

        return queryset


# =====================================================
# PARTNER
# =====================================================

class PartnerAdminListViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = PartnerAdminSerializer

    def get_queryset(self):
        queryset = User.objects.filter(role=UserRole.PARTNER).order_by("-id")
        q = self.request.query_params.get("q", "").strip()

        if q:
            queryset = queryset.filter(
                Q(username__icontains=q)
                | Q(email__icontains=q)
                | Q(phone__icontains=q)
            )

        return queryset


# =====================================================
# PRODUCT
# =====================================================

class ProductAdminViewSet(AdminOnlyModelViewSet):
    queryset = Product.objects.all().order_by("name")
    serializer_class = ProductAdminSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        q = self.request.query_params.get("q", "").strip()

        if q:
            queryset = queryset.filter(
                Q(name__icontains=q) | Q(product_code__icontains=q)
            )

        return queryset

    @action(detail=False, methods=["get"], url_path="search")
    def search(self, request):
        queryset = self.get_queryset()[:20]
        serializer = self.get_serializer(queryset, many=True)
        return Response(
            {
                "results": serializer.data,
                "count": len(serializer.data),
            }
        )

    def _build_product_code(self, name: str) -> str:
        base = slugify(name).upper().replace("-", "")[:12] or "PRODUCT"
        existing_codes = (
            Product.objects.filter(product_code__startswith=f"{base}-")
            .values_list("product_code", flat=True)
        )

        next_seq = 1
        used = set()
        for code in existing_codes:
            try:
                used.add(int(code.split("-")[-1]))
            except (TypeError, ValueError):
                continue

        while next_seq in used:
            next_seq += 1

        return f"{base}-{next_seq:04d}"

    def _import_rows(self, reader):
        created = 0
        updated = 0
        skipped = 0

        with transaction.atomic():
            for row in reader:
                name = (row.get("name") or "").strip()
                price_raw = (row.get("base_price") or row.get("price") or "").strip()
                code = (row.get("product_code") or "").strip().upper()

                if not name or not price_raw:
                    skipped += 1
                    continue

                try:
                    price = Decimal(price_raw)
                except InvalidOperation:
                    skipped += 1
                    continue

                if not code:
                    existing = Product.objects.filter(name__iexact=name).first()
                    if existing:
                        code = existing.product_code
                    else:
                        code = self._build_product_code(name)

                _, was_created = Product.objects.update_or_create(
                    product_code=code,
                    defaults={"name": name, "base_price": price},
                )

                if was_created:
                    created += 1
                else:
                    updated += 1

        return {"created": created, "updated": updated, "skipped": skipped}

    @action(detail=False, methods=["post"], url_path="import-csv")
    def import_csv(self, request):
        uploaded = request.FILES.get("file")

        try:
            if uploaded:
                decoded = uploaded.read().decode("utf-8-sig", errors="ignore").splitlines()
                reader = csv.DictReader(decoded)
                result = self._import_rows(reader)
                result["source"] = "uploaded"
                return Response(result)

            csv_path = os.path.join(settings.BASE_DIR, "products.csv")
            if not os.path.exists(csv_path):
                return Response(
                    {"message": f"CSV file not found at {csv_path}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            with open(csv_path, newline="", encoding="utf-8") as csv_file:
                reader = csv.DictReader(csv_file)
                result = self._import_rows(reader)

            result["source"] = "server_default"
            return Response(result)

        except Exception as exc:
            return Response(
                {"message": f"CSV import failed: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )


# =====================================================
# SUBSCRIPTION
# =====================================================

class SubscriptionAdminViewSet(AdminOnlyModelViewSet):
    queryset = (
        Subscription.objects.select_related(
            "customer",
            "product",
            "batch",
            "lucky_id",
            "partner",
        )
        .prefetch_related("emis")
        .all()
        .order_by("-created_at")
    )
    serializer_class = SubscriptionAdminSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        q = self.request.query_params.get("q", "").strip()
        batch_id = self.request.query_params.get("batch_id")
        customer_id = self.request.query_params.get("customer")
        status_filter = self.request.query_params.get("status")
        plan_type = self.request.query_params.get("plan_type")
        partner_id = self.request.query_params.get("partner")
        overdue_only = self.request.query_params.get("overdue_only")
        start_date_from = self.request.query_params.get("start_date_from")
        start_date_to = self.request.query_params.get("start_date_to")

        if batch_id:
            queryset = queryset.filter(batch_id=batch_id)

        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if plan_type:
            queryset = queryset.filter(plan_type=plan_type)

        if partner_id:
            queryset = queryset.filter(partner_id=partner_id)

        if start_date_from:
            queryset = queryset.filter(start_date__gte=start_date_from)

        if start_date_to:
            queryset = queryset.filter(start_date__lte=start_date_to)

        if overdue_only in {"true", "1"}:
            queryset = queryset.filter(
                emis__status=EmiStatus.PENDING,
                emis__due_date__lt=timezone.now().date(),
            ).distinct()

        if q:
            search_filter = (
                Q(customer__name__icontains=q)
                | Q(customer__phone__icontains=q)
                | Q(product__name__icontains=q)
                | Q(product__product_code__icontains=q)
                | Q(batch__batch_code__icontains=q)
                | Q(partner__username__icontains=q)
            )

            if q.isdigit():
                numeric_value = int(q)
                search_filter = (
                    search_filter
                    | Q(id=numeric_value)
                    | Q(lucky_id__lucky_number=numeric_value)
                )

            queryset = queryset.filter(search_filter).distinct()

        return queryset

    @action(detail=False, methods=["get"], url_path="search")
    def search(self, request):
        queryset = self.get_queryset()[:20]
        serializer = self.get_serializer(queryset, many=True)
        return Response(
            {
                "results": serializer.data,
                "count": len(serializer.data),
            }
        )

    @action(detail=False, methods=["get"], url_path="kpis")
    def kpis(self, request):
        queryset = self.get_queryset()

        total = queryset.count()
        active = queryset.filter(status=SubscriptionStatus.ACTIVE).count()
        won = queryset.filter(status=SubscriptionStatus.WON).count()
        completed = queryset.filter(status=SubscriptionStatus.COMPLETED).count()
        defaulted = queryset.filter(status=SubscriptionStatus.DEFAULTED).count()

        emi_count = queryset.filter(plan_type=PlanType.EMI).count()
        rent_count = queryset.filter(plan_type=PlanType.RENT).count()
        lease_count = queryset.filter(plan_type=PlanType.LEASE).count()

        aggregates = queryset.aggregate(
            total_contract_value=Sum("total_amount"),
            total_monthly_value=Sum("monthly_amount"),
            total_waived_value=Sum("waived_amount"),
        )

        return Response(
            {
                "total_subscriptions": total,
                "active_subscriptions": active,
                "won_subscriptions": won,
                "completed_subscriptions": completed,
                "defaulted_subscriptions": defaulted,
                "emi_count": emi_count,
                "rent_count": rent_count,
                "lease_count": lease_count,
                "total_contract_value": str(
                    aggregates["total_contract_value"] or MONEY_ZERO
                ),
                "total_monthly_value": str(
                    aggregates["total_monthly_value"] or MONEY_ZERO
                ),
                "total_waived_value": str(
                    aggregates["total_waived_value"] or MONEY_ZERO
                ),
            }
        )