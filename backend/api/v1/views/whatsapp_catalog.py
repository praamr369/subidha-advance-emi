"""Product feed for the WhatsApp Business catalogue.

Meta Commerce Manager can fetch a CSV data feed from a URL on a schedule and
keep a catalogue in sync with it. Link that catalogue to the WhatsApp Business
account and every published product appears in the WhatsApp catalogue without
anyone retyping it. This is free and uses Meta's official feed format.

Only products that are live on the public site are included — the same filter
the public catalogue uses — and a product without an image is left out,
because Commerce Manager rejects rows with no image_link.
"""
from __future__ import annotations

import csv
import io
from decimal import Decimal

from django.db.models import Q
from django.http import HttpResponse
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from api.v1.serializers.public import PublicProductSerializer
from products_core.models import Product
from reminders.services.whatsapp_outbox_service import company_name

FEED_COLUMNS = [
    "id",
    "title",
    "description",
    "availability",
    "condition",
    "price",
    "link",
    "image_link",
    "brand",
]


def catalog_feed_rows(request) -> list[dict]:
    products = (
        Product.objects.filter(is_active=True, item_type="FINISHED_GOOD")
        .filter(Q(pim__isnull=True) | Q(pim__is_published=True))
        .order_by("name")
    )
    image_resolver = PublicProductSerializer(context={"request": request})
    brand = company_name()
    rows: list[dict] = []
    for product in products:
        image = image_resolver.get_image(product)
        if not image:
            continue
        if image.startswith("/"):
            image = request.build_absolute_uri(image)
        price = Decimal(str(product.base_price or "0"))
        if price <= 0:
            continue
        description = (product.description or "").strip() or product.name
        rows.append(
            {
                "id": product.product_code,
                "title": product.name[:150],
                "description": description[:5000],
                "availability": "in stock",
                "condition": "new",
                "price": f"{price:.2f} INR",
                "link": request.build_absolute_uri(f"/products/{product.product_code}"),
                "image_link": image,
                "brand": brand,
            }
        )
    return rows


class WhatsAppCatalogFeedView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=FEED_COLUMNS)
        writer.writeheader()
        for row in catalog_feed_rows(request):
            writer.writerow(row)
        response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'inline; filename="whatsapp-catalog.csv"'
        response["Cache-Control"] = "public, max-age=900"
        return response
