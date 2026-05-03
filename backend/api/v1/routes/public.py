from django.urls import path
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.serializers.media import serialize_media_url
from api.v1.serializers.public import PublicProductSerializer
from api.v1.views.health import PublicLivenessView, PublicReadinessView
from api.v1.views.public_site import PublicBusinessProfileView
from subscriptions.models import Batch, LuckyDraw, Product, Subscription
from subscriptions.services.public_lead_service import create_public_lead
from subscriptions.services.winner_state_service import winner_history_q


class PublicLeadSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    phone = serializers.RegexField(regex=r"^\d{10}$")
    email = serializers.EmailField(required=False, allow_blank=True)
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    product_id = serializers.IntegerField(required=False, allow_null=True)
    interested_product = serializers.CharField(max_length=255, required=False, allow_blank=True)
    preferred_emi_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)


def _mask_public_name(raw):
    """
    Reduce exposure of customer identity in public winner pages.
    Keeps a recognizable display label without publishing full names.
    """
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
    first_masked = (
        f"{first[:2]}***"
        if len(first) > 2
        else f"{first[:1]}*"
    )
    return f"{first_masked} {last_initial}."


def _serialize_public_winner(draw: LuckyDraw, request):
    subscription = draw.winner_subscription

    if not subscription and draw.winner_lucky_id_id:
        subscription = (
            draw.winner_lucky_id.subscriptions.select_related("customer", "product")
            .order_by("id")
            .first()
        )

    customer_name = None
    product_name = None
    product_image = None

    if subscription:
        customer = getattr(subscription, "customer", None)
        product = getattr(subscription, "product", None)
        customer_name = _mask_public_name(getattr(customer, "name", None))
        product_name = getattr(product, "name", None)
        product_image = serialize_media_url(request, getattr(product, "image", None))

    lucky_number = getattr(draw.winner_lucky_id, "lucky_number", None)
    draw_commit = getattr(draw, "draw_commit", None)
    public_commit_hash = (
        draw_commit.public_commit_hash
        if draw_commit
        else draw.committed_hash
    )
    if draw_commit:
        verification_status = "coordinated"
    else:
        verification_status = "legacy"

    return {
        "id": draw.id,
        "batch": draw.batch.batch_code,
        "batch_code": draw.batch.batch_code,
        "batch_name": draw.batch.batch_code,
        "month": draw.draw_month,
        "draw_month": draw.draw_month,
        "draw_date": draw.draw_date,
        "draw_datetime": draw.draw_date,
        "revealed_at": draw.revealed_at,
        "lucky_id": f"{lucky_number:02d}" if lucky_number is not None else None,
        "winner_lucky_number": lucky_number,
        "winner_name_masked": customer_name,
        "product_name": product_name,
        "product_image": product_image,
        "committed_hash": draw.committed_hash,
        "public_commit_hash": public_commit_hash,
        "verification_status": verification_status,
        "waived_emi_count": draw.waived_emi_count or 0,
        "waived_amount": (
            str(draw.waived_amount) if draw.waived_amount is not None else None
        ),
    }


class PublicStatsView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "total_batches": Batch.objects.count(),
                "total_subscriptions": Subscription.objects.count(),
                "active_subscriptions": Subscription.objects.filter(status="ACTIVE").count(),
                "total_winners": Subscription.objects.filter(
                    winner_history_q()
                ).distinct().count(),
            }
        )


class PublicProductsView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        products = Product.objects.filter(is_active=True).order_by("name", "id")
        serializer = PublicProductSerializer(products, many=True, context={'request': request})
        return Response({"count": products.count(), "results": serializer.data})


class PublicProductDetailView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, id):
        try:
            product = Product.objects.get(id=id, is_active=True)
        except Product.DoesNotExist:
            return Response({"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = PublicProductSerializer(product, context={"request": request})
        return Response(serializer.data)


class PublicLeadView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PublicLeadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        validated = serializer.validated_data.copy()
        product = None
        product_id = validated.pop("product_id", None)

        if product_id is not None:
            try:
                product = Product.objects.get(id=product_id, is_active=True)
            except Product.DoesNotExist:
                raise serializers.ValidationError(
                    {"product_id": "Selected product is not available."}
                )

        lead = create_public_lead(product=product, **validated)

        return Response(
            {
                "message": "Lead submitted successfully",
                "lead_id": lead.id,
                "created_at": lead.created_at,
                "data": {
                    "name": lead.name,
                    "phone": lead.phone,
                    "email": lead.email,
                    "city": lead.city,
                    "product_id": lead.product_id,
                    "interested_product": lead.interested_product,
                    "preferred_emi_amount": (
                        str(lead.preferred_emi_amount)
                        if lead.preferred_emi_amount is not None
                        else None
                    ),
                    "notes": lead.notes,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class LatestWinnerView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        latest = (
            LuckyDraw.objects.filter(is_revealed=True)
            .select_related(
                "batch",
                "draw_commit",
                "winner_lucky_id",
                "winner_subscription__customer",
                "winner_subscription__product",
            )
            .order_by("-draw_date")
            .first()
        )

        if not latest or not latest.winner_lucky_id:
            return Response({"winner": None})

        return Response({"winner": _serialize_public_winner(latest, request)})


class PublicWinnerHistoryView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        limit_raw = (request.query_params.get("limit") or "").strip()

        try:
            limit = int(limit_raw) if limit_raw else 24
        except ValueError:
            limit = 24

        limit = max(1, min(limit, 100))

        queryset = (
            LuckyDraw.objects.filter(is_revealed=True, winner_lucky_id__isnull=False)
            .select_related(
                "batch",
                "draw_commit",
                "winner_lucky_id",
                "winner_subscription__customer",
                "winner_subscription__product",
            )
            .order_by("-draw_date", "-id")[:limit]
        )

        results = [_serialize_public_winner(draw, request) for draw in queryset]

        return Response(
            {
                "count": len(results),
                "limit": limit,
                "results": results,
            }
        )


class PublicWinnersView(PublicWinnerHistoryView):
    """
    Alias route for clients that expect `/public/winners/`.
    Uses the same safe serialization as `/public/winner-history/`.
    """


urlpatterns = [
    path("stats/", PublicStatsView.as_view(), name="public-stats"),
    path("business-profile/", PublicBusinessProfileView.as_view(), name="public-business-profile"),
    path("products/", PublicProductsView.as_view(), name="public-products"),
    path("products/<int:id>/", PublicProductDetailView.as_view(), name="public-product-detail"),
    path("leads/", PublicLeadView.as_view(), name="public-leads"),
    path("latest-winner/", LatestWinnerView.as_view(), name="latest-winner"),
    path("winners/", PublicWinnersView.as_view(), name="public-winners"),
    path("winner-history/", PublicWinnerHistoryView.as_view(), name="public-winner-history"),
    path("health/", PublicLivenessView.as_view(), name="public-health"),
    path("readiness/", PublicReadinessView.as_view(), name="public-readiness"),
]
