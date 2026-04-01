# backend/api/v1/views/admin_resources.py

import csv
import io
import os
from decimal import Decimal, InvalidOperation
from urllib import request

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q, Sum, Value, DecimalField, IntegerField, OuterRef, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.utils.text import slugify

from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser

from accounts.models import User, UserRole
from api.v1.permissions import IsAdmin
from api.v1.serializers.admin_resources import (
    AdminPaymentCollectSerializer,
    AdminPaymentReverseSerializer,
    BatchAdminSerializer,
    CustomerAdminSerializer,
    EmiAdminSerializer,
    LuckyDrawAdminSerializer,
    LuckyIdAdminSerializer,
    PartnerAdminSerializer,
    PaymentAdminSerializer,
    ProductAdminSerializer,
    CustomerKycDecisionSerializer,
)
from api.v1.serializers.admin_resources import (
    SubscriptionAdminSerializer,
    SubscriptionAdminDetailSerializer,
)

from api.v1.views import customer
from subscriptions.models import (
    AuditLog,
    Batch,
    Commission,
    CommissionStatus,
    Customer,
    Emi,
    EmiStatus,
    FinancialLedger,
    LedgerEntryType,
    LuckyDraw,
    LuckyId,
    LuckyIdStatus,
    MONEY_ZERO,
    Payment,
    PlanType,
    Product,
    Subscription,
    SubscriptionStatus,
    KycStatus,
    BatchStatus,
)
from subscriptions.services.lucky_draw_service import (
    create_lucky_draw_commit,
    reveal_and_execute_draw,
)
from subscriptions.services.payment_service import (
    record_emi_payment,
    reverse_payment_for_admin,
)
from subscriptions.services.audit_service import log_customer_kyc_decision
from subscriptions.services.delivery_service import get_subscription_delivery_prefetch
from subscriptions.services.subscription_financial_service import (
    get_subscription_detail_queryset,
)

# ... rest of the file


def _serialize_audit_queryset(queryset):
    return [
        {
            "id": item.id,
            "action_type": item.action_type,
            "model_name": item.model_name,
            "object_id": item.object_id,
            "performed_by": item.performed_by.username if item.performed_by else None,
            "metadata": item.metadata,
            "created_at": item.created_at,
        }
        for item in queryset
    ]


def _base_username_from_name(name: str) -> str:
    seed = slugify(name or "customer").replace("-", "")[:20]
    return seed or "customer"


def _next_available_username(base: str) -> str:
    candidate = base
    index = 1
    while User.objects.filter(username=candidate).exists():
        index += 1
        candidate = f"{base}{index}"
    return candidate


def _parse_customer_rows(uploaded_file):
    decoded = uploaded_file.read().decode("utf-8-sig", errors="ignore")
    reader = csv.DictReader(io.StringIO(decoded))
    headers = reader.fieldnames or []
    rows = list(reader)
    return headers, rows


def _validate_customer_import_rows(rows):
    seen_phones = set()
    validation_rows = []

    for index, row in enumerate(rows, start=2):
        name = (row.get("name") or "").strip()
        phone = (row.get("phone") or "").strip()

        errors = []
        if not name:
            errors.append("name is required")
        if not phone:
            errors.append("phone is required")

        if phone and phone in seen_phones:
            errors.append("duplicate phone in upload")
        if phone:
            seen_phones.add(phone)

        existing_customer = Customer.objects.filter(phone=phone).first() if phone else None
        if existing_customer:
            errors.append("customer with this phone already exists")

        validation_rows.append({
            "row_number": index,
            "name": name,
            "phone": phone,
            "valid": len(errors) == 0,
            "errors": errors,
        })

    return validation_rows


def _build_customer_preview_response(headers, validation_rows):
    errors = [
        {
            "row_number": row["row_number"],
            "phone": row["phone"],
            "errors": row["errors"],
        }
        for row in validation_rows
        if not row["valid"]
    ]
    preview_rows = [
        {
            "row_number": row["row_number"],
            "name": row["name"],
            "phone": row["phone"],
            "valid": row["valid"],
        }
        for row in validation_rows[:20]
    ]
    valid_count = sum(1 for row in validation_rows if row["valid"])

    return {
        "columns": headers,
        "preview_rows": preview_rows,
        "errors": errors,
        "valid_count": valid_count,
        "invalid_count": len(validation_rows) - valid_count,
    }


class AdminOnlyModelViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


# =====================================================
# BATCH
# =====================================================

class BatchAdminViewSet(AdminOnlyModelViewSet):
    queryset = Batch.objects.all().order_by("-created_at")
    serializer_class = BatchAdminSerializer

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .annotate(
                subscription_count=Count("subscriptions", distinct=True),
                lucky_id_count=Count("lucky_ids", distinct=True),
                winner_count=Count(
                    "lucky_ids",
                    filter=Q(lucky_ids__status=LuckyIdStatus.WON),
                    distinct=True,
                ),
            )
        )

        status_filter = self.request.query_params.get("status")
        q = self.request.query_params.get("q", "").strip()

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if q:
            queryset = queryset.filter(batch_code__icontains=q)

        return queryset

    def _validate_status_transition(self, batch, next_status: str):
        current_status = (batch.status or "").strip().upper()
        next_status = (next_status or "").strip().upper()

        supported_statuses = {choice[0] for choice in BatchStatus.choices}
        supports_cancelled = "CANCELLED" in supported_statuses

        allowed_transitions = {
            "DRAFT": {"DRAFT", "OPEN"},
            "OPEN": {"OPEN", "ACTIVE", "CLOSED"},
            "ACTIVE": {"ACTIVE", "CLOSED"},
            "CLOSED": {"CLOSED", "COMPLETED"},
            "COMPLETED": {"COMPLETED"},
        }

        if supports_cancelled:
            allowed_transitions["DRAFT"].add("CANCELLED")
            allowed_transitions["CANCELLED"] = {"CANCELLED"}

        if next_status not in supported_statuses:
            raise ValidationError(
                {"status": f"Unsupported batch status: {next_status}."}
            )

        if next_status not in allowed_transitions.get(current_status, set()):
            raise ValidationError(
                {
                    "status": (
                        f"Invalid batch status transition from {current_status} to {next_status}."
                    )
                }
            )

        lucky_count = batch.lucky_ids.count()
        subscription_count = batch.subscriptions.count()
        supported_subscription_statuses = {choice[0] for choice in SubscriptionStatus.choices}
        live_statuses = [status for status in ["ACTIVE", "PENDING"] if status in supported_subscription_statuses]

        active_or_pending_count = (
            batch.subscriptions.filter(status__in=live_statuses).count()
            if live_statuses
            else 0
        )
        draw_count = batch.lucky_draws.count()

        if next_status == "OPEN":
            if batch.total_slots != 100:
                raise ValidationError(
                    {"status": "Batch can move to OPEN only when total slots is exactly 100."}
                )
            if lucky_count != batch.total_slots:
                raise ValidationError(
                    {
                        "status": (
                            f"Batch can move to OPEN only after all Lucky IDs are prepared. "
                            f"Expected {batch.total_slots}, found {lucky_count}."
                        )
                    }
                )

        if next_status == "ACTIVE":
            if current_status != "OPEN":
                raise ValidationError(
                    {"status": "Only OPEN batches can move to ACTIVE."}
                )
            if lucky_count != batch.total_slots:
                raise ValidationError(
                    {
                        "status": (
                            f"Batch can move to ACTIVE only when Lucky IDs match total slots. "
                            f"Expected {batch.total_slots}, found {lucky_count}."
                        )
                    }
                )

        if next_status == "CLOSED":
            if current_status not in {"OPEN", "ACTIVE"}:
                raise ValidationError(
                    {"status": "Only OPEN or ACTIVE batches can move to CLOSED."}
                )

        if next_status == "COMPLETED":
            if current_status != "CLOSED":
                raise ValidationError(
                    {"status": "Only CLOSED batches can move to COMPLETED."}
                )
            if active_or_pending_count > 0:
                raise ValidationError(
                    {
                        "status": (
                            "Batch cannot move to COMPLETED while ACTIVE or PENDING subscriptions still exist."
                        )
                    }
                )

        if next_status == "CANCELLED":
            if current_status != "DRAFT":
                raise ValidationError(
                    {"status": "Only DRAFT batches can be cancelled."}
                )
            if subscription_count > 0 or draw_count > 0:
                raise ValidationError(
                    {
                        "status": (
                            "Batch cannot be cancelled after subscriptions or draw records exist."
                        )
                    }
                )

    def perform_update(self, serializer):
        batch = serializer.instance
        next_status = serializer.validated_data.get("status", batch.status)

        if next_status != batch.status:
            self._validate_status_transition(batch, next_status)

        serializer.save()

    @action(detail=True, methods=["post"], url_path="transition-status")
    def transition_status(self, request, pk=None):
        batch = self.get_object()
        next_status = (request.data.get("status") or "").strip().upper()

        if not next_status:
            return Response(
                {"status": ["Target status is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(
            batch,
            data={"status": next_status},
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        return Response(self.get_serializer(batch).data)

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
    def create_commit(self, request, pk=None):
        batch = self.get_object()

        try:
            draw, secret_seed = create_lucky_draw_commit(batch=batch)
        except ValidationError as exc:
            message = exc.messages[0] if getattr(exc, "messages", None) else "Unable to create draw commitment."
            return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)

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

# backend/api/v1/views/admin_resources.py

# already imported, but ensure it's there

class CustomerAdminViewSet(AdminOnlyModelViewSet):
    queryset = Customer.objects.select_related("user").all().order_by("-created_at")
    serializer_class = CustomerAdminSerializer

    def get_queryset(self):
        queryset = super().get_queryset().annotate(
            active_subscription_count=Count(
                'subscriptions',
                filter=Q(subscriptions__status=SubscriptionStatus.ACTIVE),
                distinct=True
            ),
            total_subscription_value=Coalesce(
                Sum('subscriptions__total_amount'),
                Value(Decimal('0.00'), output_field=DecimalField(max_digits=12, decimal_places=2))
            )
        )

        search = (
            self.request.query_params.get("search", "").strip()
            or self.request.query_params.get("q", "").strip()
        )
        kyc_status = self.request.query_params.get("kyc_status")
        status_filter = (self.request.query_params.get("status") or "").strip().upper()

        if kyc_status:
            queryset = queryset.filter(kyc_status=kyc_status)

        if status_filter == "ACTIVE":
            queryset = queryset.filter(user__is_active=True)
        elif status_filter == "INACTIVE":
            queryset = queryset.filter(user__is_active=False)

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

    # ... rest of the view unchanged ...
    
    @action(detail=True, methods=["post"], url_path="kyc-decision")
    @transaction.atomic
    def kyc_decision(self, request, pk=None):
        customer = self.get_object()
        serializer = CustomerKycDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        old_status = customer.kyc_status
        new_status = serializer.validated_data["status"]
        reason = serializer.validated_data.get("reason", "")

        customer.kyc_status = new_status
        customer.kyc_reviewed_by = request.user
        customer.kyc_reviewed_at = timezone.now()
        customer.kyc_rejection_reason = (
            reason if new_status == KycStatus.REJECTED else ""
        )
        customer.save(
            update_fields=[
                "kyc_status",
                "kyc_reviewed_by",
                "kyc_reviewed_at",
                "kyc_rejection_reason",
            ]
        )

        log_customer_kyc_decision(
            customer=customer,
            performed_by=request.user,
            old_status=old_status,
            new_status=new_status,
            reason=reason,
        )

        return Response(
            {
                "id": customer.id,
                "kyc_status": customer.kyc_status,
                "kyc_reviewed_by_username": request.user.username,
                "kyc_reviewed_at": customer.kyc_reviewed_at,
                "kyc_rejection_reason": customer.kyc_rejection_reason,
            },
            status=status.HTTP_200_OK,
        )

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

    @action(detail=False, methods=["post"], url_path="import-preview")
    def import_preview(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "CSV file is required."}, status=status.HTTP_400_BAD_REQUEST)

        headers, rows = _parse_customer_rows(uploaded)
        required_headers = ["name", "phone"]
        missing_headers = [item for item in required_headers if item not in headers]

        if missing_headers:
            return Response(
                {
                    "valid": False,
                    "missing_headers": missing_headers,
                    "required_headers": required_headers,
                    "rows": [],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        validation_rows = _validate_customer_import_rows(rows)
        valid_count = sum(1 for row in validation_rows if row["valid"])

        return Response(
            {
                "valid": valid_count == len(validation_rows),
                "required_headers": required_headers,
                "missing_headers": [],
                "row_count": len(validation_rows),
                "valid_row_count": valid_count,
                "invalid_row_count": len(validation_rows) - valid_count,
                "rows": validation_rows,
            }
        )

    @action(detail=False, methods=["post"], url_path="import/preview")
    def import_preview_v2(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "CSV file is required."}, status=status.HTTP_400_BAD_REQUEST)

        headers, rows = _parse_customer_rows(uploaded)
        required_headers = ["name", "phone"]
        missing_headers = [item for item in required_headers if item not in headers]
        if missing_headers:
            return Response(
                {
                    "columns": headers,
                    "preview_rows": [],
                    "errors": [{"row_number": None, "errors": [f"missing headers: {', '.join(missing_headers)}"]}],
                    "valid_count": 0,
                    "invalid_count": 0,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        validation_rows = _validate_customer_import_rows(rows)
        return Response(_build_customer_preview_response(headers, validation_rows))

    @action(detail=False, methods=["post"], url_path="import-csv")
    def import_csv(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "CSV file is required."}, status=status.HTTP_400_BAD_REQUEST)

        headers, rows = _parse_customer_rows(uploaded)
        required_headers = ["name", "phone"]
        missing_headers = [item for item in required_headers if item not in headers]

        if missing_headers:
            return Response(
                {"created": 0, "skipped": 0, "missing_headers": missing_headers, "rows": []},
                status=status.HTTP_400_BAD_REQUEST,
            )

        validation_rows = _validate_customer_import_rows(rows)
        created = 0
        skipped = 0
        result_rows = []

        with transaction.atomic():
            for row in validation_rows:
                if not row["valid"]:
                    skipped += 1
                    result_rows.append({**row, "created_customer_id": None})
                    continue

                base_username = _base_username_from_name(row["name"])
                username = _next_available_username(base_username)
                generated_password = get_random_string(12)

                user = User.objects.create_user(
                    username=username,
                    password=generated_password,
                    role=UserRole.CUSTOMER,
                    phone=row["phone"],
                    first_name=row["name"],
                )
                customer = Customer.objects.create(user=user, name=row["name"], phone=row["phone"])

                created += 1
                result_rows.append(
                    {
                        **row,
                        "created_customer_id": customer.id,
                        "created_user_id": user.id,
                        "generated_username": username,
                    }
                )

        return Response(
            {
                "created": created,
                "skipped": skipped,
                "row_count": len(validation_rows),
                "rows": result_rows,
            },
            status=status.HTTP_201_CREATED,
        )
    @action(detail=True, methods=['post'], url_path='toggle-user-status')
    def toggle_user_status(self, request, pk=None):
        customer = self.get_object()
        if not customer.user:
            return Response({"detail": "No user linked to this customer."}, status=400)
        customer.user.is_active = not customer.user.is_active
        customer.user.save()
        return Response({"is_active": customer.user.is_active})

    @action(detail=True, methods=['post'], url_path='change-user-password')
    def change_user_password(self, request, pk=None):
        customer = self.get_object()
        if not customer.user:
            return Response({"detail": "No user linked to this customer."}, status=400)
        password = request.data.get('password')
        if not password or len(password) < 8:
            return Response({"detail": "Password must be at least 8 characters."}, status=400)
        customer.user.set_password(password)
        customer.user.save()
        return Response({"detail": "Password changed successfully."})

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
        LuckyDraw.objects.select_related(
            "batch",
            "winner_lucky_id",
            "winner_subscription",
            "winner_subscription__customer",
        )
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

    @action(detail=True, methods=["get"], url_path="timeline")
    def timeline(self, request, pk=None):
        draw = self.get_object()
        items = AuditLog.objects.select_related("performed_by").filter(
            model_name="LuckyDraw",
            object_id=draw.id,
        )
        return Response(
            {
                "results": _serialize_audit_queryset(items),
                "count": items.count(),
            }
        )

    @action(detail=True, methods=["get"], url_path="winner-settlement")
    def winner_settlement(self, request, pk=None):
        draw = self.get_object()

        winner_subscription = draw.winner_subscription
        waived_emis_payload = []

        if winner_subscription:
            waived_emis = (
                winner_subscription.emis.filter(
                    status=EmiStatus.WAIVED,
                    month_no__gt=draw.draw_month,
                )
                .order_by("month_no", "id")
            )

            waived_emis_payload = [
                {
                    "id": emi.id,
                    "month_no": emi.month_no,
                    "due_date": emi.due_date,
                    "amount": str(emi.amount),
                    "status": emi.status,
                }
                for emi in waived_emis
            ]

        return Response(
            {
                "draw_id": draw.id,
                "is_revealed": draw.is_revealed,
                "revealed_at": draw.revealed_at,
                "winner_lucky_id": draw.winner_lucky_id_id,
                "winner_lucky_number": (
                    draw.winner_lucky_id.lucky_number
                    if draw.winner_lucky_id_id
                    else None
                ),
                "winner_subscription_id": (
                    winner_subscription.id if winner_subscription else None
                ),
                "winner_subscription_number": (
                    getattr(winner_subscription, "subscription_number", None)
                    or getattr(winner_subscription, "contract_reference", None)
                    or (f"SUB-{winner_subscription.id}" if winner_subscription else None)
                ),
                "winner_customer_name": (
                    winner_subscription.customer.name
                    if winner_subscription and winner_subscription.customer_id
                    else None
                ),
                "waived_emi_count": draw.waived_emi_count,
                "waived_amount": str(draw.waived_amount),
                "waiver_scope": draw.waiver_scope,
                "waived_emis": waived_emis_payload,
            }
        )

    @action(detail=True, methods=["post"], url_path="reveal")
    def reveal(self, request, pk=None):
        revealed_seed = (request.data.get("revealed_seed") or "").strip()
        if not revealed_seed:
            return Response(
                {"revealed_seed": ["Reveal seed is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payload = reveal_and_execute_draw(
                draw_id=int(pk),
                revealed_seed=revealed_seed,
                performed_by=request.user,
            )
        except ValidationError as exc:
            message = (
                exc.messages[0]
                if getattr(exc, "messages", None)
                else "Unable to reveal draw."
            )
            return Response(
                {"detail": message},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(payload, status=status.HTTP_200_OK)


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

        batch_param = (
            self.request.query_params.get("batch_id")
            or self.request.query_params.get("batch")
            or ""
        ).strip()

        status_filter = (self.request.query_params.get("status") or "").strip()

        if batch_param:
            if batch_param.isdigit():
                queryset = queryset.filter(batch_id=int(batch_param))
            else:
                queryset = queryset.none()

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
        q = (request.query_params.get("q") or "").strip()
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
            "subscription__product",
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

    def _reversal_lookup(self) -> str:
        return "allocation_metadata__reversal__is_reversed"

    def _payment_summary(self, queryset):
        reversed_lookup = self._reversal_lookup()

        reversed_qs = queryset.filter(**{reversed_lookup: True})
        active_qs = queryset.exclude(**{reversed_lookup: True})

        gross_amount = queryset.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
        reversed_amount = (
            reversed_qs.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
        )
        active_amount = (
            active_qs.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
        )

        return {
            "visible_payments": queryset.count(),
            "gross_amount": str(gross_amount),
            "active_payments": active_qs.count(),
            "active_amount": str(active_amount),
            "reversed_payments": reversed_qs.count(),
            "reversed_amount": str(reversed_amount),
            "net_collected_amount": str(active_amount),
        }

    def get_queryset(self):
        queryset = super().get_queryset()

        q = (self.request.query_params.get("q") or "").strip()
        subscription_id = (self.request.query_params.get("subscription") or "").strip()
        customer_id = (self.request.query_params.get("customer") or "").strip()
        batch_id = (self.request.query_params.get("batch") or "").strip()
        partner_id = (self.request.query_params.get("partner") or "").strip()
        emi_id = (self.request.query_params.get("emi") or "").strip()
        method = (self.request.query_params.get("method") or "").strip()
        date_from = (self.request.query_params.get("date_from") or "").strip()
        date_to = (self.request.query_params.get("date_to") or "").strip()
        reversal_state = (
            self.request.query_params.get("reversal_state", "")
            or ""
        ).strip().lower()

        reversed_lookup = self._reversal_lookup()

        if subscription_id:
            if subscription_id.isdigit():
                queryset = queryset.filter(subscription_id=int(subscription_id))
            else:
                queryset = queryset.none()

        if customer_id:
            if customer_id.isdigit():
                queryset = queryset.filter(customer_id=int(customer_id))
            else:
                queryset = queryset.none()

        if batch_id:
            if batch_id.isdigit():
                queryset = queryset.filter(subscription__batch_id=int(batch_id))
            else:
                queryset = queryset.none()

        if partner_id:
            if partner_id.isdigit():
                queryset = queryset.filter(subscription__partner_id=int(partner_id))
            else:
                queryset = queryset.none()

        if emi_id:
            if emi_id.isdigit():
                queryset = queryset.filter(emi_id=int(emi_id))
            else:
                queryset = queryset.none()

        if method:
            queryset = queryset.filter(method=method)

        if date_from:
            queryset = queryset.filter(payment_date__gte=date_from)

        if date_to:
            queryset = queryset.filter(payment_date__lte=date_to)

        if reversal_state == "reversed":
            queryset = queryset.filter(**{reversed_lookup: True})
        elif reversal_state == "active":
            queryset = queryset.exclude(**{reversed_lookup: True})

        if q:
            search_filter = (
                Q(reference_no__icontains=q)
                | Q(customer__name__icontains=q)
                | Q(customer__phone__icontains=q)
                | Q(subscription__product__name__icontains=q)
                | Q(subscription__product__product_code__icontains=q)
                | Q(subscription__batch__batch_code__icontains=q)
                | Q(subscription__contract_reference__icontains=q)
            )

            if q.isdigit():
                numeric_value = int(q)
                search_filter = (
                    search_filter
                    | Q(id=numeric_value)
                    | Q(subscription_id=numeric_value)
                    | Q(customer_id=numeric_value)
                    | Q(emi_id=numeric_value)
                    | Q(subscription__lucky_id__lucky_number=numeric_value)
                )

            queryset = queryset.filter(search_filter).distinct()

        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)

        return Response(
            {
                "count": queryset.count(),
                "results": serializer.data,
                "summary": self._payment_summary(queryset),
            }
        )

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        return Response(self._payment_summary(queryset))

    def create(self, request, *args, **kwargs):
        return Response(
            {
                "detail": (
                    "Direct payment creation is disabled. "
                    "Use /admin/payments/collect/."
                )
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def update(self, request, *args, **kwargs):
        return Response(
            {
                "detail": (
                    "Direct payment update is disabled. "
                    "Payments are financial records and must remain immutable."
                )
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def partial_update(self, request, *args, **kwargs):
        return Response(
            {
                "detail": (
                    "Direct payment partial update is disabled. "
                    "Use explicit admin actions only."
                )
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def destroy(self, request, *args, **kwargs):
        return Response(
            {
                "detail": (
                    "Direct payment deletion is disabled. "
                    "Payments are financial records and must remain auditable."
                )
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=False, methods=["post"], url_path="collect")
    def collect(self, request):
        serializer = AdminPaymentCollectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        validated = serializer.validated_data
        emi_obj = validated["emi"]
        amount = validated["amount"]
        payment_method = validated["payment_method"]
        reference_no = validated.get("reference_no")
        notes = validated.get("notes")

        try:
            result = record_emi_payment(
                emi_id=emi_obj.id,
                amount=amount,
                collected_by=request.user,
                method=payment_method,
                reference_no=reference_no or None,
                note=notes or None,
            )
        except ValidationError as exc:
            message = (
                exc.messages[0]
                if getattr(exc, "messages", None)
                else str(exc)
            )
            return Response(
                {"detail": message},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            return Response(
                {"detail": f"Payment collection failed: {str(exc)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        payment_obj = result["payment"]
        emi_obj = result["emi"]
        subscription_obj = result["subscription"]

        payment_data = self.get_serializer(payment_obj).data

        effective_paid = (
            FinancialLedger.objects.filter(
                emi=emi_obj,
                entry_type=LedgerEntryType.EMI_PAYMENT,
            ).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

        reversal_total = (
            FinancialLedger.objects.filter(
                emi=emi_obj,
                entry_type=LedgerEntryType.PAYMENT_REVERSAL,
            ).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

        net_paid = Decimal(str(effective_paid)) - Decimal(str(reversal_total))
        if net_paid < MONEY_ZERO:
            net_paid = MONEY_ZERO

        outstanding_amount = Decimal(str(emi_obj.amount)) - net_paid
        if outstanding_amount < MONEY_ZERO:
            outstanding_amount = MONEY_ZERO

        return Response(
            {
                "message": (
                    "Payment collected successfully."
                    if result.get("created", True)
                    else "Duplicate reference detected; existing payment returned."
                ),
                "created": result.get("created", True),
                "payment": payment_data,
                "emi": {
                    "id": emi_obj.id,
                    "status": emi_obj.status,
                    "amount": str(emi_obj.amount),
                    "paid_amount": str(net_paid),
                    "outstanding_amount": str(outstanding_amount),
                },
                "subscription": {
                    "id": subscription_obj.id,
                    "subscription_number": f"SUB-{subscription_obj.id}",
                    "status": subscription_obj.status,
                },
            },
            status=(
                status.HTTP_201_CREATED
                if result.get("created", True)
                else status.HTTP_200_OK
            ),
        )

    @action(detail=True, methods=["get"], url_path="timeline")
    def timeline(self, request, pk=None):
        payment = self.get_object()

        payment_data = self.get_serializer(
            payment,
            context={"request": request},
        ).data

        metadata = payment.allocation_metadata or {}
        reversal_metadata = metadata.get("reversal") or {}

        direct_ledger_entries = FinancialLedger.objects.filter(
            payment=payment
        ).order_by("created_at", "id")

        direct_ledger_payload = [
            {
                "id": entry.id,
                "emi_id": entry.emi_id,
                "amount": str(entry.amount),
                "entry_type": entry.entry_type,
                "entry_direction": entry.entry_direction,
                "allocation_context": entry.allocation_context or {},
                "created_at": entry.created_at,
            }
            for entry in direct_ledger_entries
        ]

        reversal_ledger_entries = FinancialLedger.objects.filter(
            entry_type=LedgerEntryType.PAYMENT_REVERSAL,
            emi_id=payment.emi_id,
            allocation_context__reversed_payment_id=payment.id,
        ).order_by("created_at", "id")

        reversal_ledger_payload = [
            {
                "id": entry.id,
                "emi_id": entry.emi_id,
                "amount": str(entry.amount),
                "entry_type": entry.entry_type,
                "entry_direction": entry.entry_direction,
                "allocation_context": entry.allocation_context or {},
                "created_at": entry.created_at,
            }
            for entry in reversal_ledger_entries
        ]

        audit_queryset = (
            AuditLog.objects.filter(object_id=str(payment.id))
            .order_by("created_at", "id")
        )

        audit_payload = []
        for log in audit_queryset:
            model_name = getattr(log, "model_name", None)
            if model_name and str(model_name).lower() != "payment":
                continue

            audit_payload.append(
                {
                    "id": log.id,
                    "action_type": getattr(log, "action_type", ""),
                    "performed_by": getattr(
                        getattr(log, "performed_by", None),
                        "username",
                        None,
                    ),
                    "metadata": getattr(log, "metadata", {}) or {},
                    "created_at": log.created_at,
                }
            )

        timeline_events = []

        for entry in direct_ledger_entries:
            timeline_events.append(
                {
                    "kind": "ledger",
                    "timestamp": entry.created_at,
                    "payload": {
                        "id": entry.id,
                        "entry_type": entry.entry_type,
                        "entry_direction": entry.entry_direction,
                        "amount": str(entry.amount),
                        "allocation_context": entry.allocation_context or {},
                    },
                }
            )

        for entry in reversal_ledger_entries:
            timeline_events.append(
                {
                    "kind": "reversal_ledger",
                    "timestamp": entry.created_at,
                    "payload": {
                        "id": entry.id,
                        "entry_type": entry.entry_type,
                        "entry_direction": entry.entry_direction,
                        "amount": str(entry.amount),
                        "allocation_context": entry.allocation_context or {},
                    },
                }
            )

        for log in audit_payload:
            timeline_events.append(
                {
                    "kind": "audit",
                    "timestamp": log["created_at"],
                    "payload": log,
                }
            )

        timeline_events.sort(key=lambda item: (item["timestamp"], item["kind"]))

        return Response(
            {
                "payment": payment_data,
                "flags": {
                    "is_reversed": bool(reversal_metadata.get("is_reversed")),
                },
                "reversal": reversal_metadata,
                "ledger_entries": direct_ledger_payload,
                "reversal_ledger_entries": reversal_ledger_payload,
                "audit_logs": audit_payload,
                "timeline": timeline_events,
            }
        )

    @action(detail=True, methods=["post"], url_path="reverse")
    def reverse(self, request, pk=None):
        payment_obj = self.get_object()

        serializer = AdminPaymentReverseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result = reverse_payment_for_admin(
                payment_id=payment_obj.id,
                reversed_by=request.user,
                reason=serializer.validated_data["reason"],
            )
        except ValidationError as exc:
            message = (
                exc.messages[0]
                if getattr(exc, "messages", None)
                else str(exc)
            )
            return Response(
                {"detail": message},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            message = str(exc)
            if "already reversed" in message.lower():
                return Response(
                    {"detail": "Payment is already reversed."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {"detail": f"Payment reversal failed: {message}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        payment_data = self.get_serializer(result["payment"]).data
        emi_obj = result["emi"]
        subscription_obj = result["subscription"]

        effective_paid = (
            FinancialLedger.objects.filter(
                emi=emi_obj,
                entry_type=LedgerEntryType.EMI_PAYMENT,
            ).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

        reversal_total = (
            FinancialLedger.objects.filter(
                emi=emi_obj,
                entry_type=LedgerEntryType.PAYMENT_REVERSAL,
            ).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

        net_paid = Decimal(str(effective_paid)) - Decimal(str(reversal_total))
        if net_paid < MONEY_ZERO:
            net_paid = MONEY_ZERO

        outstanding_amount = Decimal(str(emi_obj.amount)) - net_paid
        if outstanding_amount < MONEY_ZERO:
            outstanding_amount = MONEY_ZERO

        return Response(
            {
                "detail": result["detail"],
                "payment": payment_data,
                "emi": {
                    "id": emi_obj.id,
                    "status": emi_obj.status,
                    "amount": str(emi_obj.amount),
                    "paid_amount": str(net_paid),
                    "outstanding_amount": str(outstanding_amount),
                },
                "subscription": {
                    "id": subscription_obj.id,
                    "subscription_number": f"SUB-{subscription_obj.id}",
                    "status": subscription_obj.status,
                },
            },
            status=status.HTTP_200_OK,
        )

# =====================================================
# PARTNER
# =====================================================

class PartnerAdminListViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = PartnerAdminSerializer

    def get_queryset(self):
        referred_customers_count = (
            Subscription.objects.filter(partner=OuterRef("pk"))
            .values("partner")
            .annotate(total=Count("customer", distinct=True))
            .values("total")[:1]
        )
        active_subscriptions_count = (
            Subscription.objects.filter(
                partner=OuterRef("pk"),
                status=SubscriptionStatus.ACTIVE,
            )
            .values("partner")
            .annotate(total=Count("id"))
            .values("total")[:1]
        )
        subscription_monthly_sum = (
            Subscription.objects.filter(partner=OuterRef("pk"))
            .values("partner")
            .annotate(total=Coalesce(Sum("monthly_amount"), Value(MONEY_ZERO, output_field=DecimalField(max_digits=12, decimal_places=2))))
            .values("total")[:1]
        )
        subscription_contract_sum = (
            Subscription.objects.filter(partner=OuterRef("pk"))
            .values("partner")
            .annotate(total=Coalesce(Sum("total_amount"), Value(MONEY_ZERO, output_field=DecimalField(max_digits=12, decimal_places=2))))
            .values("total")[:1]
        )
        commission_total_sum = (
            Commission.objects.filter(partner=OuterRef("pk"))
            .exclude(status=CommissionStatus.REVERSED)
            .values("partner")
            .annotate(total=Coalesce(Sum("commission_amount"), Value(MONEY_ZERO, output_field=DecimalField(max_digits=12, decimal_places=2))))
            .values("total")[:1]
        )

        queryset = (
            User.objects.filter(role=UserRole.PARTNER)
            .annotate(
                referred_customers_count=Coalesce(
                    Subquery(
                        referred_customers_count,
                        output_field=IntegerField(),
                    ),
                    Value(0),
                ),
                active_subscriptions_count=Coalesce(
                    Subquery(
                        active_subscriptions_count,
                        output_field=IntegerField(),
                    ),
                    Value(0),
                ),
                total_monthly_book_value=Coalesce(
                    Subquery(
                        subscription_monthly_sum,
                        output_field=DecimalField(max_digits=12, decimal_places=2),
                    ),
                    Value(MONEY_ZERO, output_field=DecimalField(max_digits=12, decimal_places=2)),
                ),
                total_contract_value_amount=Coalesce(
                    Subquery(
                        subscription_contract_sum,
                        output_field=DecimalField(max_digits=12, decimal_places=2),
                    ),
                    Value(MONEY_ZERO, output_field=DecimalField(max_digits=12, decimal_places=2)),
                ),
                total_commission_amount=Coalesce(
                    Subquery(
                        commission_total_sum,
                        output_field=DecimalField(max_digits=12, decimal_places=2),
                    ),
                    Value(MONEY_ZERO, output_field=DecimalField(max_digits=12, decimal_places=2)),
                ),
            )
            .order_by("-id")
        )

        q = (self.request.query_params.get("q") or "").strip()
        is_active = (self.request.query_params.get("is_active") or "").strip().lower()

        if q:
            queryset = queryset.filter(
                Q(username__icontains=q)
                | Q(email__icontains=q)
                | Q(phone__icontains=q)
            )

        if is_active == "true":
            queryset = queryset.filter(is_active=True)
        elif is_active == "false":
            queryset = queryset.filter(is_active=False)

        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        results = []
        for partner in queryset:
            results.append(
                {
                    "id": partner.id,
                    "username": partner.username,
                    "email": getattr(partner, "email", "") or "",
                    "phone": getattr(partner, "phone", "") or "",
                    "is_active": partner.is_active,
                    "referred_customers": int(
                        getattr(partner, "referred_customers_count", 0) or 0
                    ),
                    "active_subscriptions": int(
                        getattr(partner, "active_subscriptions_count", 0) or 0
                    ),
                    "total_monthly_book": str(
                        getattr(partner, "total_monthly_book_value", None) or MONEY_ZERO
                    ),
                    "total_contract_value": str(
                        getattr(partner, "total_contract_value_amount", None) or MONEY_ZERO
                    ),
                    "total_commission": str(
                        getattr(partner, "total_commission_amount", None) or MONEY_ZERO
                    ),
                }
            )

        return Response(
            {
                "count": queryset.count(),
                "results": results,
            }
        )


# =====================================================
# PRODUCT
# =====================================================

class ProductAdminViewSet(AdminOnlyModelViewSet):
    queryset = Product.objects.all().order_by("name")
    serializer_class = ProductAdminSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        q = self.request.query_params.get("q", "").strip()
        category = self.request.query_params.get("category", "").strip()
        subcategory = self.request.query_params.get("subcategory", "").strip()

        if q:
            queryset = queryset.filter(
                Q(name__icontains=q)
                | Q(product_code__icontains=q)
                | Q(category__icontains=q)
                | Q(subcategory__icontains=q)
            )

        if category:
            queryset = queryset.filter(category__icontains=category)

        if subcategory:
            queryset = queryset.filter(subcategory__icontains=subcategory)

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
                used.add(int(str(code).split("-")[-1]))
            except (TypeError, ValueError):
                continue

        while next_seq in used:
            next_seq += 1

        return f"{base}-{next_seq:04d}"

    def _clean_text(self, value):
        return (value or "").strip()

    def _clean_decimal(self, value):
        raw = (value or "").strip()
        if not raw:
            return None
        try:
            return Decimal(raw)
        except (InvalidOperation, TypeError, ValueError):
            return None

    def _row_subcategory(self, row):
        return self._clean_text(
            row.get("sub_category")
            or row.get("subcategory")
            or row.get("sub-category")
        )

    def _row_image(self, row):
        return self._clean_text(
            row.get("image")
            or row.get("image_path")
            or row.get("image_name")
        )

    def _resolve_existing_product(self, product_code: str, name: str):
        if product_code:
            existing = Product.objects.filter(product_code=product_code).first()
            if existing:
                return existing

        if name:
            existing = Product.objects.filter(name__iexact=name).first()
            if existing:
                return existing

        return None

    def _build_defaults(self, row, existing=None):
        """
        Additive, safe update behavior:
        - create: use CSV values directly
        - update: do not erase existing values with blank CSV cells
        """
        name = self._clean_text(row.get("name"))
        category = self._clean_text(row.get("category"))
        subcategory = self._row_subcategory(row)
        description = self._clean_text(row.get("description"))
        image_value = self._row_image(row)

        price = self._clean_decimal(row.get("base_price") or row.get("price"))

        defaults = {
            "name": name if name else (existing.name if existing else ""),
            "category": category if category else (existing.category if existing else ""),
            "subcategory": (
                subcategory if subcategory else (existing.subcategory if existing else "")
            ),
            "description": (
                description if description else (existing.description if existing else "")
            ),
            "base_price": price if price is not None else (existing.base_price if existing else None),
        }

        if image_value:
            defaults["image"] = image_value
        elif existing and existing.image:
            defaults["image"] = existing.image

        if existing:
            defaults["is_active"] = existing.is_active
            defaults["is_emi_enabled"] = existing.is_emi_enabled
            defaults["is_rent_enabled"] = existing.is_rent_enabled
            defaults["is_lease_enabled"] = existing.is_lease_enabled
            defaults["plan_type_default"] = existing.plan_type_default

        return defaults

    def _validate_csv_headers(self, fieldnames):
        normalized = {str(name).strip() for name in (fieldnames or []) if name}
        required = {"name", "base_price"}
        if not required.issubset(normalized):
            return False, (
                "CSV must include at least these headers: "
                "name, base_price. Optional headers: "
                "product_code, category, sub_category, description, image."
            )
        return True, None

    def _import_rows(self, reader):
        created = 0
        updated = 0
        skipped = 0
        errors = []

        fieldnames = getattr(reader, "fieldnames", None)
        is_valid, header_error = self._validate_csv_headers(fieldnames)
        if not is_valid:
            raise ValueError(header_error)

        with transaction.atomic():
            for index, row in enumerate(reader, start=2):
                try:
                    name = self._clean_text(row.get("name"))
                    price_raw = self._clean_text(row.get("base_price") or row.get("price"))
                    product_code = self._clean_text(row.get("product_code")).upper()
                    category = self._clean_text(row.get("category"))
                    subcategory = self._row_subcategory(row)
                    description = self._clean_text(row.get("description"))
                    image_value = self._row_image(row)

                    if not name:
                        skipped += 1
                        errors.append(f"Row {index}: missing name.")
                        continue

                    price = self._clean_decimal(price_raw)
                    if price is None:
                        skipped += 1
                        errors.append(
                            f"Row {index}: invalid base_price '{price_raw or ''}'."
                        )
                        continue

                    existing = self._resolve_existing_product(product_code, name)

                    if not product_code:
                        if existing:
                            product_code = existing.product_code
                        else:
                            product_code = self._build_product_code(name)

                    defaults = self._build_defaults(
                        {
                            "name": name,
                            "category": category,
                            "sub_category": subcategory,
                            "description": description,
                            "base_price": str(price),
                            "image": image_value,
                        },
                        existing=existing,
                    )

                    product, was_created = Product.objects.update_or_create(
                        product_code=product_code,
                        defaults=defaults,
                    )

                    if was_created:
                        created += 1
                    else:
                        updated += 1

                except Exception as exc:
                    skipped += 1
                    errors.append(f"Row {index}: {str(exc)}")

        return {
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "errors": errors[:100],
            "message": "Product CSV import completed.",
        }

    @action(detail=False, methods=["post"], url_path="import-csv")
    def import_csv(self, request):
        uploaded = request.FILES.get("file")

        try:
            if uploaded:
                decoded_text = uploaded.read().decode("utf-8-sig", errors="ignore")
                reader = csv.DictReader(io.StringIO(decoded_text))
                result = self._import_rows(reader)
                result["source"] = "uploaded"
                return Response(result, status=status.HTTP_200_OK)

            csv_path = os.path.join(settings.BASE_DIR, "products.csv")
            if not os.path.exists(csv_path):
                return Response(
                    {"message": f"CSV file not found at {csv_path}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            with open(csv_path, newline="", encoding="utf-8-sig") as csv_file:
                reader = csv.DictReader(csv_file)
                result = self._import_rows(reader)

            result["source"] = "server_default"
            return Response(result, status=status.HTTP_200_OK)

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
        .prefetch_related("emis", "emis__payments", "payments", get_subscription_delivery_prefetch())
        .all()
        .order_by("-created_at", "-id")
    )
    serializer_class = SubscriptionAdminSerializer

    def get_serializer_class(self):
        if self.action == "retrieve":
            return SubscriptionAdminDetailSerializer
        return SubscriptionAdminSerializer

    def get_queryset(self):
        if self.action == "retrieve":
            queryset = get_subscription_detail_queryset().order_by("-created_at", "-id")
        else:
            queryset = super().get_queryset()

        customer_param = (
            self.request.query_params.get("customer_id")
            or self.request.query_params.get("customer")
            or ""
        ).strip()

        product_param = (
            self.request.query_params.get("product_id")
            or self.request.query_params.get("product")
            or ""
        ).strip()

        batch_param = (
            self.request.query_params.get("batch_id")
            or self.request.query_params.get("batch")
            or ""
        ).strip()

        partner_param = (
            self.request.query_params.get("partner_id")
            or self.request.query_params.get("partner")
            or ""
        ).strip()

        status_filter = (self.request.query_params.get("status") or "").strip()
        plan_type_filter = (self.request.query_params.get("plan_type") or "").strip()
        q = (self.request.query_params.get("q") or "").strip()

        if customer_param:
            if customer_param.isdigit():
                queryset = queryset.filter(customer_id=int(customer_param))
            else:
                queryset = queryset.none()

        if product_param:
            if product_param.isdigit():
                queryset = queryset.filter(product_id=int(product_param))
            else:
                queryset = queryset.none()

        if batch_param:
            if batch_param.isdigit():
                queryset = queryset.filter(batch_id=int(batch_param))
            else:
                queryset = queryset.none()

        if partner_param:
            if partner_param.isdigit():
                queryset = queryset.filter(partner_id=int(partner_param))
            else:
                queryset = queryset.none()

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if plan_type_filter:
            queryset = queryset.filter(plan_type=plan_type_filter)

        if q:
            search_filter = (
                Q(customer__name__icontains=q)
                | Q(customer__phone__icontains=q)
                | Q(product__name__icontains=q)
                | Q(product__product_code__icontains=q)
                | Q(batch__batch_code__icontains=q)
                | Q(contract_reference__icontains=q)
                | Q(partner__username__icontains=q)
            )

            if q.isdigit():
                numeric_value = int(q)
                search_filter = (
                    search_filter
                    | Q(id=numeric_value)
                    | Q(customer_id=numeric_value)
                    | Q(product_id=numeric_value)
                    | Q(batch_id=numeric_value)
                    | Q(lucky_id__lucky_number=numeric_value)
                )

            queryset = queryset.filter(search_filter).distinct()

        return queryset

    def create(self, request, *args, **kwargs):
        """
        Force writable admin serializer and return fresh serialized row.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        subscription = serializer.save()

        output = self.get_serializer(subscription)
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()

        serializer = self.get_serializer(
            instance,
            data=request.data,
            partial=partial,
        )
        serializer.is_valid(raise_exception=True)
        subscription = serializer.save()

        output = self.get_serializer(subscription)
        return Response(output.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="search")
    def search(self, request):
        queryset = self.get_queryset()[:20]
        serializer = self.get_serializer(queryset, many=True)
        return Response(
            {
                "count": len(serializer.data),
                "results": serializer.data,
            }
        )

    def _build_reconciliation_attention_payload(self, queryset, sample_limit=200):
        rows = []
        flagged_count = 0
        sampled = list(queryset[:sample_limit])

        for item in sampled:
            paid = item.total_paid()
            waived = sum(
                (emi.amount for emi in item.emis.all() if emi.status == EmiStatus.WAIVED),
                MONEY_ZERO,
            )
            pending_outstanding = sum(
                (emi.amount for emi in item.emis.all() if emi.status == EmiStatus.PENDING),
                MONEY_ZERO,
            )

            computed = item.total_amount - paid - waived
            if computed < MONEY_ZERO:
                computed = MONEY_ZERO

            delta = abs(computed - pending_outstanding)

            if delta > Decimal("0.01"):
                flagged_count += 1
                rows.append(
                    {
                        "subscription_id": item.id,
                        "subscription_number": f"SUB-{item.id}",
                        "customer_name": item.customer.name,
                        "total_amount": str(item.total_amount),
                        "paid_amount": str(paid),
                        "waived_amount": str(waived),
                        "pending_outstanding": str(pending_outstanding),
                        "computed_outstanding": str(computed),
                        "delta": str(delta),
                    }
                )

        return {
            "checked_count": len(sampled),
            "flagged_count": flagged_count,
            "results": rows,
            "note": (
                "Checks first 200 filtered subscriptions for quick UI attention. "
                "Use reconcile_financials for full-portfolio verification."
            ),
        }

    @action(detail=False, methods=["get"], url_path="kpis")
    def kpis(self, request):
        queryset = self.get_queryset()
        today = timezone.localdate()

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
        total_contract_value = aggregates["total_contract_value"] or MONEY_ZERO
        total_waived_value = aggregates["total_waived_value"] or MONEY_ZERO

        pending_emis = Emi.objects.filter(
            subscription__in=queryset,
            status=EmiStatus.PENDING,
        )
        pending_emis_count = pending_emis.count()
        overdue_emis_count = pending_emis.filter(due_date__lt=today).count()

        today_collection = (
            Payment.objects.filter(
                subscription__in=queryset,
                payment_date=today,
            )
            .exclude(allocation_metadata__reversal__is_reversed=True)
            .aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

        ledger_payments = (
            FinancialLedger.objects.filter(
                emi__subscription__in=queryset,
                entry_type=LedgerEntryType.EMI_PAYMENT,
            ).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )
        ledger_reversals = (
            FinancialLedger.objects.filter(
                emi__subscription__in=queryset,
                entry_type=LedgerEntryType.PAYMENT_REVERSAL,
            ).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

        total_outstanding = (
            total_contract_value
            - ledger_payments
            + ledger_reversals
            - total_waived_value
        )
        if total_outstanding < MONEY_ZERO:
            total_outstanding = MONEY_ZERO

        reconciliation_attention = self._build_reconciliation_attention_payload(queryset)

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
                    total_waived_value
                ),
                "pending_emis": pending_emis_count,
                "overdue_emis": overdue_emis_count,
                "today_collection": str(today_collection),
                "total_outstanding": str(total_outstanding),
                "reconciliation_attention_count": reconciliation_attention["flagged_count"],
            }
        )

    @action(detail=False, methods=["get"], url_path="reconciliation-attention")
    def reconciliation_attention(self, request):
        queryset = self.get_queryset()
        return Response(self._build_reconciliation_attention_payload(queryset))

    @action(detail=True, methods=["get"], url_path="timeline")
    def timeline(self, request, pk=None):
        subscription = self.get_object()

        subscription_items = AuditLog.objects.select_related("performed_by").filter(
            model_name="Subscription",
            object_id=subscription.id,
        )

        emi_items = AuditLog.objects.select_related("performed_by").filter(
            model_name="Emi",
            object_id__in=subscription.emis.values_list("id", flat=True),
        )

        items = (subscription_items | emi_items).order_by("-created_at")

        return Response(
            {
                "count": items.count(),
                "results": _serialize_audit_queryset(items),
            }
        )
