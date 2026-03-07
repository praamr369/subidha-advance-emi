from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User, UserRole
from api.v1.permissions import IsPartnerOrAdmin
from api.v1.serializers import CommissionSerializer
from subscriptions.models import (
    Batch,
    Product,
    BatchStatus,
    Commission,
    Customer,
    Emi,
    LuckyId,
    LuckyIdStatus,
    PlanType,
    Subscription,
)
from subscriptions.services.emi_engine import generate_emi_schedule


class PartnerCustomerSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    user_id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(max_length=100)
    phone = serializers.CharField(max_length=15)
    username = serializers.CharField(max_length=150, write_only=True)
    password = serializers.CharField(max_length=128, write_only=True)


class PartnerSubscriptionSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    customer = serializers.IntegerField()
    product = serializers.IntegerField()
    batch = serializers.IntegerField()
    lucky_id = serializers.IntegerField()
    tenure_months = serializers.IntegerField(min_value=1)
    start_date = serializers.DateField()


class PartnerDashboardView(APIView):
    permission_classes = [IsPartnerOrAdmin]

    def get(self, request):
        total_customers = Subscription.objects.filter(
            partner=request.user
        ).values("customer").distinct().count()

        total_commission = Commission.objects.filter(
            partner=request.user
        ).aggregate(total=Sum("commission_amount"))["total"] or 0

        pending_commission = Commission.objects.filter(
            partner=request.user,
            status="PENDING"
        ).aggregate(total=Sum("commission_amount"))["total"] or 0

        paid_commission = Commission.objects.filter(
            partner=request.user,
            status="PAID"
        ).aggregate(total=Sum("commission_amount"))["total"] or 0

        total_emis_paid = Emi.objects.filter(
            subscription__partner=request.user,
            status="PAID"
        ).count()

        return Response({
            "total_customers": total_customers,
            "total_emis_paid": total_emis_paid,
            "total_commission": total_commission,
            "pending_commission": pending_commission,
            "paid_commission": paid_commission,
        })


class PartnerCommissionListView(ListAPIView):
    permission_classes = [IsPartnerOrAdmin]
    serializer_class = CommissionSerializer

    def get_queryset(self):
        return Commission.objects.filter(
            partner=self.request.user
        ).order_by("-created_at")


class PartnerCustomerListCreateView(APIView):
    permission_classes = [IsPartnerOrAdmin]

    def get(self, request):
        customer_ids = Subscription.objects.filter(partner=request.user).values_list("customer_id", flat=True).distinct()
        customers = Customer.objects.filter(id__in=customer_ids).order_by("-created_at")
        payload = [
            {
                "id": customer.id,
                "user_id": customer.user_id,
                "name": customer.name,
                "phone": customer.phone,
            }
            for customer in customers
        ]
        return Response(payload)

    def post(self, request):
        serializer = PartnerCustomerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if User.objects.filter(username=data["username"]).exists():
            return Response({"error": "username already exists"}, status=400)
        if Customer.objects.filter(phone=data["phone"]).exists():
            return Response({"error": "phone already exists"}, status=400)

        with transaction.atomic():
            user = User.objects.create_user(
                username=data["username"],
                password=data["password"],
                role=UserRole.CUSTOMER,
                phone=data["phone"],
                first_name=data["name"],
            )
            customer = Customer.objects.create(user=user, name=data["name"], phone=data["phone"])

        return Response({"id": customer.id, "user_id": user.id, "name": customer.name, "phone": customer.phone}, status=201)


class PartnerSubscriptionListCreateView(APIView):
    permission_classes = [IsPartnerOrAdmin]

    def get(self, request):
        subscriptions = (
            Subscription.objects
            .select_related("customer", "product", "batch", "lucky_id")
            .filter(partner=request.user)
            .order_by("-created_at")
        )
        return Response([
            {
                "id": sub.id,
                "customer": sub.customer_id,
                "customer_name": sub.customer.name,
                "product": sub.product_id,
                "product_name": sub.product.name,
                "batch": sub.batch_id,
                "lucky_id": sub.lucky_id_id,
                "lucky_number": sub.lucky_id.lucky_number if sub.lucky_id else None,
                "tenure_months": sub.tenure_months,
                "start_date": sub.start_date,
                "monthly_amount": sub.monthly_amount,
                "total_amount": sub.total_amount,
                "status": sub.status,
            }
            for sub in subscriptions
        ])

    def post(self, request):
        serializer = PartnerSubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        customer = Customer.objects.filter(pk=payload["customer"]).first()
        product = Product.objects.filter(pk=payload["product"]).first()
        batch = Batch.objects.filter(pk=payload["batch"]).first()
        lucky = LuckyId.objects.filter(pk=payload["lucky_id"]).select_related("batch").first()

        if not customer or not product or not batch or not lucky:
            return Response({"error": "Invalid customer/product/batch/lucky_id"}, status=400)
        if batch.status != BatchStatus.OPEN:
            return Response({"error": "Selected batch is not open"}, status=400)
        if lucky.batch_id != batch.id:
            return Response({"error": "Lucky ID does not belong to selected batch"}, status=400)
        if lucky.status != LuckyIdStatus.AVAILABLE:
            return Response({"error": "Lucky ID is not available"}, status=400)
        if Subscription.objects.filter(batch=batch, customer=customer, plan_type=PlanType.EMI).exists():
            return Response({"error": "Customer already has EMI subscription in this batch"}, status=400)

        total_amount = product.base_price
        tenure = payload["tenure_months"]
        monthly = (total_amount / tenure).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        rounding = total_amount - (monthly * tenure)

        with transaction.atomic():
            sub = Subscription.objects.create(
                customer=customer,
                product=product,
                partner=request.user,
                batch=batch,
                lucky_id=lucky,
                plan_type=PlanType.EMI,
                tenure_months=tenure,
                start_date=payload["start_date"],
                total_amount=total_amount,
                monthly_amount=monthly,
                status="ACTIVE",
            )
            lucky.status = LuckyIdStatus.ASSIGNED
            lucky.save(update_fields=["status"])
            try:
                generate_emi_schedule(sub, rounding_difference=rounding)
            except ValidationError as exc:
                raise serializers.ValidationError(str(exc))

        return Response({"id": sub.id}, status=201)
