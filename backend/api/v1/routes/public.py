from django.urls import path
from rest_framework import serializers, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from subscriptions.models import Batch, LuckyDraw, Product, Subscription




class PublicLeadSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    phone = serializers.RegexField(regex=r"^\d{10}$")
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    interested_product = serializers.CharField(max_length=255, required=False, allow_blank=True)
    preferred_emi_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)



class PublicStatsView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        total_batches = Batch.objects.count()
        total_subscriptions = Subscription.objects.count()
        active_subscriptions = Subscription.objects.filter(
            status="ACTIVE"
        ).count()
        total_winners = Subscription.objects.filter(
            status="WON"
        ).count()

        return Response({
            "total_batches": total_batches,
            "total_subscriptions": total_subscriptions,
            "active_subscriptions": active_subscriptions,
            "total_winners": total_winners,
        })


class PublicProductsView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]


    def get(self, request):
        products = Product.objects.order_by("name", "id").values(
            "id",
            "product_code",
            "name",
            "base_price",
        )

        return Response(
            {
                "count": products.count(),
                "results": list(products),
            }
        )


    def get(self, request):
        products = Product.objects.order_by("name", "id").values(
            "id",
            "product_code",
            "name",
            "base_price",
        )

        return Response(
            {
                "count": products.count(),
                "results": list(products),
            }
        )

class PublicLeadView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]


class PublicLeadView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PublicLeadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            {"message": "Lead submitted successfully", "data": serializer.validated_data},
            status=status.HTTP_201_CREATED,
        )

    def post(self, request):
        serializer = PublicLeadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            {"message": "Lead submitted successfully", "data": serializer.validated_data},
            status=status.HTTP_201_CREATED,
        )




class LatestWinnerView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        latest = (
            LuckyDraw.objects
            .filter(is_revealed=True)
            .select_related("batch", "winner_lucky_id")
            .order_by("-draw_date")
            .first()
        )

        if not latest:
            return Response({"winner": None})

        lucky = latest.winner_lucky_id

        subscription = lucky.subscription_set.select_related("customer").first()
        if not subscription:
            return Response({"winner": None})

        return Response({
            "winner": {
                "lucky_id": f"{lucky.lucky_number:02d}",
                "customer_name": subscription.customer.name,
                "batch": latest.batch.batch_code,
                "month": latest.draw_month,
                "draw_date": latest.draw_date,
            }
        })


urlpatterns = [
    path("stats/", PublicStatsView.as_view(), name="public-stats"),
    path("products/", PublicProductsView.as_view(), name="public-products"),

    path("leads/", PublicLeadView.as_view(), name="public-leads"),


    path("leads/", PublicLeadView.as_view(), name="public-leads"),


    path("latest-winner/", LatestWinnerView.as_view(), name="latest-winner"),
]
