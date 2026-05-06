from decimal import Decimal, ROUND_HALF_UP

from dateutil.relativedelta import relativedelta
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from accounts.models import User, UserRole
from accounting.models import FinanceAccount
from api.v1.serializers.delivery import AdminSubscriptionDeliveryReadSerializer
from api.v1.serializers.media import serialize_media_url
from crm.services.party_service import sync_party_for_customer
from inventory.models import StockLocation
from subscriptions.models import (
    AuditLog,
    Batch,
    Commission,
    CommissionStatus,
    ContractRefundStatus,
    ContractReturnConditionStatus,
    Customer,
    DocumentVerificationStatus,
    DrawEligibilitySnapshot,
    Emi,
    EmiStatus,
    LeaseSubscriptionProfile,
    LuckyDraw,
    LuckyId,
    LuckyIdStatus,
    MONEY_ZERO,
    Payment,
    PaymentMethod,
    PlanType,
    Product,
    ProductCategoryMaster,
    ProductSubcategoryMaster,
    ProductUnitOfMeasureMaster,
    RentSubscriptionProfile,
    Subscription,
    SubscriptionDocument,
    SubscriptionDocumentType,
    SubscriptionStatus,
    KycStatus,
)
from subscriptions.services.customer_account_service import sync_customer_login_identity
from subscriptions.services.delivery_service import (
    build_subscription_delivery_history,
    build_subscription_delivery_summary,
    get_current_subscription_delivery,
)
from subscriptions.services.subscription_financial_service import (
    build_subscription_financial_snapshot,
)


def q2(value: Decimal) -> Decimal:
    return (value or MONEY_ZERO).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def build_emi_amounts(total_amount: Decimal, tenure_months: int) -> list[Decimal]:
    """
    Split total_amount into tenure_months installments.
    First n-1 installments use standard rounded amount.
    Last installment absorbs remainder so total matches exactly.
    """
    total_amount = q2(total_amount)

    if tenure_months <= 0:
        raise serializers.ValidationError(
            {"tenure_months": "Tenure must be greater than zero."}
        )

    standard_amount = q2(total_amount / Decimal(tenure_months))
    amounts: list[Decimal] = []

    running_total = MONEY_ZERO
    for month_no in range(1, tenure_months + 1):
        if month_no < tenure_months:
            amount = standard_amount
        else:
            amount = q2(total_amount - running_total)

        amounts.append(amount)
        running_total = q2(running_total + amount)

    return amounts


class BatchAdminSerializer(serializers.ModelSerializer):
    available_slots = serializers.SerializerMethodField()
    subscription_count = serializers.IntegerField(read_only=True)
    lucky_id_count = serializers.IntegerField(read_only=True)
    winner_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Batch
        fields = "__all__"
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "available_slots",
            "subscription_count",
            "lucky_id_count",
            "winner_count",
        ]

    def get_available_slots(self, obj):
        return obj.lucky_ids.filter(status=LuckyIdStatus.AVAILABLE).count()

    def validate(self, attrs):
        instance = getattr(self, "instance", None)

        if instance:
            data = {}
            for field in [
                "batch_code",
                "total_slots",
                "duration_months",
                "draw_day",
                "start_date",
                "status",
            ]:
                data[field] = attrs.get(field, getattr(instance, field))
        else:
            data = attrs.copy()

        candidate = Batch(**data)

        if instance:
            candidate.pk = instance.pk
            candidate.id = instance.id
            candidate._state.adding = False
            candidate._state.db = instance._state.db

        try:
            candidate.full_clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict or {"detail": exc.messages}
            )

        return attrs


# backend/api/v1/serializers/admin_resources.py

# ... imports remain unchanged ...


def _log_customer_account_audit(*, action_type: str, customer: Customer, performed_by=None, metadata=None):
    AuditLog.objects.create(
        action_type=action_type,
        model_name="Customer",
        object_id=customer.id,
        performed_by=performed_by,
        metadata=metadata or {},
    )

class CustomerAdminSerializer(serializers.ModelSerializer):
    username = serializers.CharField(write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    email = serializers.EmailField(required=False, allow_blank=True)

    user_username = serializers.CharField(source="user.username", read_only=True)
    kyc_reviewed_by_username = serializers.CharField(
        source="kyc_reviewed_by.username",
        read_only=True,
    )
    kyc_reviewed_at = serializers.DateTimeField(read_only=True)
    kyc_rejection_reason = serializers.CharField(read_only=True)

    # Status computed from user.is_active
    status = serializers.SerializerMethodField()

    # Subscription aggregates (from annotations)
    active_subscription_count = serializers.IntegerField(read_only=True)
    total_subscription_value = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    address = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(required=False, allow_blank=True)
    user_is_active = serializers.BooleanField(source="user.is_active", read_only=True)

    # Phase 1 – additive read-only fields
    customer_source = serializers.CharField(read_only=True)
    customer_code = serializers.CharField(read_only=True)
    profile_photo_url = serializers.SerializerMethodField()
    gstin = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = (
            "id",
            "user",
            "user_username",
            "user_is_active",
            "name",
            "phone",
            "address",
            "city",
            "kyc_status",
            "kyc_reviewed_by_username",
            "kyc_reviewed_at",
            "kyc_rejection_reason",
            "created_at",
            "username",
            "password",
            "email",
            "status",
            "active_subscription_count",
            "total_subscription_value",
            "customer_source",
            "customer_code",
            "profile_photo_url",
            "gstin",
        )
        read_only_fields = (
            "id",
            "user_is_active",
            "created_at",
            "kyc_reviewed_by_username",
            "kyc_reviewed_at",
            "kyc_rejection_reason",
            "active_subscription_count",
            "total_subscription_value",
            "customer_source",
            "customer_code",
            "profile_photo_url",
            "gstin",
        )
        extra_kwargs = {"user": {"required": False}}

    def get_profile_photo_url(self, obj):
        request = self.context.get("request")
        if not obj.profile_photo:
            return None
        try:
            if request:
                return request.build_absolute_uri(obj.profile_photo.url)
            return obj.profile_photo.url
        except Exception:
            return None

    def get_status(self, obj):
        return "ACTIVE" if obj.user.is_active else "INACTIVE"

    def get_gstin(self, obj):
        latest_direct_sale_gstin = (
            obj.direct_sales.exclude(customer_gstin__isnull=True)
            .exclude(customer_gstin__exact="")
            .order_by("-id")
            .values_list("customer_gstin", flat=True)
            .first()
        )
        if latest_direct_sale_gstin:
            return latest_direct_sale_gstin
        latest_invoice_gstin = (
            obj.billing_invoices.exclude(customer_gstin__isnull=True)
            .exclude(customer_gstin__exact="")
            .order_by("-id")
            .values_list("customer_gstin", flat=True)
            .first()
        )
        return latest_invoice_gstin or ""

    def to_representation(self, instance):
        payload = super().to_representation(instance)
        payload["email"] = (getattr(instance.user, "email", "") or "").strip()
        return payload

    def validate(self, attrs):
        username = attrs.pop("username", None)
        password = attrs.pop("password", None)
        email = attrs.pop("email", None) if "email" in attrs else None

        attrs["_new_username"] = username
        attrs["_new_password"] = password
        attrs["_new_email"] = email

        user = attrs.get("user") or getattr(self.instance, "user", None)
        final_email = (
            (email or "").strip()
            if email is not None
            else (getattr(user, "email", "") or "").strip()
        )

        if self.instance is None and user is None and (not username or not password):
            raise serializers.ValidationError(
                "Provide an existing user id, or provide username + password to create a new customer login."
            )

        if username:
            duplicate_user = User.objects.filter(username=username)
            if self.instance and self.instance.user_id:
                duplicate_user = duplicate_user.exclude(pk=self.instance.user_id)
            if duplicate_user.exists():
                raise serializers.ValidationError({"username": "Username already exists."})

        if user and user.role != UserRole.CUSTOMER:
            raise serializers.ValidationError(
                {"user": "Selected user must have CUSTOMER role."}
            )

        if user and hasattr(user, "customer_profile"):
            if not self.instance or user.customer_profile.pk != self.instance.pk:
                raise serializers.ValidationError(
                    {"user": "Selected user already has customer profile."}
                )

        if not final_email:
            raise serializers.ValidationError(
                {
                    "email": (
                        "Email is required for customer access and password reset. "
                        "Add a valid email before saving this account."
                    )
                }
            )

        duplicate_email = User.objects.filter(email__iexact=final_email)
        if user is not None:
            duplicate_email = duplicate_email.exclude(pk=user.pk)
        if duplicate_email.exists():
            raise serializers.ValidationError({"email": "Email already exists."})

        phone = attrs.get("phone")
        if phone:
            duplicate = Customer.objects.filter(phone=phone)
            if self.instance:
                duplicate = duplicate.exclude(pk=self.instance.pk)
            if duplicate.exists():
                raise serializers.ValidationError(
                    {"phone": "Customer with this phone already exists."}
                )

            duplicate_user_phone = User.objects.filter(phone=phone)
            if user is not None:
                duplicate_user_phone = duplicate_user_phone.exclude(pk=user.pk)
            if duplicate_user_phone.exists():
                raise serializers.ValidationError({"phone": "Phone already exists."})

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        username = validated_data.pop("_new_username", None)
        password = validated_data.pop("_new_password", None)
        email = (validated_data.pop("_new_email", None) or "").strip()
        request = self.context.get("request")

        user = validated_data.get("user")
        if user is None:
            user = User.objects.create_user(
                username=username,
                password=password,
                email=email,
                role=UserRole.CUSTOMER,
                phone=validated_data.get("phone", ""),
                first_name=validated_data.get("name", ""),
            )
            validated_data["user"] = user
        else:
            user.email = email
            user.phone = validated_data.get("phone", "")
            user.first_name = validated_data.get("name", "")
            if username:
                user.username = username
            if password:
                user.set_password(password)
            user.save()

        customer = Customer.objects.create(**validated_data)
        sync_customer_login_identity(
            customer,
            name=customer.name,
            phone=customer.phone,
            email=email,
            address=customer.address,
            city=customer.city,
        )
        _log_customer_account_audit(
            action_type=AuditLog.ActionType.USER_CREATED,
            customer=customer,
            performed_by=getattr(request, "user", None),
            metadata={
                "origin": "ADMIN_CUSTOMER_WORKFLOW",
                "user_id": customer.user_id,
            },
        )
        sync_party_for_customer(
            customer,
            performed_by=getattr(request, "user", None),
        )
        return customer

    @transaction.atomic
    def update(self, instance, validated_data):
        username = validated_data.pop("_new_username", None)
        password = validated_data.pop("_new_password", None)
        email = validated_data.pop("_new_email", None)
        request = self.context.get("request")

        user = validated_data.get("user") or instance.user
        final_email = (
            (email or "").strip()
            if email is not None
            else (getattr(user, "email", "") or "").strip()
        )

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if username:
            user.username = username
        if password:
            user.set_password(password)

        sync_customer_login_identity(
            instance,
            name=instance.name,
            phone=instance.phone,
            email=final_email,
            address=instance.address,
            city=instance.city,
        )
        if username or password:
            user.save()

        _log_customer_account_audit(
            action_type=AuditLog.ActionType.USER_UPDATED,
            customer=instance,
            performed_by=getattr(request, "user", None),
            metadata={
                "origin": "ADMIN_CUSTOMER_WORKFLOW",
                "user_id": instance.user_id,
            },
        )
        sync_party_for_customer(
            instance,
            performed_by=getattr(request, "user", None),
        )

        return instance


class CustomerKycDecisionSerializer(serializers.Serializer):
    """
    Backward-compatible KYC decision serializer.
    Accepts VERIFIED (legacy), APPROVED (Phase 1 alias), REJECTED, PENDING, SUBMITTED.
    """

    status = serializers.ChoiceField(
        choices=[
            KycStatus.VERIFIED,
            KycStatus.APPROVED,
            KycStatus.REJECTED,
            KycStatus.PENDING,
            KycStatus.SUBMITTED,
        ]
    )
    reason = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )

    def validate(self, attrs):
        status_value = attrs["status"]
        reason = (attrs.get("reason") or "").strip()

        if status_value == KycStatus.REJECTED and not reason:
            raise serializers.ValidationError(
                {"reason": "Reason is required when rejecting KYC."}
            )

        attrs["reason"] = reason
        return attrs


class EmiAdminSerializer(serializers.ModelSerializer):
    customer = serializers.IntegerField(source="subscription.customer_id", read_only=True)
    customer_name = serializers.CharField(
        source="subscription.customer.name",
        read_only=True,
    )
    customer_phone = serializers.CharField(
        source="subscription.customer.phone",
        read_only=True,
    )
    subscription_status = serializers.CharField(
        source="subscription.status",
        read_only=True,
    )
    batch = serializers.IntegerField(source="subscription.batch_id", read_only=True)
    batch_code = serializers.CharField(
        source="subscription.batch.batch_code",
        read_only=True,
    )
    lucky_id = serializers.IntegerField(
        source="subscription.lucky_id_id",
        read_only=True,
    )
    lucky_number = serializers.IntegerField(
        source="subscription.lucky_id.lucky_number",
        read_only=True,
    )
    total_paid = serializers.SerializerMethodField()
    balance_amount = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    overdue_days = serializers.SerializerMethodField()

    class Meta:
        model = Emi
        fields = (
            "id",
            "subscription",
            "customer",
            "customer_name",
            "customer_phone",
            "subscription_status",
            "batch",
            "batch_code",
            "lucky_id",
            "lucky_number",
            "month_no",
            "due_date",
            "amount",
            "status",
            "total_paid",
            "balance_amount",
            "is_overdue",
            "overdue_days",
        )

    def get_total_paid(self, obj):
        return str(obj.total_paid())

    def get_balance_amount(self, obj):
        return str(obj.balance_amount())

    def get_is_overdue(self, obj):
        return bool(obj.is_overdue())

    def get_overdue_days(self, obj):
        if not obj.is_overdue():
            return 0
        return max((timezone.localdate() - obj.due_date).days, 0)

    def validate(self, attrs):
        data = {}
        if self.instance:
            for field in ["subscription", "month_no", "due_date", "amount", "status"]:
                data[field] = attrs.get(field, getattr(self.instance, field))
        else:
            data = attrs.copy()

        candidate = Emi(**data)
        if self.instance:
            candidate.pk = self.instance.pk

        try:
            candidate.full_clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict or {"detail": exc.messages}
            )

        return attrs


class LuckyDrawAdminSerializer(serializers.ModelSerializer):
    batch_code = serializers.CharField(source="batch.batch_code", read_only=True)
    draw_commit_id = serializers.IntegerField(source="draw_commit.id", read_only=True)

    winner_lucky_number = serializers.IntegerField(
        source="winner_lucky_id.lucky_number",
        read_only=True,
    )

    winner_subscription_id = serializers.IntegerField(
        source="winner_subscription.id",
        read_only=True,
    )

    winner_subscription_number = serializers.SerializerMethodField()
    winner_customer_name = serializers.SerializerMethodField()
    public_commit_hash = serializers.SerializerMethodField()
    commitment_published_at = serializers.SerializerMethodField()
    eligible_snapshot_count = serializers.SerializerMethodField()
    verification_status = serializers.SerializerMethodField()
    public_verification_status = serializers.SerializerMethodField()
    public_winner_name_masked = serializers.SerializerMethodField()
    public_explanation = serializers.SerializerMethodField()

    class Meta:
        model = LuckyDraw
        fields = (
            "id",
            "batch",
            "batch_code",
            "draw_commit_id",
            "committed_hash",
            "revealed_seed",
            "public_commit_hash",
            "commitment_published_at",
            "eligible_snapshot_count",
            "winner_lucky_id",
            "winner_lucky_number",
            "winner_subscription",
            "winner_subscription_id",
            "winner_subscription_number",
            "winner_customer_name",
            "public_winner_name_masked",
            "draw_date",
            "draw_month",
            "is_revealed",
            "revealed_at",
            "verification_status",
            "public_verification_status",
            "public_explanation",
            "waived_emi_count",
            "waived_amount",
            "waiver_scope",
            "created_at",
        )
        read_only_fields = (
            "id",
            "batch_code",
            "draw_commit_id",
            "winner_lucky_number",
            "winner_subscription_id",
            "winner_subscription_number",
            "winner_customer_name",
            "public_commit_hash",
            "commitment_published_at",
            "eligible_snapshot_count",
            "public_winner_name_masked",
            "revealed_at",
            "verification_status",
            "public_verification_status",
            "public_explanation",
            "waived_emi_count",
            "waived_amount",
            "waiver_scope",
            "created_at",
        )

    def get_winner_subscription_number(self, obj):
        subscription = getattr(obj, "winner_subscription", None)
        if not subscription:
            return None
        return (
            getattr(subscription, "subscription_number", None)
            or getattr(subscription, "contract_reference", None)
            or f"SUB-{subscription.id}"
        )

    def get_winner_customer_name(self, obj):
        subscription = getattr(obj, "winner_subscription", None)
        if not subscription or not getattr(subscription, "customer_id", None):
            return None
        return getattr(subscription.customer, "name", None)

    def get_public_commit_hash(self, obj):
        draw_commit = getattr(obj, "draw_commit", None)
        if draw_commit and getattr(draw_commit, "public_commit_hash", None):
            return draw_commit.public_commit_hash
        return obj.committed_hash

    def get_commitment_published_at(self, obj):
        draw_commit = getattr(obj, "draw_commit", None)
        if draw_commit and getattr(draw_commit, "committed_at", None):
            return draw_commit.committed_at
        return getattr(obj, "created_at", None) or obj.draw_date

    def get_eligible_snapshot_count(self, obj):
        draw_commit = getattr(obj, "draw_commit", None)
        if not draw_commit:
            return 0
        return DrawEligibilitySnapshot.objects.filter(
            batch=obj.batch,
            snapshot_version=draw_commit.snapshot_version,
        ).count()

    def get_verification_status(self, obj):
        return "coordinated" if getattr(obj, "draw_commit_id", None) else "legacy"

    def get_public_verification_status(self, obj):
        if getattr(obj, "draw_commit_id", None):
            return "revealed_verified" if obj.is_revealed else "committed_unrevealed"
        return "legacy_revealed" if obj.is_revealed else "legacy_committed"

    def get_public_winner_name_masked(self, obj):
        subscription = getattr(obj, "winner_subscription", None)
        if not subscription or not getattr(subscription, "customer_id", None):
            return None
        raw = getattr(subscription.customer, "name", None)
        if not raw:
            return None
        normalized = " ".join(part for part in str(raw).strip().split(" ") if part)
        if not normalized:
            return None
        parts = normalized.split(" ")
        if len(parts) == 1:
            token = parts[0]
            if len(token) <= 2:
                return f"{token[0]}*" if token else None
            return f"{token[:2]}***"
        first = parts[0]
        last_initial = parts[-1][:1].upper()
        first_masked = f"{first[:2]}***" if len(first) > 2 else f"{first[:1]}*"
        return f"{first_masked} {last_initial}."

    def get_public_explanation(self, obj):
        return (
            "The commitment hash is like a sealed envelope: it is published first, "
            "then the seed is revealed later so the draw can be verified against the original commitment."
        )

    def validate(self, attrs):
        data = {}
        if self.instance:
            for field in [
                "batch",
                "committed_hash",
                "revealed_seed",
                "winner_lucky_id",
                "winner_subscription",
                "draw_date",
                "draw_month",
                "is_revealed",
                "revealed_at",
                "waived_emi_count",
                "waived_amount",
                "waiver_scope",
            ]:
                data[field] = attrs.get(field, getattr(self.instance, field))
        else:
            data = attrs.copy()

        candidate = LuckyDraw(**data)
        if self.instance:
            candidate.pk = self.instance.pk
            candidate.id = self.instance.id
            candidate._state.adding = False
            candidate._state.db = self.instance._state.db

        try:
            candidate.full_clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict or {"detail": exc.messages}
            )

        return attrs


class LuckyIdAdminSerializer(serializers.ModelSerializer):
    batch_code = serializers.CharField(source="batch.batch_code", read_only=True)
    customer_name = serializers.SerializerMethodField()
    subscription_id = serializers.SerializerMethodField()
    subscription_number = serializers.SerializerMethodField()

    class Meta:
        model = LuckyId
        fields = [
            "id",
            "batch",
            "batch_code",
            "lucky_number",
            "status",
            "customer_name",
            "subscription_id",
            "subscription_number",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "batch_code",
            "customer_name",
            "subscription_id",
            "subscription_number",
            "created_at",
        ]

    def _linked_subscription(self, obj):
        cache = getattr(self, "_linked_subscription_cache", None)
        if cache is None:
            cache = {}
            self._linked_subscription_cache = cache

        if obj.pk not in cache:
            cache[obj.pk] = (
                Subscription.objects.select_related("customer")
                .filter(lucky_id=obj)
                .order_by("-created_at", "-id")
                .first()
            )

        return cache[obj.pk]

    def get_customer_name(self, obj):
        subscription = self._linked_subscription(obj)
        if subscription and getattr(subscription, "customer_id", None):
            return getattr(subscription.customer, "name", None)
        return None

    def get_subscription_id(self, obj):
        subscription = self._linked_subscription(obj)
        return subscription.id if subscription else None

    def get_subscription_number(self, obj):
        subscription = self._linked_subscription(obj)
        if not subscription:
            return None

        return (
            getattr(subscription, "subscription_number", None)
            or getattr(subscription, "subscription_code", None)
            or f"SUB-{subscription.id}"
        )

    def validate(self, attrs):
        instance = self.instance
        if instance and instance.batch_id and "status" in attrs:
            if attrs["status"] != instance.status:
                from subscriptions.services.batch_draw_coordination_service import (
                    assert_subscription_eligibility_mutations_allowed,
                )

                assert_subscription_eligibility_mutations_allowed(instance.batch)
        return attrs


class PaymentAdminSerializer(serializers.ModelSerializer):
    customer_id = serializers.IntegerField(source="customer.id", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    branch_id = serializers.IntegerField(source="branch.id", read_only=True)
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    cash_counter_id = serializers.IntegerField(source="cash_counter.id", read_only=True)
    cash_counter_code = serializers.CharField(source="cash_counter.code", read_only=True)
    cash_counter_name = serializers.CharField(source="cash_counter.name", read_only=True)
    finance_account_id = serializers.IntegerField(source="finance_account.id", read_only=True)
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True)

    subscription_id = serializers.IntegerField(source="subscription.id", read_only=True)
    subscription_number = serializers.SerializerMethodField()
    subscription_status = serializers.CharField(
        source="subscription.status",
        read_only=True,
    )
    subscription_plan_type = serializers.CharField(
        source="subscription.plan_type",
        read_only=True,
    )

    product_id = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    product_code = serializers.SerializerMethodField()

    batch_id = serializers.SerializerMethodField()
    batch_code = serializers.SerializerMethodField()

    partner_id = serializers.SerializerMethodField()
    partner_username = serializers.SerializerMethodField()

    lucky_id = serializers.SerializerMethodField()
    lucky_number = serializers.SerializerMethodField()

    emi_id = serializers.IntegerField(source="emi.id", read_only=True)
    emi_month_no = serializers.IntegerField(source="emi.month_no", read_only=True)
    emi_due_date = serializers.SerializerMethodField()
    emi_amount = serializers.SerializerMethodField()
    emi_status = serializers.SerializerMethodField()

    collected_by_id = serializers.SerializerMethodField()
    collected_by_username = serializers.SerializerMethodField()

    verified_by_id = serializers.SerializerMethodField()
    verified_by_username = serializers.SerializerMethodField()

    plan_type_hint = serializers.CharField(read_only=True)
    is_reversed = serializers.SerializerMethodField()
    reversal_metadata = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = (
            "id",
            "customer",
            "customer_id",
            "customer_name",
            "customer_phone",
            "branch_id",
            "branch_code",
            "branch_name",
            "cash_counter_id",
            "cash_counter_code",
            "cash_counter_name",
            "finance_account_id",
            "finance_account_name",
            "subscription",
            "subscription_id",
            "subscription_number",
            "subscription_status",
            "subscription_plan_type",
            "product_id",
            "product_name",
            "product_code",
            "batch_id",
            "batch_code",
            "partner_id",
            "partner_username",
            "lucky_id",
            "lucky_number",
            "emi",
            "emi_id",
            "emi_month_no",
            "emi_due_date",
            "emi_amount",
            "emi_status",
            "amount",
            "method",
            "reference_no",
            "payment_date",
            "plan_type_hint",
            "allocation_metadata",
            "is_reversed",
            "reversal_metadata",
            "collected_by",
            "collected_by_id",
            "collected_by_username",
            "verified_by",
            "verified_by_id",
            "verified_by_username",
            "created_at",
        )
        read_only_fields = fields

    def get_subscription_number(self, obj):
        subscription = getattr(obj, "subscription", None)
        if not subscription:
            return None

        return (
            getattr(subscription, "subscription_number", None)
            or getattr(subscription, "subscription_code", None)
            or getattr(subscription, "contract_reference", None)
            or f"SUB-{subscription.id}"
        )

    def get_product_id(self, obj):
        subscription = getattr(obj, "subscription", None)
        product = getattr(subscription, "product", None) if subscription else None
        return getattr(product, "id", None)

    def get_product_name(self, obj):
        subscription = getattr(obj, "subscription", None)
        product = getattr(subscription, "product", None) if subscription else None
        return getattr(product, "name", None)

    def get_product_code(self, obj):
        subscription = getattr(obj, "subscription", None)
        product = getattr(subscription, "product", None) if subscription else None
        return getattr(product, "product_code", None)

    def get_batch_id(self, obj):
        subscription = getattr(obj, "subscription", None)
        batch = getattr(subscription, "batch", None) if subscription else None
        return getattr(batch, "id", None)

    def get_batch_code(self, obj):
        subscription = getattr(obj, "subscription", None)
        batch = getattr(subscription, "batch", None) if subscription else None
        return getattr(batch, "batch_code", None)

    def get_partner_id(self, obj):
        subscription = getattr(obj, "subscription", None)
        partner = getattr(subscription, "partner", None) if subscription else None
        return getattr(partner, "id", None)

    def get_partner_username(self, obj):
        subscription = getattr(obj, "subscription", None)
        partner = getattr(subscription, "partner", None) if subscription else None
        return getattr(partner, "username", None) if partner else None

    def get_lucky_id(self, obj):
        subscription = getattr(obj, "subscription", None)
        lucky_id = getattr(subscription, "lucky_id", None) if subscription else None
        return getattr(lucky_id, "id", None)

    def get_lucky_number(self, obj):
        subscription = getattr(obj, "subscription", None)
        lucky_id = getattr(subscription, "lucky_id", None) if subscription else None
        return getattr(lucky_id, "lucky_number", None)

    def get_emi_due_date(self, obj):
        emi = getattr(obj, "emi", None)
        return getattr(emi, "due_date", None)

    def get_emi_amount(self, obj):
        emi = getattr(obj, "emi", None)
        amount = getattr(emi, "amount", None)
        return str(amount) if amount is not None else None

    def get_emi_status(self, obj):
        emi = getattr(obj, "emi", None)
        return getattr(emi, "status", None)

    def get_collected_by_id(self, obj):
        user = getattr(obj, "collected_by", None)
        return getattr(user, "id", None)

    def get_collected_by_username(self, obj):
        user = getattr(obj, "collected_by", None)
        return getattr(user, "username", None)

    def get_verified_by_id(self, obj):
        user = getattr(obj, "verified_by", None)
        return getattr(user, "id", None)

    def get_verified_by_username(self, obj):
        user = getattr(obj, "verified_by", None)
        return getattr(user, "username", None)

    def get_is_reversed(self, obj):
        metadata = getattr(obj, "allocation_metadata", None) or {}
        reversal = metadata.get("reversal") or {}
        return bool(reversal.get("is_reversed"))

    def get_reversal_metadata(self, obj):
        metadata = getattr(obj, "allocation_metadata", None) or {}
        reversal = metadata.get("reversal") or {}
        return reversal


class AdminPaymentCollectSerializer(serializers.Serializer):
    emi = serializers.PrimaryKeyRelatedField(queryset=Emi.objects.none())
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    payment_method = serializers.ChoiceField(choices=PaymentMethod.choices)
    payment_date = serializers.DateField()
    finance_account_id = serializers.PrimaryKeyRelatedField(
        source="finance_account",
        queryset=FinanceAccount.objects.select_related("chart_account").all()
    )
    branch_id = serializers.IntegerField(required=False, min_value=1)
    cash_counter_id = serializers.IntegerField(required=False, min_value=1)
    reference_no = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=100,
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self.fields["emi"].queryset = Emi.objects.select_related(
            "subscription",
            "subscription__customer",
            "subscription__product",
            "subscription__partner",
            "subscription__batch",
            "subscription__lucky_id",
        ).all()

    def validate_amount(self, value):
        if Decimal(value) <= MONEY_ZERO:
            raise serializers.ValidationError(
                "Payment amount must be greater than zero."
            )
        return value

    def validate_reference_no(self, value):
        if value is None:
            return None
        value = value.strip()
        return value or None

    def validate_notes(self, value):
        if value is None:
            return None
        value = value.strip()
        return value or None

    def validate(self, attrs):
        emi = attrs["emi"]
        subscription = emi.subscription

        if subscription.customer_id != subscription.customer.id:
            raise serializers.ValidationError(
                {"emi": "Invalid subscription/customer relationship."}
            )

        if subscription.status in {
            SubscriptionStatus.COMPLETED,
            SubscriptionStatus.DEFAULTED,
        }:
            raise serializers.ValidationError(
                {"emi": "Cannot collect payment for a closed subscription."}
            )

        if emi.status == EmiStatus.WAIVED:
            raise serializers.ValidationError(
                {"emi": "Cannot collect payment for a waived EMI."}
            )

        return attrs


class AdminPaymentCollectResponseSerializer(serializers.Serializer):
    payment = PaymentAdminSerializer()
    emi = serializers.DictField()
    subscription = serializers.DictField()


class AdminPaymentReverseSerializer(serializers.Serializer):
    reason = serializers.CharField(
        required=True,
        allow_blank=False,
        trim_whitespace=True,
        max_length=500,
    )

    def validate_reason(self, value):
        reason = (value or "").strip()
        if not reason:
            raise serializers.ValidationError("Reversal reason is required.")
        return reason


class ProductAdminSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(required=False, allow_null=True)
    clear_image = serializers.BooleanField(required=False, write_only=True, default=False)
    category_master_name = serializers.CharField(source="category_master.name", read_only=True)
    subcategory_master_name = serializers.CharField(source="subcategory_master.name", read_only=True)
    unit_of_measure_master_name = serializers.CharField(source="unit_of_measure_master.name", read_only=True)
    inventory_profile_id = serializers.SerializerMethodField()
    inventory_ready = serializers.SerializerMethodField()
    inventory_stock_tracking_enabled = serializers.SerializerMethodField()
    inventory_delivery_stock_bridge_enabled = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "product_code",
            "name",
            "base_price",
            "category_master",
            "category_master_name",
            "subcategory_master",
            "subcategory_master_name",
            "category",
            "subcategory",
            "sku",
            "unit_of_measure_master",
            "unit_of_measure_master_name",
            "unit_of_measure",
            "description",
            "image",
            "clear_image",
            "is_active",
            "plan_type_default",
            "is_emi_enabled",
            "is_rent_enabled",
            "is_lease_enabled",
            "is_rent_ready",
            "is_lease_ready",
            # Phase 2 additive fields
            "is_direct_sale_enabled",
            "lifecycle_status",
            "inventory_profile_id",
            "inventory_ready",
            "inventory_stock_tracking_enabled",
            "inventory_delivery_stock_bridge_enabled",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "is_rent_ready",
            "is_lease_ready",
            "inventory_profile_id",
            "inventory_ready",
            "inventory_stock_tracking_enabled",
            "inventory_delivery_stock_bridge_enabled",
        ]

    def validate(self, data):
        instance = getattr(self, "instance", None)

        product_code = data.get(
            "product_code",
            instance.product_code if instance else None,
        )
        name = data.get(
            "name",
            instance.name if instance else None,
        )
        base_price = data.get(
            "base_price",
            instance.base_price if instance else None,
        )
        category = data.get(
            "category",
            instance.category if instance else "",
        )
        subcategory = data.get(
            "subcategory",
            instance.subcategory if instance else "",
        )
        sku = data.get(
            "sku",
            instance.sku if instance else None,
        )
        unit_of_measure = data.get(
            "unit_of_measure",
            instance.unit_of_measure if instance else "PCS",
        )
        unit_of_measure_master = data.get(
            "unit_of_measure_master",
            instance.unit_of_measure_master if instance else None,
        )
        category_master = data.get(
            "category_master",
            instance.category_master if instance else None,
        )
        subcategory_master = data.get(
            "subcategory_master",
            instance.subcategory_master if instance else None,
        )
        description = data.get(
            "description",
            instance.description if instance else "",
        )

        clear_image = data.get("clear_image", False)
        if clear_image:
            image = None
        else:
            image = data.get(
                "image",
                instance.image if instance else None,
            )

        is_active = data.get(
            "is_active",
            instance.is_active if instance else True,
        )
        is_emi_enabled = data.get(
            "is_emi_enabled",
            instance.is_emi_enabled if instance else True,
        )
        is_rent_enabled = data.get(
            "is_rent_enabled",
            instance.is_rent_enabled if instance else False,
        )
        is_lease_enabled = data.get(
            "is_lease_enabled",
            instance.is_lease_enabled if instance else False,
        )
        is_direct_sale_enabled = data.get(
            "is_direct_sale_enabled",
            instance.is_direct_sale_enabled if instance else True,
        )
        plan_type_default = data.get(
            "plan_type_default",
            instance.plan_type_default if instance else PlanType.EMI,
        )

        candidate = Product(
            product_code=product_code,
            name=name,
            base_price=base_price,
            category_master=category_master,
            subcategory_master=subcategory_master,
            category=category,
            subcategory=subcategory,
            sku=sku,
            unit_of_measure_master=unit_of_measure_master,
            unit_of_measure=unit_of_measure,
            description=description,
            image=image,
            is_active=is_active,
            plan_type_default=plan_type_default,
            is_emi_enabled=is_emi_enabled,
            is_rent_enabled=is_rent_enabled,
            is_lease_enabled=is_lease_enabled,
            is_direct_sale_enabled=is_direct_sale_enabled,
        )

        if instance:
            candidate.pk = instance.pk
            candidate.id = instance.id
            candidate._state.adding = False
            candidate._state.db = instance._state.db

        try:
            candidate.full_clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict)

        return data

    def get_inventory_profile_id(self, obj):
        try:
            return obj.inventory_profile.id
        except Exception:
            return None

    def get_inventory_ready(self, obj):
        return self.get_inventory_profile_id(obj) is not None

    def get_inventory_stock_tracking_enabled(self, obj):
        profile = getattr(obj, "inventory_profile", None)
        return bool(getattr(profile, "stock_tracking_enabled", False)) if profile is not None else False

    def get_inventory_delivery_stock_bridge_enabled(self, obj):
        profile = getattr(obj, "inventory_profile", None)
        return bool(getattr(profile, "delivery_stock_bridge_enabled", False)) if profile is not None else False

    def create(self, validated_data):
        validated_data.pop("clear_image", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        clear_image = bool(validated_data.pop("clear_image", False))
        if clear_image:
            validated_data["image"] = None
        return super().update(instance, validated_data)


class ProductCategoryMasterSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategoryMaster
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class ProductSubcategoryMasterSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = ProductSubcategoryMaster
        fields = [
            "id",
            "category",
            "category_name",
            "name",
            "description",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at", "category_name"]


class ProductUnitOfMeasureMasterSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductUnitOfMeasureMaster
        fields = [
            "id",
            "code",
            "name",
            "description",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class ProductInventoryProfilePrepareSerializer(serializers.Serializer):
    default_stock_location = serializers.PrimaryKeyRelatedField(
        queryset=StockLocation.objects.filter(is_active=True).order_by("name", "id"),
        required=False,
        allow_null=True,
    )
    stock_tracking_enabled = serializers.BooleanField(required=False, default=True)

    def update(self, instance, validated_data):
        clear_image = validated_data.pop("clear_image", False)

        if clear_image and instance.image:
            instance.image.delete(save=False)
            validated_data["image"] = None

        return super().update(instance, validated_data)

    def create(self, validated_data):
        clear_image = validated_data.pop("clear_image", False)
        if clear_image:
            validated_data["image"] = None
        return super().create(validated_data)

    def to_representation(self, instance):
        payload = super().to_representation(instance)
        payload["image"] = serialize_media_url(
            self.context.get("request"),
            getattr(instance, "image", None),
        )
        return payload


class SubscriptionAdminSerializer(serializers.ModelSerializer):
    branch_id = serializers.IntegerField(source="branch.id", read_only=True)
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)

    product_name = serializers.CharField(source="product.name", read_only=True)
    product_code = serializers.CharField(source="product.product_code", read_only=True)

    batch_code = serializers.CharField(source="batch.batch_code", read_only=True)
    batch_status = serializers.CharField(source="batch.status", read_only=True)

    lucky_number = serializers.IntegerField(source="lucky_id.lucky_number", read_only=True)
    fulfillment_status = serializers.CharField(read_only=True)
    delivery_status = serializers.SerializerMethodField()

    partner_name = serializers.CharField(source="partner.username", read_only=True)
    partner_phone = serializers.CharField(source="partner.phone", read_only=True)

    emi_count = serializers.SerializerMethodField()
    paid_emi_count = serializers.SerializerMethodField()
    pending_emi_count = serializers.SerializerMethodField()
    waived_emi_count = serializers.SerializerMethodField()

    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.select_related("user").all()
    )
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True)
    )
    partner = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role=UserRole.PARTNER),
        required=False,
        allow_null=True,
    )
    batch = serializers.PrimaryKeyRelatedField(
        queryset=Batch.objects.all(),
        required=False,
        allow_null=True,
    )
    lucky_id = serializers.PrimaryKeyRelatedField(
        queryset=LuckyId.objects.select_related("batch").all(),
        required=False,
        allow_null=True,
    )
    plan_type = serializers.ChoiceField(choices=PlanType.choices)
    tenure_months = serializers.IntegerField(min_value=1)
    start_date = serializers.DateField()

    total_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )
    monthly_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )
    waived_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )
    winner_month = serializers.IntegerField(read_only=True)

    class Meta:
        model = Subscription
        fields = (
            "id",
            "branch_id",
            "branch_code",
            "branch_name",
            "customer",
            "customer_name",
            "customer_phone",
            "product",
            "product_name",
            "product_code",
            "partner",
            "partner_name",
            "partner_phone",
            "batch",
            "batch_code",
            "batch_status",
            "lucky_id",
            "lucky_number",
            "plan_type",
            "tenure_months",
            "start_date",
            "total_amount",
            "monthly_amount",
            "status",
            "winner_month",
            "waived_amount",
            "delivery_status",
            "fulfillment_status",
            "created_at",
            "emi_count",
            "paid_emi_count",
            "pending_emi_count",
            "waived_emi_count",
        )
        read_only_fields = (
            "id",
            "branch_id",
            "branch_code",
            "branch_name",
            "total_amount",
            "monthly_amount",
            "waived_amount",
            "winner_month",
            "created_at",
            "delivery_status",
            "fulfillment_status",
            "customer_name",
            "customer_phone",
            "product_name",
            "product_code",
            "batch_code",
            "batch_status",
            "lucky_number",
            "partner_name",
            "partner_phone",
            "emi_count",
            "paid_emi_count",
            "pending_emi_count",
            "waived_emi_count",
        )

    def get_emi_count(self, obj):
        return obj.emis.count()

    def get_delivery_status(self, obj):
        current_delivery = get_current_subscription_delivery(obj)
        return getattr(current_delivery, "status", None)

    def get_paid_emi_count(self, obj):
        return obj.emis.filter(status=EmiStatus.PAID).count()

    def get_pending_emi_count(self, obj):
        return obj.emis.filter(status=EmiStatus.PENDING).count()

    def get_waived_emi_count(self, obj):
        return obj.emis.filter(status=EmiStatus.WAIVED).count()

    def validate(self, attrs):
        instance = self.instance

        plan_type = attrs.get("plan_type", getattr(instance, "plan_type", None))
        batch = attrs.get("batch", getattr(instance, "batch", None))
        lucky_id = attrs.get("lucky_id", getattr(instance, "lucky_id", None))
        tenure_months = attrs.get(
            "tenure_months",
            getattr(instance, "tenure_months", None),
        )
        product = attrs.get("product", getattr(instance, "product", None))
        status_value = attrs.get("status", getattr(instance, "status", None))

        if not product:
            raise serializers.ValidationError({"product": "Product is required."})

        # Phase 2: lifecycle status and plan-type eligibility guards (run before other checks)
        lifecycle = getattr(product, "lifecycle_status", "ACTIVE") or "ACTIVE"
        if lifecycle == "DISCONTINUED":
            raise serializers.ValidationError(
                {"product": f"Product '{product.name}' is discontinued and cannot be used for new contracts."}
            )
        if plan_type == "EMI" and not product.is_emi_enabled:
            raise serializers.ValidationError(
                {"product": f"Product '{product.name}' is not eligible for Advance EMI subscriptions."}
            )
        if plan_type == "RENT" and not product.is_rent_enabled:
            raise serializers.ValidationError(
                {"product": f"Product '{product.name}' is not eligible for Rent contracts."}
            )
        if plan_type == "LEASE" and not product.is_lease_enabled:
            raise serializers.ValidationError(
                {"product": f"Product '{product.name}' is not eligible for Lease contracts."}
            )

        if not tenure_months or tenure_months <= 0:
            raise serializers.ValidationError(
                {"tenure_months": "Tenure must be greater than zero."}
            )

        financial_structure_changed = any(
            field in attrs
            for field in ["product", "tenure_months", "batch", "lucky_id", "plan_type"]
        )

        if (
            instance
            and instance.batch_id
            and instance.plan_type == PlanType.EMI
        ):
            from subscriptions.services.batch_draw_coordination_service import (
                assert_subscription_eligibility_mutations_allowed,
            )

            new_customer = attrs.get("customer", instance.customer)
            if new_customer.pk != instance.customer_id:
                assert_subscription_eligibility_mutations_allowed(instance.batch)

            if "batch" in attrs:
                nb = attrs.get("batch")
                nb_id = nb.pk if nb else None
                if nb_id != instance.batch_id:
                    assert_subscription_eligibility_mutations_allowed(instance.batch)

            if "lucky_id" in attrs:
                nl = attrs["lucky_id"]
                nl_id = nl.pk if nl else None
                if nl_id != instance.lucky_id_id:
                    assert_subscription_eligibility_mutations_allowed(instance.batch)

        if instance and financial_structure_changed:
            has_payments = instance.payments.exists()
            has_paid_emi = instance.emis.filter(status=EmiStatus.PAID).exists()
            has_waived_emi = instance.emis.filter(status=EmiStatus.WAIVED).exists()
            is_finalized = instance.status in {
                SubscriptionStatus.WON,
                SubscriptionStatus.COMPLETED,
                SubscriptionStatus.DEFAULTED,
            }

            if has_payments or has_paid_emi or has_waived_emi or is_finalized:
                raise serializers.ValidationError(
                    "Cannot change product, tenure, batch, lucky ID, or plan type after payment or EMI activity has started."
                )

        if plan_type == PlanType.EMI:
            if not batch:
                raise serializers.ValidationError(
                    {"batch": "Batch is required for EMI subscription."}
                )

            if tenure_months != batch.duration_months:
                raise serializers.ValidationError(
                    {
                        "tenure_months": (
                            f"Tenure must match batch duration "
                            f"({batch.duration_months} months)."
                        )
                    }
                )

            if not lucky_id:
                next_lucky = (
                    LuckyId.objects
                    .filter(batch=batch, status=LuckyIdStatus.AVAILABLE)
                    .order_by("lucky_number", "id")
                    .first()
                )
                if not next_lucky:
                    raise serializers.ValidationError(
                        {"lucky_id": "No available Lucky ID in selected batch."}
                    )
                attrs["lucky_id"] = next_lucky
                lucky_id = next_lucky

            if lucky_id.batch_id != batch.id:
                raise serializers.ValidationError(
                    {"lucky_id": "Lucky ID must belong to selected batch."}
                )

            lucky_id_changed = instance is None or (
                instance and instance.lucky_id_id != lucky_id.id
            )

            if lucky_id_changed and lucky_id.status != LuckyIdStatus.AVAILABLE:
                raise serializers.ValidationError(
                    {"lucky_id": "Selected Lucky ID is already assigned."}
                )

        if plan_type in {PlanType.RENT, PlanType.LEASE}:
            if batch is not None or lucky_id is not None:
                raise serializers.ValidationError(
                    "Batch and Lucky ID are only allowed for EMI subscriptions."
                )

        if (
            instance
            and status_value == SubscriptionStatus.WON
            and instance.status != SubscriptionStatus.WON
        ):
            raise serializers.ValidationError(
                {"status": "Winning state must be assigned only through lucky draw reveal flow."}
            )

        if (
            instance
            and "status" in attrs
            and instance.status == SubscriptionStatus.WON
            and status_value != SubscriptionStatus.WON
        ):
            raise serializers.ValidationError(
                {
                    "status": (
                        "Winner state cannot be downgraded through generic subscription edit flow."
                    )
                }
            )

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        batch = validated_data.get("batch")
        plan_type = validated_data.get("plan_type")
        selected_lucky = validated_data.get("lucky_id")
        product = validated_data.get("product")
        tenure = validated_data.get("tenure_months") or 0

        if not product:
            raise serializers.ValidationError({"product": "Product is required."})
        if not plan_type:
            raise serializers.ValidationError({"plan_type": "Plan type is required."})
        if not tenure:
            raise serializers.ValidationError({"tenure_months": "Tenure is required."})
        if not validated_data.get("start_date"):
            raise serializers.ValidationError({"start_date": "Start date is required."})
        if not validated_data.get("customer"):
            raise serializers.ValidationError({"customer": "Customer is required."})

        if selected_lucky:
            locked_lucky = LuckyId.objects.select_for_update().get(pk=selected_lucky.pk)
            if locked_lucky.status != LuckyIdStatus.AVAILABLE:
                raise serializers.ValidationError(
                    {"lucky_id": "Selected Lucky ID is no longer available."}
                )
            validated_data["lucky_id"] = locked_lucky

        if plan_type == PlanType.EMI and batch and not validated_data.get("lucky_id"):
            next_lucky = (
                LuckyId.objects.select_for_update()
                .filter(batch=batch, status=LuckyIdStatus.AVAILABLE)
                .order_by("lucky_number", "id")
                .first()
            )
            if not next_lucky:
                raise serializers.ValidationError(
                    {"lucky_id": "No available Lucky ID in selected batch."}
                )
            validated_data["lucky_id"] = next_lucky

        total_amount = q2(Decimal(product.base_price))
        monthly_amount = q2(total_amount / Decimal(tenure))

        validated_data["total_amount"] = total_amount
        validated_data["monthly_amount"] = monthly_amount
        validated_data["waived_amount"] = MONEY_ZERO
        validated_data.setdefault("status", SubscriptionStatus.ACTIVE)

        try:
            subscription = Subscription(**validated_data)
            subscription.full_clean()
            subscription.save()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict or {"detail": exc.messages}
            )

        if subscription.plan_type == PlanType.EMI:
            emi_amounts = build_emi_amounts(
                total_amount=subscription.total_amount,
                tenure_months=subscription.tenure_months,
            )

            emis_to_create = []
            for month_no, emi_amount in enumerate(emi_amounts, start=1):
                due_date = subscription.start_date + relativedelta(months=month_no - 1)
                emis_to_create.append(
                    Emi(
                        subscription=subscription,
                        month_no=month_no,
                        due_date=due_date,
                        amount=emi_amount,
                        status=EmiStatus.PENDING,
                    )
                )
            Emi.objects.bulk_create(emis_to_create)

        return subscription

    @transaction.atomic
    def update(self, instance, validated_data):
        product_changed = "product" in validated_data
        tenure_changed = "tenure_months" in validated_data

        existing_paid = instance.emis.filter(status=EmiStatus.PAID).exists()
        existing_waived = instance.emis.filter(status=EmiStatus.WAIVED).exists()
        existing_payments = instance.payments.exists()

        if (product_changed or tenure_changed) and (
            existing_paid or existing_waived or existing_payments
        ):
            raise serializers.ValidationError(
                "Cannot rebuild EMI schedule after payment or EMI activity has started."
            )

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if product_changed or tenure_changed:
            instance.total_amount = q2(Decimal(instance.product.base_price))
            instance.monthly_amount = q2(
                instance.total_amount / Decimal(instance.tenure_months)
            )

        try:
            instance.full_clean()
            instance.save()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict or {"detail": exc.messages}
            )

        if instance.plan_type == PlanType.EMI and (product_changed or tenure_changed):
            instance.emis.all().delete()

            emi_amounts = build_emi_amounts(
                total_amount=instance.total_amount,
                tenure_months=instance.tenure_months,
            )

            emis_to_create = []
            for month_no, emi_amount in enumerate(emi_amounts, start=1):
                due_date = instance.start_date + relativedelta(months=month_no - 1)
                emis_to_create.append(
                    Emi(
                        subscription=instance,
                        month_no=month_no,
                        due_date=due_date,
                        amount=emi_amount,
                        status=EmiStatus.PENDING,
                    )
                )
            Emi.objects.bulk_create(emis_to_create)

        return instance


class SubscriptionAdminDetailSerializer(SubscriptionAdminSerializer):
    rent_profile = serializers.SerializerMethodField()
    lease_profile = serializers.SerializerMethodField()
    documents = serializers.SerializerMethodField()
    financial_summary = serializers.SerializerMethodField()
    reconciliation_flags = serializers.SerializerMethodField()
    winner_status = serializers.SerializerMethodField()
    winner_summary = serializers.SerializerMethodField()
    delivery_summary = serializers.SerializerMethodField()
    deliveries = serializers.SerializerMethodField()
    emis = serializers.SerializerMethodField()

    class Meta(SubscriptionAdminSerializer.Meta):
        fields = SubscriptionAdminSerializer.Meta.fields + (
            "rent_profile",
            "lease_profile",
            "documents",
            "winner_status",
            "winner_summary",
            "financial_summary",
            "reconciliation_flags",
            "delivery_summary",
            "deliveries",
            "emis",
        )
        read_only_fields = fields

    def _snapshot(self, obj):
        cache_attr = "_subscription_financial_snapshot"
        snapshot = getattr(obj, cache_attr, None)
        if snapshot is None:
            snapshot = build_subscription_financial_snapshot(obj)
            setattr(obj, cache_attr, snapshot)
        return snapshot

    def get_emi_count(self, obj):
        return self._snapshot(obj)["emi_count_total"]

    def get_paid_emi_count(self, obj):
        return self._snapshot(obj)["emi_count_paid"]

    def get_pending_emi_count(self, obj):
        return self._snapshot(obj)["emi_count_pending"]

    def get_waived_emi_count(self, obj):
        return self._snapshot(obj)["emi_count_waived"]

    def get_winner_status(self, obj):
        return self._snapshot(obj)["winner_status"]

    def get_winner_summary(self, obj):
        return self._snapshot(obj)["winner_summary"]

    def get_financial_summary(self, obj):
        snapshot = self._snapshot(obj)
        return {
            "subscription_id": snapshot["subscription_id"],
            "total_amount": snapshot["total_amount"],
            "total_emi_amount": snapshot["total_emi_amount"],
            "emi_total": snapshot["emi_total"],
            "paid_amount": snapshot["paid_amount"],
            "waived_amount": snapshot["waived_amount"],
            "stored_waived_amount": snapshot["stored_waived_amount"],
            "waiver_ledger_amount": snapshot["waiver_ledger_amount"],
            "reversed_amount": snapshot["reversed_amount"],
            "pending_amount": snapshot["pending_amount"],
            "remaining_amount": snapshot["remaining_amount"],
            "outstanding_amount": snapshot["outstanding_amount"],
            "emi_count_total": snapshot["emi_count_total"],
            "emi_count_paid": snapshot["emi_count_paid"],
            "emi_count_waived": snapshot["emi_count_waived"],
            "emi_count_pending": snapshot["emi_count_pending"],
            "winner_status": snapshot["winner_status"],
            "winner_month": snapshot["winner_month"],
            "lucky_id": snapshot["lucky_id"],
            "lucky_number": snapshot["lucky_number"],
            "batch": snapshot["batch"],
            "partner": snapshot["partner"],
        }

    def get_rent_profile(self, obj):
        profile = getattr(obj, "rent_profile", None)
        if not profile:
            return None

        return {
            "security_deposit_percent": str(profile.security_deposit_percent),
            "security_deposit_amount": str(profile.security_deposit_amount),
            "refundable_security_deposit": str(profile.refundable_security_deposit),
            "return_condition_status": profile.return_condition_status,
            "deduction_amount": str(profile.deduction_amount),
            "refund_amount": str(profile.refund_amount),
            "refund_status": profile.refund_status,
            "return_inspection_notes": profile.return_inspection_notes,
            "handover_notes": profile.handover_notes,
            "contract_terms_snapshot": profile.contract_terms_snapshot,
            "created_at": profile.created_at,
            "updated_at": profile.updated_at,
        }

    def get_lease_profile(self, obj):
        profile = getattr(obj, "lease_profile", None)
        if not profile:
            return None

        return {
            "security_deposit_percent": str(profile.security_deposit_percent),
            "security_deposit_amount": str(profile.security_deposit_amount),
            "refundable_security_deposit": str(profile.refundable_security_deposit),
            "buyout_amount": str(profile.buyout_amount) if profile.buyout_amount is not None else None,
            "ownership_transfer_allowed": bool(profile.ownership_transfer_allowed),
            "return_condition_status": profile.return_condition_status,
            "deduction_amount": str(profile.deduction_amount),
            "refund_amount": str(profile.refund_amount),
            "refund_status": profile.refund_status,
            "return_inspection_notes": profile.return_inspection_notes,
            "handover_notes": profile.handover_notes,
            "contract_terms_snapshot": profile.contract_terms_snapshot,
            "created_at": profile.created_at,
            "updated_at": profile.updated_at,
        }

    def get_documents(self, obj):
        request = self.context.get("request")
        queryset = getattr(obj, "documents", None)
        if queryset is None:
            docs = (
                SubscriptionDocument.objects.filter(subscription=obj)
                .select_related("uploaded_by")
                .order_by("-created_at", "-id")
            )
        else:
            docs = list(queryset.all().select_related("uploaded_by").order_by("-created_at", "-id"))

        def file_url(doc: SubscriptionDocument) -> str | None:
            try:
                return serialize_media_url(request, doc.file)
            except Exception:
                return None

        return [
            {
                "id": doc.id,
                "document_type": doc.document_type,
                "verification_status": doc.verification_status,
                "notes": doc.notes,
                "file_url": file_url(doc),
                "uploaded_by_username": getattr(getattr(doc, "uploaded_by", None), "username", None),
                "created_at": doc.created_at,
                "updated_at": doc.updated_at,
            }
            for doc in docs
        ]

    def get_reconciliation_flags(self, obj):
        snapshot = self._snapshot(obj)
        return {
            "is_financially_consistent": snapshot["is_financially_consistent"],
            "pending_matches_remaining": snapshot["pending_matches_remaining"],
            "has_reversal_history": snapshot["has_reversal_history"],
            "has_waiver_history": snapshot["has_waiver_history"],
            "warnings": snapshot["warnings"],
        }

    def get_emis(self, obj):
        return self._snapshot(obj)["emis"]

    def get_delivery_summary(self, obj):
        return build_subscription_delivery_summary(obj)

    def get_deliveries(self, obj):
        deliveries = getattr(obj, "_prefetched_objects_cache", {}).get("deliveries")
        if deliveries is not None:
            return AdminSubscriptionDeliveryReadSerializer(deliveries, many=True).data
        return build_subscription_delivery_history(obj)


class PartnerAdminSerializer(serializers.ModelSerializer):
    referred_customers = serializers.SerializerMethodField()
    active_subscriptions = serializers.SerializerMethodField()
    total_commission = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "phone",
            "is_active",
            "referred_customers",
            "active_subscriptions",
            "total_commission",
        )

    def get_referred_customers(self, obj):
        return (
            Subscription.objects.filter(partner=obj)
            .values("customer")
            .distinct()
            .count()
        )

    def get_active_subscriptions(self, obj):
        return Subscription.objects.filter(
            partner=obj,
            status=SubscriptionStatus.ACTIVE,
        ).count()

    def get_total_commission(self, obj):
        return (
            Commission.objects.filter(partner=obj)
            .exclude(status=CommissionStatus.REVERSED)
            .aggregate(
                total=Sum("commission_amount")
            )["total"]
            or MONEY_ZERO
        )

    def validate(self, attrs):
        if self.instance and self.instance.role != UserRole.PARTNER:
            raise serializers.ValidationError(
                "Only partner users can be represented here."
            )
        return attrs
