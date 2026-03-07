from decimal import Decimal, ROUND_HALF_UP

from dateutil.relativedelta import relativedelta
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from accounts.models import User, UserRole
from subscriptions.models import (
    Batch,
    Commission,
    Customer,
    Emi,
    EmiStatus,
    LuckyDraw,
    LuckyId,
    LuckyIdStatus,
    Payment,
    PlanType,
    Product,
    Subscription,
    SubscriptionStatus,
)


MONEY_ZERO = Decimal("0.00")


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
        raise serializers.ValidationError({"tenure_months": "Tenure must be greater than zero."})

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
    subscription_count = serializers.SerializerMethodField()

    class Meta:
        model = Batch
        fields = "__all__"

    def get_available_slots(self, obj):
        return obj.lucky_ids.filter(status=LuckyIdStatus.AVAILABLE).count()

    def get_subscription_count(self, obj):
        return obj.subscriptions.count()

    def validate(self, attrs):
        data = {}
        if self.instance:
            for field in [
                "batch_code",
                "total_slots",
                "duration_months",
                "draw_day",
                "start_date",
                "status",
            ]:
                data[field] = attrs.get(field, getattr(self.instance, field))
        else:
            data = attrs.copy()

        candidate = Batch(**data)
        if self.instance:
            candidate.pk = self.instance.pk

        try:
            candidate.full_clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or {"detail": exc.messages})

        return attrs


class CustomerAdminSerializer(serializers.ModelSerializer):
    username = serializers.CharField(write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    user_username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Customer
        fields = (
            "id",
            "user",
            "user_username",
            "name",
            "phone",
            "kyc_status",
            "created_at",
            "username",
            "password",
            "email",
        )
        read_only_fields = ("id", "created_at")
        extra_kwargs = {"user": {"required": False}}

    def validate(self, attrs):
        username = attrs.pop("username", None)
        password = attrs.pop("password", None)
        email = attrs.pop("email", "")

        attrs["_new_username"] = username
        attrs["_new_password"] = password
        attrs["_new_email"] = email

        user = attrs.get("user")

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
            raise serializers.ValidationError({"user": "Selected user must have CUSTOMER role."})

        if user and hasattr(user, "customer_profile"):
            if not self.instance or user.customer_profile.pk != self.instance.pk:
                raise serializers.ValidationError({"user": "Selected user already has customer profile."})

        phone = attrs.get("phone")
        if phone:
            duplicate = Customer.objects.filter(phone=phone)
            if self.instance:
                duplicate = duplicate.exclude(pk=self.instance.pk)
            if duplicate.exists():
                raise serializers.ValidationError({"phone": "Customer with this phone already exists."})

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        username = validated_data.pop("_new_username", None)
        password = validated_data.pop("_new_password", None)
        email = validated_data.pop("_new_email", "")

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

        return Customer.objects.create(**validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        username = validated_data.pop("_new_username", None)
        password = validated_data.pop("_new_password", None)
        email = validated_data.pop("_new_email", None)

        user = validated_data.get("user") or instance.user

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if username:
            user.username = username
        if email is not None:
            user.email = email
        if instance.phone:
            user.phone = instance.phone
        if instance.name:
            user.first_name = instance.name
        if password:
            user.set_password(password)
        user.save()

        return instance


class EmiAdminSerializer(serializers.ModelSerializer):
    customer = serializers.IntegerField(source="subscription.customer_id", read_only=True)
    customer_name = serializers.CharField(source="subscription.customer.name", read_only=True)
    customer_phone = serializers.CharField(source="subscription.customer.phone", read_only=True)
    subscription_status = serializers.CharField(source="subscription.status", read_only=True)
    batch = serializers.IntegerField(source="subscription.batch_id", read_only=True)
    batch_code = serializers.CharField(source="subscription.batch.batch_code", read_only=True)
    lucky_id = serializers.IntegerField(source="subscription.lucky_id_id", read_only=True)
    lucky_number = serializers.IntegerField(source="subscription.lucky_id.lucky_number", read_only=True)
    total_paid = serializers.SerializerMethodField()
    balance_amount = serializers.SerializerMethodField()

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
        )

    def get_total_paid(self, obj):
        return str(obj.total_paid())

    def get_balance_amount(self, obj):
        return str(obj.balance_amount())

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
            raise serializers.ValidationError(exc.message_dict or {"detail": exc.messages})

        return attrs


class LuckyDrawAdminSerializer(serializers.ModelSerializer):
    batch_code = serializers.CharField(source="batch.batch_code", read_only=True)
    winner_lucky_number = serializers.IntegerField(source="winner_lucky_id.lucky_number", read_only=True)

    class Meta:
        model = LuckyDraw
        fields = (
            "id",
            "batch",
            "batch_code",
            "committed_hash",
            "revealed_seed",
            "winner_lucky_id",
            "winner_lucky_number",
            "draw_date",
            "draw_month",
            "is_revealed",
            "created_at",
        )

    def validate(self, attrs):
        data = {}
        if self.instance:
            for field in [
                "batch",
                "committed_hash",
                "revealed_seed",
                "winner_lucky_id",
                "draw_date",
                "draw_month",
                "is_revealed",
            ]:
                data[field] = attrs.get(field, getattr(self.instance, field))
        else:
            data = attrs.copy()

        candidate = LuckyDraw(**data)
        if self.instance:
            candidate.pk = self.instance.pk

        try:
            candidate.full_clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or {"detail": exc.messages})

        return attrs


class LuckyIdAdminSerializer(serializers.ModelSerializer):
    batch_code = serializers.CharField(source="batch.batch_code", read_only=True)

    class Meta:
        model = LuckyId
        fields = (
            "id",
            "batch",
            "batch_code",
            "lucky_number",
            "status",
            "created_at",
        )

    def validate(self, attrs):
        data = {}
        if self.instance:
            for field in ["batch", "lucky_number", "status"]:
                data[field] = attrs.get(field, getattr(self.instance, field))
        else:
            data = attrs.copy()

        candidate = LuckyId(**data)
        if self.instance:
            candidate.pk = self.instance.pk

        try:
            candidate.full_clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or {"detail": exc.messages})

        return attrs


class PaymentAdminSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    subscription_status = serializers.CharField(source="subscription.status", read_only=True)
    emi_month_no = serializers.IntegerField(source="emi.month_no", read_only=True)
    batch = serializers.IntegerField(source="subscription.batch_id", read_only=True)
    batch_code = serializers.CharField(source="subscription.batch.batch_code", read_only=True)
    lucky_number = serializers.IntegerField(source="subscription.lucky_id.lucky_number", read_only=True)
    collected_by_username = serializers.CharField(source="collected_by.username", read_only=True)
    verified_by_username = serializers.CharField(source="verified_by.username", read_only=True)

    class Meta:
        model = Payment
        fields = (
            "id",
            "customer",
            "customer_name",
            "customer_phone",
            "subscription",
            "subscription_status",
            "emi",
            "emi_month_no",
            "batch",
            "batch_code",
            "lucky_number",
            "amount",
            "method",
            "reference_no",
            "payment_date",
            "collected_by",
            "collected_by_username",
            "verified_by",
            "verified_by_username",
            "created_at",
        )

    def validate(self, attrs):
        data = {}
        if self.instance:
            for field in [
                "customer",
                "subscription",
                "emi",
                "amount",
                "method",
                "reference_no",
                "payment_date",
                "collected_by",
                "verified_by",
            ]:
                data[field] = attrs.get(field, getattr(self.instance, field))
        else:
            data = attrs.copy()

        customer = data.get("customer")
        subscription = data.get("subscription")
        emi = data.get("emi")
        amount = data.get("amount")

        if subscription and customer and subscription.customer_id != customer.id:
            raise serializers.ValidationError({
                "customer": "Selected customer does not match the subscription customer."
            })

        if emi:
            if subscription and emi.subscription_id != subscription.id:
                raise serializers.ValidationError({
                    "emi": "Selected EMI does not belong to the selected subscription."
                })
            if customer and emi.subscription.customer_id != customer.id:
                raise serializers.ValidationError({
                    "emi": "Selected EMI does not belong to the selected customer."
                })

        if amount is not None and Decimal(amount) <= MONEY_ZERO:
            raise serializers.ValidationError({"amount": "Payment amount must be greater than zero."})

        candidate = Payment(**data)
        if self.instance:
            candidate.pk = self.instance.pk

        try:
            candidate.full_clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or {"detail": exc.messages})

        return attrs

    def _sync_emi_status(self, emi):
        if not emi:
            return

        if emi.status == EmiStatus.WAIVED:
            return

        total_paid = emi.payments.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
        if total_paid >= emi.amount:
            emi.status = EmiStatus.PAID
        else:
            emi.status = EmiStatus.PENDING
        emi.save(update_fields=["status"])

    @transaction.atomic
    def create(self, validated_data):
        payment = Payment.objects.create(**validated_data)
        self._sync_emi_status(payment.emi)
        return payment

    @transaction.atomic
    def update(self, instance, validated_data):
        old_emi = instance.emi

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        affected_emis = [e for e in [old_emi, instance.emi] if e is not None]
        unique_affected = {emi.pk: emi for emi in affected_emis}.values()

        for emi in unique_affected:
            self._sync_emi_status(emi)

        return instance


class ProductAdminSerializer(serializers.ModelSerializer):
    active_subscription_count = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = "__all__"

    def get_active_subscription_count(self, obj):
        return obj.subscriptions.filter(status=SubscriptionStatus.ACTIVE).count()

    def validate(self, attrs):
        data = {}
        if self.instance:
            for field in ["product_code", "name", "base_price", "created_at"]:
                data[field] = attrs.get(field, getattr(self.instance, field))
        else:
            data = attrs.copy()

        candidate = Product(**data)
        if self.instance:
            candidate.pk = self.instance.pk

        try:
            candidate.full_clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or {"detail": exc.messages})

        return attrs


class SubscriptionAdminSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)

    product_name = serializers.CharField(source="product.name", read_only=True)
    product_code = serializers.CharField(source="product.product_code", read_only=True)

    batch_code = serializers.CharField(source="batch.batch_code", read_only=True)
    batch_status = serializers.CharField(source="batch.status", read_only=True)

    lucky_number = serializers.IntegerField(source="lucky_id.lucky_number", read_only=True)

    partner_name = serializers.CharField(source="partner.username", read_only=True)
    partner_phone = serializers.CharField(source="partner.phone", read_only=True)

    emi_count = serializers.SerializerMethodField()
    paid_emi_count = serializers.SerializerMethodField()
    pending_emi_count = serializers.SerializerMethodField()
    waived_emi_count = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = (
            "id",
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
            "created_at",
            "emi_count",
            "paid_emi_count",
            "pending_emi_count",
            "waived_emi_count",
        )
        read_only_fields = (
            "total_amount",
            "monthly_amount",
            "waived_amount",
            "winner_month",
            "created_at",
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
        tenure_months = attrs.get("tenure_months", getattr(instance, "tenure_months", None))
        product = attrs.get("product", getattr(instance, "product", None))
        status_value = attrs.get("status", getattr(instance, "status", None))

        if not product:
            raise serializers.ValidationError({"product": "Product is required."})

        if not tenure_months or tenure_months <= 0:
            raise serializers.ValidationError({"tenure_months": "Tenure must be greater than zero."})

        financial_structure_changed = any(
            field in attrs for field in ["product", "tenure_months", "batch", "lucky_id", "plan_type"]
        )

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
                raise serializers.ValidationError({
                    "batch": "Batch is required for EMI subscription."
                })

            if tenure_months != batch.duration_months:
                raise serializers.ValidationError({
                    "tenure_months": f"Tenure must match batch duration ({batch.duration_months} months)."
                })

            if not lucky_id:
                next_lucky = (
                    LuckyId.objects
                    .filter(batch=batch, status=LuckyIdStatus.AVAILABLE)
                    .order_by("lucky_number", "id")
                    .first()
                )
                if not next_lucky:
                    raise serializers.ValidationError({
                        "lucky_id": "No available Lucky ID in selected batch."
                    })
                attrs["lucky_id"] = next_lucky
                lucky_id = next_lucky

            if lucky_id.batch_id != batch.id:
                raise serializers.ValidationError({
                    "lucky_id": "Lucky ID must belong to selected batch."
                })

            lucky_id_changed = instance is None or (
                instance and instance.lucky_id_id != lucky_id.id
            )

            if lucky_id_changed and lucky_id.status != LuckyIdStatus.AVAILABLE:
                raise serializers.ValidationError({
                    "lucky_id": "Selected Lucky ID is already assigned."
                })

        if plan_type in {PlanType.RENT, PlanType.LEASE}:
            if batch is not None or lucky_id is not None:
                raise serializers.ValidationError(
                    "Batch and Lucky ID are only allowed for EMI subscriptions."
                )

        if instance and status_value == SubscriptionStatus.WON and instance.status != SubscriptionStatus.WON:
            raise serializers.ValidationError({
                "status": "Winning state must be assigned only through lucky draw reveal flow."
            })

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        batch = validated_data.get("batch")
        plan_type = validated_data.get("plan_type")
        selected_lucky = validated_data.get("lucky_id")
        product = validated_data.get("product")
        tenure = validated_data.get("tenure_months") or 0

        if selected_lucky:
            locked_lucky = LuckyId.objects.select_for_update().get(pk=selected_lucky.pk)
            if locked_lucky.status != LuckyIdStatus.AVAILABLE:
                raise serializers.ValidationError({
                    "lucky_id": "Selected Lucky ID is no longer available."
                })
            validated_data["lucky_id"] = locked_lucky

        if plan_type == PlanType.EMI and batch and not validated_data.get("lucky_id"):
            next_lucky = (
                LuckyId.objects.select_for_update()
                .filter(batch=batch, status=LuckyIdStatus.AVAILABLE)
                .order_by("lucky_number", "id")
                .first()
            )
            if not next_lucky:
                raise serializers.ValidationError({
                    "lucky_id": "No available Lucky ID in selected batch."
                })
            validated_data["lucky_id"] = next_lucky

        total_amount = q2(Decimal(product.base_price))
        monthly_amount = q2(total_amount / Decimal(tenure))

        validated_data["total_amount"] = total_amount
        validated_data["monthly_amount"] = monthly_amount
        validated_data.setdefault("waived_amount", MONEY_ZERO)
        validated_data.setdefault("status", SubscriptionStatus.ACTIVE)

        try:
            subscription = Subscription.objects.create(**validated_data)
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

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if product_changed or tenure_changed:
            instance.total_amount = q2(Decimal(instance.product.base_price))
            instance.monthly_amount = q2(
                instance.total_amount / Decimal(instance.tenure_months)
            )

        instance.save()

        if instance.plan_type == PlanType.EMI and (product_changed or tenure_changed):
            existing_paid = instance.emis.filter(status=EmiStatus.PAID).exists()
            existing_waived = instance.emis.filter(status=EmiStatus.WAIVED).exists()
            existing_payments = instance.payments.exists()

            if existing_paid or existing_waived or existing_payments:
                raise serializers.ValidationError(
                    "Cannot rebuild EMI schedule after payment or EMI activity has started."
                )

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
        return Subscription.objects.filter(partner=obj).values("customer").distinct().count()

    def get_active_subscriptions(self, obj):
        return Subscription.objects.filter(
            partner=obj,
            status=SubscriptionStatus.ACTIVE,
        ).count()

    def get_total_commission(self, obj):
        return (
            Commission.objects.filter(partner=obj).aggregate(total=Sum("commission_amount"))["total"]
            or MONEY_ZERO
        )

    def validate(self, attrs):
        if self.instance and self.instance.role != UserRole.PARTNER:
            raise serializers.ValidationError("Only partner users can be represented here.")
        return attrs