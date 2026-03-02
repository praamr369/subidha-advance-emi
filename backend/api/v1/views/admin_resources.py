from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from api.v1.permissions import IsAdmin
from api.v1.serializers.admin_resources import (
    BatchAdminSerializer,
    CustomerAdminSerializer,
    EmiAdminSerializer,
    LuckyDrawAdminSerializer,
    LuckyIdAdminSerializer,
    PaymentAdminSerializer,
    ProductAdminSerializer,
    SubscriptionAdminSerializer,
)
from subscriptions.models import Batch, Customer, Emi, LuckyDraw, LuckyId, Payment, Product, Subscription


class AdminOnlyModelViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class BatchAdminViewSet(AdminOnlyModelViewSet):
    queryset = Batch.objects.all().order_by("-created_at")
    serializer_class = BatchAdminSerializer


class CustomerAdminViewSet(AdminOnlyModelViewSet):
    queryset = Customer.objects.all().order_by("-created_at")
    serializer_class = CustomerAdminSerializer


class EmiAdminViewSet(AdminOnlyModelViewSet):
    queryset = Emi.objects.select_related("subscription").all().order_by("due_date")
    serializer_class = EmiAdminSerializer


class LuckyDrawAdminViewSet(AdminOnlyModelViewSet):
    queryset = LuckyDraw.objects.select_related("batch", "winner_lucky_id").all().order_by("-draw_date")
    serializer_class = LuckyDrawAdminSerializer


class LuckyIdAdminViewSet(AdminOnlyModelViewSet):
    queryset = LuckyId.objects.select_related("batch").all().order_by("batch_id", "lucky_number")
    serializer_class = LuckyIdAdminSerializer

    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request):
        batch_id = request.query_params.get("batch_id")
        queryset = self.get_queryset().filter(status="AVAILABLE")
        if batch_id:
            queryset = queryset.filter(batch_id=batch_id)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class PaymentAdminViewSet(AdminOnlyModelViewSet):
    queryset = Payment.objects.select_related("customer", "subscription", "emi").all().order_by("-payment_date")
    serializer_class = PaymentAdminSerializer


class ProductAdminViewSet(AdminOnlyModelViewSet):
    queryset = Product.objects.all().order_by("name")
    serializer_class = ProductAdminSerializer


class SubscriptionAdminViewSet(AdminOnlyModelViewSet):
    queryset = Subscription.objects.select_related("customer", "product", "batch", "lucky_id", "partner").all().order_by("-created_at")
    serializer_class = SubscriptionAdminSerializer
