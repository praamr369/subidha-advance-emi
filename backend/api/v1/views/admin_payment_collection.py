from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db.models import Sum
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import throttle_classes

from accounts.capabilities import require_capability
from accounting.models import FinanceAccount
from accounting.services.finance_account_readiness import FinanceAccountPostingReadinessError
from api.v1.permissions import IsAdmin
from api.v1.serializers.admin_resources import PaymentAdminSerializer
from api.v1.throttles.auth_password_reset import PaymentMutationThrottle
from subscriptions.models import Emi, EmiStatus, FinancialLedger, LedgerEntryType, MONEY_ZERO, PaymentMethod, SubscriptionStatus
from subscriptions.services.payment_service import record_emi_payment


class IdempotentAdminPaymentCollectSerializer(serializers.Serializer):
    emi = serializers.PrimaryKeyRelatedField(queryset=Emi.objects.none())
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    payment_method = serializers.ChoiceField(choices=PaymentMethod.choices)
    payment_date = serializers.DateField()
    finance_account_id = serializers.PrimaryKeyRelatedField(
        source="finance_account",
        queryset=FinanceAccount.objects.select_related("chart_account").all(),
    )
    branch_id = serializers.IntegerField(required=False, min_value=1)
    cash_counter_id = serializers.IntegerField(required=False, min_value=1)
    reference_no = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=100)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=500)
    idempotency_key = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=160)

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
            raise serializers.ValidationError("Payment amount must be greater than zero.")
        return value

    def validate_reference_no(self, value):
        if value is None:
            return None
        return value.strip() or None

    def validate_notes(self, value):
        if value is None:
            return None
        return value.strip() or None

    def validate_idempotency_key(self, value):
        if value is None:
            return None
        return value.strip() or None

    def validate(self, attrs):
        emi = attrs["emi"]
        subscription = emi.subscription
        method = attrs.get("payment_method")
        reference_no = attrs.get("reference_no")
        idempotency_key = attrs.get("idempotency_key")

        if subscription.customer_id != subscription.customer.id:
            raise serializers.ValidationError({"emi": "Invalid subscription/customer relationship."})

        if subscription.status in {SubscriptionStatus.COMPLETED, SubscriptionStatus.DEFAULTED, SubscriptionStatus.CANCELLED}:
            raise serializers.ValidationError({"emi": "Cannot collect payment for a closed subscription."})

        if emi.status == EmiStatus.WAIVED:
            raise serializers.ValidationError({"emi": "Cannot collect payment for a waived EMI."})

        if method == PaymentMethod.CASH and not reference_no and not idempotency_key:
            raise serializers.ValidationError(
                {"idempotency_key": "A retry-safe collection key is required for cash payments without a reference number."}
            )

        return attrs


@throttle_classes([PaymentMutationThrottle])
class IdempotentAdminPaymentCollectView(APIView):
    permission_classes = [IsAdmin]

    @require_capability("billing.collect")
    def post(self, request, *args, **kwargs):
        serializer = IdempotentAdminPaymentCollectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        emi_obj = validated["emi"]
        amount = validated["amount"]
        payment_method = validated["payment_method"]
        finance_account = validated["finance_account"]
        reference_no = validated.get("reference_no")
        notes = validated.get("notes")
        idempotency_key = validated.get("idempotency_key")

        try:
            result = record_emi_payment(
                emi_id=emi_obj.id,
                amount=amount,
                collected_by=request.user,
                method=payment_method,
                reference_no=reference_no or None,
                note=notes or None,
                payment_date=validated.get("payment_date"),
                branch_id=validated.get("branch_id"),
                cash_counter_id=validated.get("cash_counter_id"),
                finance_account_id=finance_account.id,
                idempotency_key=idempotency_key,
            )
        except ValidationError as exc:
            message = exc.messages[0] if getattr(exc, "messages", None) else str(exc)
            return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as exc:
            if isinstance(exc, FinanceAccountPostingReadinessError):
                return Response(exc.as_payload(), status=status.HTTP_400_BAD_REQUEST)
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({"detail": f"Payment collection failed: {str(exc)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        payment_obj = result["payment"]
        emi_obj = result["emi"]
        subscription_obj = result["subscription"]
        finance_account = result.get("finance_account")
        reconciliation = result.get("reconciliation")

        effective_paid = (
            FinancialLedger.objects.filter(emi=emi_obj, entry_type=LedgerEntryType.EMI_PAYMENT).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )
        reversal_total = (
            FinancialLedger.objects.filter(emi=emi_obj, entry_type=LedgerEntryType.PAYMENT_REVERSAL).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )
        net_paid = Decimal(str(effective_paid)) - Decimal(str(reversal_total))
        if net_paid < MONEY_ZERO:
            net_paid = MONEY_ZERO
        outstanding_amount = Decimal(str(emi_obj.amount)) - net_paid
        if outstanding_amount < MONEY_ZERO:
            outstanding_amount = MONEY_ZERO

        payment_data = PaymentAdminSerializer(payment_obj, context={"request": request}).data
        return Response(
            {
                "message": "Payment collected successfully." if result.get("created", True) else "Duplicate request detected; existing payment returned.",
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
                    "subscription_number": getattr(subscription_obj, "subscription_number", None) or f"SUB-{subscription_obj.id}",
                    "status": subscription_obj.status,
                },
                "finance_account": (
                    {
                        "id": finance_account.id,
                        "name": finance_account.name,
                        "kind": finance_account.kind,
                        "chart_account_id": finance_account.chart_account_id,
                        "chart_account_code": finance_account.chart_account.code,
                    }
                    if finance_account is not None
                    else None
                ),
                "reconciliation_status": getattr(reconciliation, "status", None),
            },
            status=status.HTTP_201_CREATED if result.get("created", True) else status.HTTP_200_OK,
        )
