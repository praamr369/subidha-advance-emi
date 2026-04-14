from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from subscriptions.models_business_setup import (
    Branch,
    BusinessProfile,
    CashDesk,
    ChartAccount,
    FinanceAccount,
    StaffOperationalAssignment,
)


class BusinessSetupModelSerializer(serializers.ModelSerializer):
    def _raise_drf_validation_error(self, error: DjangoValidationError):
        if hasattr(error, "message_dict"):
            raise serializers.ValidationError(error.message_dict)
        if hasattr(error, "messages"):
            raise serializers.ValidationError({"non_field_errors": error.messages})
        raise serializers.ValidationError({"non_field_errors": [str(error)]})

    def _validate_instance(self, instance):
        try:
            instance.full_clean()
        except DjangoValidationError as error:
            self._raise_drf_validation_error(error)

    def create(self, validated_data):
        instance = self.Meta.model(**validated_data)
        self._validate_instance(instance)
        instance.save()
        return instance

    def update(self, instance, validated_data):
        for attribute, value in validated_data.items():
            setattr(instance, attribute, value)
        self._validate_instance(instance)
        instance.save()
        return instance


class BusinessProfileSerializer(BusinessSetupModelSerializer):
    class Meta:
        model = BusinessProfile
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class BranchSerializer(BusinessSetupModelSerializer):
    class Meta:
        model = Branch
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class FinanceAccountSerializer(BusinessSetupModelSerializer):
    class Meta:
        model = FinanceAccount
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class CashDeskSerializer(BusinessSetupModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    default_finance_account_name = serializers.CharField(source="default_finance_account.name", read_only=True)

    class Meta:
        model = CashDesk
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class StaffOperationalAssignmentSerializer(BusinessSetupModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    default_cash_desk_name = serializers.CharField(source="default_cash_desk.name", read_only=True)

    class Meta:
        model = StaffOperationalAssignment
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class ChartAccountSerializer(BusinessSetupModelSerializer):
    parent_name = serializers.CharField(source="parent.name", read_only=True)

    class Meta:
        model = ChartAccount
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class SetupChecklistSerializer(serializers.Serializer):
    is_ready_for_go_live = serializers.BooleanField()
    percent_complete = serializers.IntegerField()
    items = serializers.ListField(child=serializers.DictField())
