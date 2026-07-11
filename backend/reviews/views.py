import os
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status, serializers

from api.v1.permissions import IsAdmin
from reviews.models import InternalReview
from reviews.services import get_combined_reviews, fetch_google_reviews, fetch_facebook_reviews


# ── Public ────────────────────────────────────────────────────────────────────

class PublicReviewsView(APIView):
    """Public: returns all approved reviews + Google/Facebook data (cached)."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(get_combined_reviews())


class PublicReviewSubmitView(APIView):
    """Anyone can submit a review; goes into pending queue."""
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


# ── Customer (authenticated) ──────────────────────────────────────────────────

class CustomerReviewListView(APIView):
    """Logged-in customer: list their own submitted reviews."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = InternalReview.objects.filter(customer=request.user)
        return Response({
            "results": [_serialize_review(r, include_status=True) for r in qs]
        })


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
    """Force-refresh cached Google/Facebook reviews."""
    permission_classes = [IsAdmin]

    def post(self, request):
        g = fetch_google_reviews(force_refresh=True)
        f = fetch_facebook_reviews(force_refresh=True)
        return Response({
            "google_fetched": len(g.get("reviews", [])),
            "facebook_fetched": len(f.get("reviews", [])),
            "google_error": g.get("error"),
            "facebook_error": f.get("error"),
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
