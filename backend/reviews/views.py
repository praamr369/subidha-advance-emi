from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

import os

from api.v1.permissions import IsAdmin
from reviews.models import InternalReview, ReviewPlatformConfig
from reviews.services import (
    get_combined_reviews,
    fetch_google_reviews,
    fetch_facebook_reviews,
    fetch_youtube_comments,
    get_review_links,
    invalidate_config_cache,
)


# ── Public ────────────────────────────────────────────────────────────────────

class PublicReviewsView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(get_combined_reviews())


class PublicReviewSubmitView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        name = (request.data.get("reviewer_name") or "").strip()
        phone = (request.data.get("reviewer_phone") or "").strip()
        rating = request.data.get("rating")
        title = (request.data.get("title") or "").strip()
        body = (request.data.get("body") or "").strip()

        if not name:
            return Response({"error": "Name is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not body:
            return Response({"error": "Review text is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            rating = int(rating)
            if not 1 <= rating <= 5:
                raise ValueError
        except (TypeError, ValueError):
            return Response({"error": "Rating must be 1–5."}, status=status.HTTP_400_BAD_REQUEST)

        customer = request.user if request.user.is_authenticated else None
        InternalReview.objects.create(
            reviewer_name=name,
            reviewer_phone=phone,
            rating=rating,
            title=title,
            body=body,
            customer=customer,
        )
        return Response({"message": "Thank you! Your review is pending approval."}, status=status.HTTP_201_CREATED)


# ── Customer ──────────────────────────────────────────────────────────────────

class CustomerReviewListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = InternalReview.objects.filter(customer=request.user)
        return Response({"results": [_serialize_review(r, include_status=True) for r in qs]})


# ── Admin ─────────────────────────────────────────────────────────────────────

class AdminReviewListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        status_filter = request.query_params.get("status")
        qs = InternalReview.objects.select_related("customer")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response({
            "results": [_serialize_review(r, include_status=True, include_contact=True) for r in qs[:200]],
            "counts": {
                "pending": InternalReview.objects.filter(status="pending").count(),
                "approved": InternalReview.objects.filter(status="approved").count(),
                "rejected": InternalReview.objects.filter(status="rejected").count(),
            },
            "links": get_review_links(),
        })


class AdminReviewDetailView(APIView):
    permission_classes = [IsAdmin]

    def get_object(self, pk):
        return get_object_or_404(InternalReview, pk=pk)

    def patch(self, request, pk):
        review = self.get_object(pk)
        if "status" in request.data:
            s = request.data["status"]
            if s not in ("pending", "approved", "rejected"):
                return Response({"error": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)
            review.status = s
        if "is_featured" in request.data:
            review.is_featured = bool(request.data["is_featured"])
        if "admin_reply" in request.data:
            review.admin_reply = request.data["admin_reply"]
        review.save()
        return Response(_serialize_review(review, include_status=True, include_contact=True))

    def delete(self, request, pk):
        self.get_object(pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminReviewRefreshCacheView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        g = fetch_google_reviews(force_refresh=True)
        f = fetch_facebook_reviews(force_refresh=True)
        y = fetch_youtube_comments(force_refresh=True)
        return Response({
            "google": {"fetched": len(g.get("reviews", [])), "error": g.get("error")},
            "facebook": {"fetched": len(f.get("reviews", [])), "error": f.get("error")},
            "youtube": {"fetched": len(y.get("reviews", [])), "error": y.get("error")},
        })


CONFIG_FIELDS = (
    "google_places_api_key",
    "google_place_id",
    "facebook_page_id",
    "facebook_page_access_token",
    "youtube_api_key",
    "youtube_channel_id",
)
SECRET_FIELDS = {
    "google_places_api_key",
    "facebook_page_access_token",
    "youtube_api_key",
}
ENV_FALLBACKS = {
    "google_places_api_key": "GOOGLE_PLACES_API_KEY",
    "google_place_id": "GOOGLE_PLACE_ID",
    "facebook_page_id": "FACEBOOK_PAGE_ID",
    "facebook_page_access_token": "FACEBOOK_PAGE_ACCESS_TOKEN",
    "youtube_api_key": "YOUTUBE_API_KEY",
    "youtube_channel_id": "YOUTUBE_CHANNEL_ID",
}


def _mask(value):
    if not value:
        return ""
    if len(value) <= 8:
        return "•" * len(value)
    return value[:4] + "•" * 6 + value[-2:]


class AdminReviewPlatformConfigView(APIView):
    """Brand Data Center: manage Google / Facebook / YouTube review credentials."""

    permission_classes = [IsAdmin]

    def get(self, request):
        obj = ReviewPlatformConfig.load()
        fields = {}
        for name in CONFIG_FIELDS:
            db_value = getattr(obj, name)
            env_value = os.getenv(ENV_FALLBACKS[name], "")
            effective = db_value or env_value
            fields[name] = {
                "value": (
                    _mask(effective) if name in SECRET_FIELDS else effective
                ),
                "configured": bool(effective),
                "source": "db" if db_value else ("env" if env_value else "none"),
            }
        return Response({
            "fields": fields,
            "links": get_review_links(),
            "updated_at": obj.updated_at.strftime("%d %b %Y %H:%M"),
        })

    def put(self, request):
        obj = ReviewPlatformConfig.load()
        changed = []
        for name in CONFIG_FIELDS:
            if name not in request.data:
                continue
            value = (request.data.get(name) or "").strip()
            # Ignore masked round-trips so an untouched secret field is not clobbered
            if name in SECRET_FIELDS and "•" in value:
                continue
            setattr(obj, name, value)
            changed.append(name)
        if changed:
            obj.save()
            invalidate_config_cache()
        return Response({
            "message": (
                f"Saved {len(changed)} field(s). Caches cleared."
                if changed else "No changes."
            ),
            "changed": changed,
        })


def _serialize_review(r, include_status=False, include_contact=False):
    data = {
        "id": r.id,
        "reviewer_name": r.reviewer_name,
        "rating": r.rating,
        "title": r.title,
        "body": r.body,
        "is_featured": r.is_featured,
        "admin_reply": r.admin_reply,
        "created_at": r.created_at.strftime("%d %b %Y"),
    }
    if include_status:
        data["status"] = r.status
    if include_contact:
        data["reviewer_phone"] = r.reviewer_phone
        data["customer_id"] = r.customer_id
    return data
