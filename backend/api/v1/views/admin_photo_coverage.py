"""
Photography coverage: which products still have no image.

Backs the bulk upload screen. The catalogue is large and mostly unphotographed,
so the useful question is not "show me all products" but "show me what is still
missing, and let me match a folder of files to them by code".
"""
from __future__ import annotations

from django.db.models import Count, Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin

MAX_PAGE_SIZE = 500


class AdminPhotoCoverageView(APIView):
    """Products with their image counts, so the UI can target the gaps."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from products_pim.models import MediaKind, PimProduct

        qs = (
            PimProduct.objects.filter(is_active=True)
            .annotate(
                photo_count=Count(
                    "media_items", filter=Q(media_items__kind=MediaKind.IMAGE), distinct=True
                )
            )
            .select_related("category")
        )

        # Totals cover the whole active catalogue, not the filtered page, so the
        # coverage figure does not move as you search.
        active = PimProduct.objects.filter(is_active=True)
        total = active.count()
        with_photos = (
            active.filter(media_items__kind=MediaKind.IMAGE).distinct().count()
        )

        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(code__icontains=search) | Q(name__icontains=search))

        if (request.query_params.get("missing_only") or "").lower() == "true":
            qs = qs.filter(photo_count=0)

        try:
            limit = min(int(request.query_params.get("limit", 200)), MAX_PAGE_SIZE)
        except ValueError:
            limit = 200

        products = [
            {
                "id": p.id,
                "code": p.code,
                "name": p.name,
                "category": getattr(p.category, "name", None),
                "photo_count": p.photo_count,
                "is_published": p.is_published,
            }
            for p in qs.order_by("code")[:limit]
        ]

        return Response(
            {
                "total": total,
                "with_photos": with_photos,
                "without_photos": total - with_photos,
                "returned": len(products),
                "products": products,
            }
        )
