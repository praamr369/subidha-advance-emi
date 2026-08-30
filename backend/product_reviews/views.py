from django.db.models import Avg, Count
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ProductReview, ReviewPhoto
from .serializers import (
    AdminReviewSerializer,
    ProductReviewSerializer,
    SubmitReviewSerializer,
)
from .services import sync_approved_review


class PublicReviewListView(APIView):
    """GET /api/v1/reviews/?product=<id>  — approved reviews for a product."""
    permission_classes = [AllowAny]

    def get(self, request):
        product_id = request.query_params.get("product")
        if not product_id:
            return Response({"detail": "product param required"}, status=400)
        qs = (
            ProductReview.objects
            .filter(product_id=product_id, status=ProductReview.STATUS_APPROVED)
            .prefetch_related("photos")
            .order_by("-created_at")
        )
        page = int(request.query_params.get("page", 1))
        page_size = 10
        total = qs.count()
        items = qs[(page - 1) * page_size: page * page_size]
        stats = ProductReview.objects.filter(
            product_id=product_id, status=ProductReview.STATUS_APPROVED
        ).aggregate(avg=Avg("rating"), total=Count("id"))

        return Response({
            "count": total,
            "page": page,
            "page_size": page_size,
            "average_rating": round(float(stats["avg"] or 0), 1),
            "total_reviews": stats["total"] or 0,
            "results": ProductReviewSerializer(items, many=True, context={"request": request}).data,
        })


class SubmitReviewView(APIView):
    """POST /api/v1/reviews/submit/  — submit a new review (auto-pending)."""
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        ser = SubmitReviewSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        data = ser.validated_data

        from products_core.models import Product
        try:
            product = Product.objects.get(pk=data["product_id"])
        except Product.DoesNotExist:
            return Response({"detail": "Product not found"}, status=404)

        review = ProductReview.objects.create(
            product=product,
            reviewer_name=data["reviewer_name"],
            reviewer_email=data.get("reviewer_email", ""),
            rating=data["rating"],
            title=data.get("title", ""),
            body=data.get("body", ""),
            status=ProductReview.STATUS_PENDING,
        )

        # Attach photos if provided
        for f in request.FILES.getlist("photos"):
            ReviewPhoto.objects.create(review=review, file=f)

        return Response(
            {"detail": "Review submitted. It will appear after moderation.", "id": review.id},
            status=status.HTTP_201_CREATED,
        )


class AdminReviewListView(APIView):
    """Admin: GET /api/v1/admin/reviews/  — list all reviews with filters."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = ProductReview.objects.select_related("product", "customer").prefetch_related("photos")
        status_filter = request.query_params.get("status")
        product_id = request.query_params.get("product")
        if status_filter:
            qs = qs.filter(status=status_filter)
        if product_id:
            qs = qs.filter(product_id=product_id)
        page = int(request.query_params.get("page", 1))
        page_size = 20
        total = qs.count()
        items = qs.order_by("-created_at")[(page - 1) * page_size: page * page_size]
        return Response({
            "count": total,
            "page": page,
            "page_size": page_size,
            "results": AdminReviewSerializer(items, many=True, context={"request": request}).data,
        })


class AdminReviewDetailView(APIView):
    """Admin: GET/PATCH /api/v1/admin/reviews/<id>/"""
    permission_classes = [IsAuthenticated]

    def _get(self, pk):
        try:
            return ProductReview.objects.prefetch_related("photos").get(pk=pk)
        except ProductReview.DoesNotExist:
            return None

    def get(self, request, pk):
        review = self._get(pk)
        if not review:
            return Response(status=404)
        return Response(AdminReviewSerializer(review, context={"request": request}).data)

    def patch(self, request, pk):
        review = self._get(pk)
        if not review:
            return Response(status=404)

        action = request.data.get("action")
        if action == "approve":
            review.approve(user=request.user)
            sync_approved_review(review)
        elif action == "reject":
            review.reject(user=request.user, note=request.data.get("note", ""))
        else:
            ser = AdminReviewSerializer(review, data=request.data, partial=True, context={"request": request})
            if not ser.is_valid():
                return Response(ser.errors, status=400)
            ser.save()

        return Response(AdminReviewSerializer(review, context={"request": request}).data)


class AdminReviewSyncView(APIView):
    """Admin: POST /api/v1/admin/reviews/<id>/sync/  — (re)push to social platforms."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            review = ProductReview.objects.get(pk=pk)
        except ProductReview.DoesNotExist:
            return Response(status=404)
        if review.status != ProductReview.STATUS_APPROVED:
            return Response({"detail": "Only approved reviews can be synced."}, status=400)
        sync_approved_review(review, recipient_phone=request.data.get("whatsapp_phone"))
        return Response(AdminReviewSerializer(review, context={"request": request}).data)
