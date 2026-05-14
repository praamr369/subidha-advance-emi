import hashlib

from django.urls import path
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.services.operational_visibility import subscription_dashboard_visible_q
from api.v1.serializers.media import serialize_media_url
from api.v1.serializers.public import PublicProductSerializer
from api.v1.views.health import PublicLivenessView, PublicReadinessView
from api.v1.views.public_policy_site import (
    PublicBusinessComplianceSummaryView,
    PublicPolicyPageDetailView,
    PublicPolicyPageListView,
)
from api.v1.views.public_site import PublicBusinessProfileView
from subscriptions.models import (
    AuditLog,
    Batch,
    DrawEligibilitySnapshot,
    LuckyDraw,
    Product,
    PublicLeadIntent,
    Subscription,
)
from subscriptions.services.audit_service import log_audit
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
    intent = serializers.ChoiceField(choices=PublicLeadIntent.choices, required=False, default="GENERAL")
    create_procurement_enquiry = serializers.BooleanField(required=False, default=False)


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


def _public_commitment_published_at(draw: LuckyDraw):
    draw_commit = getattr(draw, "draw_commit", None)
    if draw_commit and getattr(draw_commit, "committed_at", None):
        return draw_commit.committed_at
    return getattr(draw, "created_at", None) or draw.draw_date


def _public_commitment_hash(draw: LuckyDraw):
    draw_commit = getattr(draw, "draw_commit", None)
    if draw_commit and getattr(draw_commit, "public_commit_hash", None):
        return draw_commit.public_commit_hash
    return draw.committed_hash


def _public_snapshot_count(draw: LuckyDraw) -> int:
    draw_commit = getattr(draw, "draw_commit", None)
    if not draw_commit:
        return 0
    return DrawEligibilitySnapshot.objects.filter(
        batch=draw.batch,
        snapshot_version=draw_commit.snapshot_version,
    ).count()


def _public_verification_status(draw: LuckyDraw) -> str:
    if draw.draw_commit_id:
        return "revealed_verified" if draw.is_revealed else "committed_unrevealed"
    return "legacy_revealed" if draw.is_revealed else "legacy_committed"


def _public_explanation_text() -> str:
    return (
        "The commitment hash is like a sealed envelope: it is published first, "
        "then the seed is revealed later so the draw can be verified against the original commitment."
    )


def _winner_benefit_note() -> str:
    return "Winner receives future EMI waiver only. Already collected EMI remains recorded and valid."


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
    public_commit_hash = _public_commitment_hash(draw)
    verification_status = "coordinated" if draw_commit else "legacy"

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
        "public_verification_status": _public_verification_status(draw),
        "commitment_published_at": _public_commitment_published_at(draw),
        "eligible_snapshot_count": _public_snapshot_count(draw),
        "public_explanation": _public_explanation_text(),
        "winner_benefit_note": _winner_benefit_note(),
        "waiver_scope": draw.waiver_scope,
        "waived_emi_count": draw.waived_emi_count or 0,
        "waived_amount": (
            str(draw.waived_amount) if draw.waived_amount is not None else None
        ),
    }


def _serialize_public_draw_certificate(draw: LuckyDraw, request):
    payload = _serialize_public_winner(draw, request)
    return {
        "id": payload["id"],
        "batch_code": payload["batch_code"],
        "draw_month": payload["draw_month"],
        "draw_date": payload["draw_date"],
        "commitment_published_at": payload["commitment_published_at"],
        "reveal_timestamp": payload["revealed_at"],
        "public_commit_hash": payload["public_commit_hash"],
        "eligible_snapshot_count": payload["eligible_snapshot_count"],
        "public_verification_status": payload["public_verification_status"],
        "public_explanation": payload["public_explanation"],
        "winner_benefit_note": payload["winner_benefit_note"],
        "waiver_scope": payload["waiver_scope"],
        "winner_name_masked": payload["winner_name_masked"],
        "winner_lucky_number": payload["winner_lucky_number"],
        "product_name": payload["product_name"],
        "product_image": payload["product_image"],
        "waived_emi_count": payload["waived_emi_count"],
        "waived_amount": payload["waived_amount"],
    }


def _serialize_public_draw_verification(draw: LuckyDraw):
    revealed_seed = draw.revealed_seed if draw.is_revealed else None
    hash_matches = None
    recalculated_hash = None
    if revealed_seed:
        recalculated_hash = hashlib.sha256(revealed_seed.strip().encode()).hexdigest()
        hash_matches = recalculated_hash == draw.committed_hash

    return {
        "id": draw.id,
        "batch_code": draw.batch.batch_code,
        "draw_month": draw.draw_month,
        "public_commit_hash": _public_commitment_hash(draw),
        "commitment_published_at": _public_commitment_published_at(draw),
        "reveal_timestamp": draw.revealed_at,
        "eligible_snapshot_count": _public_snapshot_count(draw),
        "public_verification_status": _public_verification_status(draw),
        "verification_status": "verified" if draw.is_revealed else "pending_reveal",
        "revealed_seed": revealed_seed,
        "hash_matches": hash_matches,
        "recalculated_hash": recalculated_hash,
        "verification_message": (
            "Reveal seed matches the published commitment." if hash_matches else
            "Draw is committed but not yet revealed." if not draw.is_revealed else
            "Reveal seed is available but does not match the published commitment."
        ),
        "public_explanation": _public_explanation_text(),
    }


def _latest_public_draw():
    return (
        LuckyDraw.objects.select_related(
            "batch",
            "draw_commit",
            "winner_lucky_id",
            "winner_subscription__customer",
            "winner_subscription__product",
        )
        .order_by("-draw_date", "-id")
        .first()
    )


class PublicLuckyDrawLatestTrustSummaryView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        latest = _latest_public_draw()
        if not latest:
            return Response({"draw": None})
        return Response({"draw": _serialize_public_draw_certificate(latest, request)})


class PublicLuckyDrawTrustSummaryView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, draw_id):
        draw = get_object_or_404(
            LuckyDraw.objects.select_related(
                "batch",
                "draw_commit",
                "winner_lucky_id",
                "winner_subscription__customer",
                "winner_subscription__product",
            ),
            pk=draw_id,
        )
        return Response({"draw": _serialize_public_draw_certificate(draw, request)})


class PublicLuckyDrawCertificateView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, draw_id):
        draw = get_object_or_404(
            LuckyDraw.objects.select_related(
                "batch",
                "draw_commit",
                "winner_lucky_id",
                "winner_subscription__customer",
                "winner_subscription__product",
            ),
            pk=draw_id,
        )
        log_audit(
            action_type=AuditLog.ActionType.DRAW_CERTIFICATE_PUBLISHED,
            instance=draw,
            metadata={
                "batch_id": draw.batch_id,
                "batch_code": draw.batch.batch_code,
                "draw_month": draw.draw_month,
                "public_commit_hash": _public_commitment_hash(draw),
                "eligible_snapshot_count": _public_snapshot_count(draw),
                "public_verification_status": _public_verification_status(draw),
            },
        )
        return Response({"certificate": _serialize_public_draw_certificate(draw, request)})


class PublicLuckyDrawVerificationView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, draw_id):
        draw = get_object_or_404(
            LuckyDraw.objects.select_related(
                "batch",
                "draw_commit",
                "winner_lucky_id",
                "winner_subscription__customer",
                "winner_subscription__product",
            ),
            pk=draw_id,
        )
        payload = _serialize_public_draw_verification(draw)
        log_audit(
            action_type=AuditLog.ActionType.DRAW_PUBLIC_VERIFIED,
            instance=draw,
            metadata={
                "batch_id": draw.batch_id,
                "batch_code": draw.batch.batch_code,
                "draw_month": draw.draw_month,
                "public_commit_hash": payload["public_commit_hash"],
                "hash_matches": payload["hash_matches"],
                "eligible_snapshot_count": payload["eligible_snapshot_count"],
                "public_verification_status": payload["public_verification_status"],
            },
        )
        return Response({"verification": payload})


class PublicLuckyDrawWinnerView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, draw_id):
        draw = get_object_or_404(
            LuckyDraw.objects.select_related(
                "batch",
                "draw_commit",
                "winner_lucky_id",
                "winner_subscription__customer",
                "winner_subscription__product",
            ),
            pk=draw_id,
        )
        payload = _serialize_public_winner(draw, request)
        log_audit(
            action_type=AuditLog.ActionType.DRAW_PUBLIC_RESULT_PUBLISHED,
            instance=draw,
            metadata={
                "batch_id": draw.batch_id,
                "batch_code": draw.batch.batch_code,
                "draw_month": draw.draw_month,
                "public_commit_hash": payload["public_commit_hash"],
                "public_verification_status": payload["public_verification_status"],
                "winner_lucky_number": payload["winner_lucky_number"],
                "eligible_snapshot_count": payload["eligible_snapshot_count"],
            },
        )
        return Response({"winner": payload})


class PublicStatsView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        visible_subscriptions = Subscription.objects.filter(subscription_dashboard_visible_q())
        return Response(
            {
                "total_batches": Batch.objects.count(),
                "total_subscriptions": visible_subscriptions.count(),
                "active_subscriptions": visible_subscriptions.filter(status="ACTIVE").count(),
                "total_winners": visible_subscriptions.filter(
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
        create_pe = validated.pop("create_procurement_enquiry", False)
        intent_val = validated.pop("intent", "GENERAL")
        product = None
        product_id = validated.pop("product_id", None)

        if product_id is not None:
            try:
                product = Product.objects.get(id=product_id, is_active=True)
            except Product.DoesNotExist:
                raise serializers.ValidationError(
                    {"product_id": "Selected product is not available."}
                )

        try:
            lead = create_public_lead(
                product=product,
                intent=intent_val,
                create_procurement_enquiry=create_pe,
                **validated,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

        procurement_enquiry_id = None
        if create_pe:
            from accounting.models import CustomerPurchaseEnquiry

            row = CustomerPurchaseEnquiry.objects.filter(public_lead_id=lead.pk).order_by("-id").first()
            procurement_enquiry_id = row.id if row else None

        payload = {
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
                "intent": lead.intent,
            },
        }
        if procurement_enquiry_id is not None:
            payload["procurement_enquiry_id"] = procurement_enquiry_id

        return Response(payload, status=status.HTTP_201_CREATED)


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
    path("policies/", PublicPolicyPageListView.as_view(), name="public-policy-list"),
    path("policies/<slug:slug>/", PublicPolicyPageDetailView.as_view(), name="public-policy-detail"),
    path("business-compliance/summary/", PublicBusinessComplianceSummaryView.as_view(), name="public-business-compliance-summary"),
    path("products/", PublicProductsView.as_view(), name="public-products"),
    path("products/<int:id>/", PublicProductDetailView.as_view(), name="public-product-detail"),
    path("leads/", PublicLeadView.as_view(), name="public-leads"),
    path("latest-winner/", LatestWinnerView.as_view(), name="latest-winner"),
    path("winners/", PublicWinnersView.as_view(), name="public-winners"),
    path("winner-history/", PublicWinnerHistoryView.as_view(), name="public-winner-history"),
    path("lucky-draws/latest/", PublicLuckyDrawLatestTrustSummaryView.as_view(), name="public-lucky-draw-latest"),
    path("lucky-draws/<int:draw_id>/trust-summary/", PublicLuckyDrawTrustSummaryView.as_view(), name="public-lucky-draw-trust-summary"),
    path("lucky-draws/<int:draw_id>/certificate/", PublicLuckyDrawCertificateView.as_view(), name="public-lucky-draw-certificate"),
    path("lucky-draws/<int:draw_id>/verification/", PublicLuckyDrawVerificationView.as_view(), name="public-lucky-draw-verification"),
    path("lucky-draws/<int:draw_id>/winner/", PublicLuckyDrawWinnerView.as_view(), name="public-lucky-draw-winner"),
    path("health/", PublicLivenessView.as_view(), name="public-health"),
    path("readiness/", PublicReadinessView.as_view(), name="public-readiness"),
]
