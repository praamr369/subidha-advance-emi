from __future__ import annotations

from django.db import transaction
from rest_framework import serializers

from accounts.models import User
from subscriptions.models import AuditLog, Customer
from subscriptions.services.customer_account_service import (
    build_customer_profile_summary,
    sync_customer_login_identity,
)


class CustomerProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    username = serializers.CharField(source="user.username", read_only=True)
    summary = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = (
            "id",
            "name",
            "phone",
            "email",
            "address",
            "city",
            "kyc_status",
            "username",
            "summary",
        )
        read_only_fields = ("id", "kyc_status", "username", "summary")

    def get_summary(self, obj):
        return build_customer_profile_summary(obj)

    def to_representation(self, instance):
        payload = super().to_representation(instance)
        payload["email"] = (getattr(instance.user, "email", "") or "").strip()
        payload["address"] = (payload.get("address") or "").strip()
        payload["city"] = (payload.get("city") or "").strip()
        return payload

    def validate(self, attrs):
        instance = self.instance
        if instance is None:
            raise serializers.ValidationError("Customer profile instance is required.")

        final_name = (attrs.get("name", instance.name) or "").strip()
        final_phone = (attrs.get("phone", instance.phone) or "").strip()
        final_address = (attrs.get("address", instance.address) or "").strip()
        final_city = (attrs.get("city", instance.city) or "").strip()
        final_email = (
            (attrs.get("email", None) or "").strip()
            if "email" in attrs
            else (getattr(instance.user, "email", "") or "").strip()
        )

        errors = {}

        if not final_name:
            errors["name"] = "Customer name is required."

        if not final_phone:
            errors["phone"] = "Phone number is required."

        if not final_email:
            errors["email"] = (
                "Email is required for customer access and password reset. "
                "Add a valid email before saving this profile."
            )

        duplicate_customer_phone = Customer.objects.filter(phone=final_phone).exclude(
            pk=instance.pk
        )
        if final_phone and duplicate_customer_phone.exists():
            errors["phone"] = "Customer with this phone already exists."

        duplicate_user_phone = User.objects.filter(phone=final_phone).exclude(
            pk=instance.user_id
        )
        if final_phone and duplicate_user_phone.exists():
            errors["phone"] = "Phone already exists."

        duplicate_email = User.objects.filter(email__iexact=final_email).exclude(
            pk=instance.user_id
        )
        if final_email and duplicate_email.exists():
            errors["email"] = "Email already exists."

        if len(final_address) > 1000:
            errors["address"] = "Address is too long."

        if len(final_city) > 100:
            errors["city"] = "City is too long."

        if errors:
            raise serializers.ValidationError(errors)

        attrs["name"] = final_name
        attrs["phone"] = final_phone
        attrs["address"] = final_address
        attrs["city"] = final_city
        attrs["email"] = final_email
        return attrs

    @transaction.atomic
    def update(self, instance, validated_data):
        request = self.context.get("request")
        customer = sync_customer_login_identity(
            instance,
            name=validated_data.get("name", instance.name),
            phone=validated_data.get("phone", instance.phone),
            email=validated_data.get("email", getattr(instance.user, "email", "")),
            address=validated_data.get("address", instance.address),
            city=validated_data.get("city", instance.city),
        )

        AuditLog.objects.create(
            action_type=AuditLog.ActionType.USER_UPDATED,
            model_name="Customer",
            object_id=customer.id,
            performed_by=getattr(request, "user", None),
            metadata={
                "origin": "CUSTOMER_SELF_SERVICE",
                "user_id": customer.user_id,
            },
        )
        return customer
