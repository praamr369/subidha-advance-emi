"""
Phase 2 Inventory API Views

Endpoints:
  GET  /api/v1/inventory/products/<id>/stock-status/
  GET  /api/v1/inventory/demand-summary/
  GET  /api/v1/inventory/purchase-suggestions/

All admin-only. No financial records mutated here.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from inventory.services.demand_service import (
    get_demand_for_product,
    get_purchase_suggestions,
    get_shortage_for_product,
)
from inventory.services.demand_planning_service import (
    calculate_product_demand,
    get_product_stock_availability,
    upsert_purchase_need_for_product,
)


class ProductStockStatusView(APIView):
    """
    GET /api/v1/inventory/products/<product_id>/stock-status/

    Returns physical, reserved, and available stock for a product along with
    demand and shortage data.  Used by ProductSelector to show stock badges.
    """

    permission_classes = [IsAdmin]

    def get(self, request, product_id: int):
        shortage_data = get_shortage_for_product(product_id)

        # Also pull reorder threshold
        from inventory.models import InventoryItem

        try:
            item = InventoryItem.objects.select_related("product").get(
                product_id=product_id
            )
            low_stock_threshold = item.reorder_level_qty
        except InventoryItem.DoesNotExist:
            low_stock_threshold = 0

        shortage_data["low_stock_threshold"] = low_stock_threshold

        # Determine visual stock status
        physical = shortage_data["physical_stock"]
        available = shortage_data["available_stock"]
        threshold = low_stock_threshold

        if physical <= 0:
            stock_status = "OUT_OF_STOCK"
        elif threshold and physical <= threshold:
            stock_status = "LOW_STOCK"
        elif available <= 0:
            stock_status = "FULLY_RESERVED"
        else:
            stock_status = "IN_STOCK"

        shortage_data["stock_status"] = stock_status
        return Response(shortage_data)


class DemandSummaryView(APIView):
    """
    GET /api/v1/inventory/demand-summary/?product_id=<id>

    Demand across subscription requests, direct sales, and rent/lease requests.
    """

    permission_classes = [IsAdmin]

    def get(self, request):
        product_id = request.query_params.get("product_id")
        if not product_id or not str(product_id).isdigit():
            return Response(
                {"detail": "Provide a valid 'product_id' query parameter."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(get_demand_for_product(int(product_id)))


class PurchaseSuggestionView(APIView):
    """
    GET /api/v1/inventory/purchase-suggestions/

    Returns a list of products that need restocking due to low stock threshold
    breach or active demand shortage.  Suggestions are advisory only — no PO
    is created automatically.

    Optional query params:
      product_ids=1,2,3  (comma-separated, limit to specific products)
    """

    permission_classes = [IsAdmin]

    def get(self, request):
        raw = (request.query_params.get("product_ids") or "").strip()
        product_ids = None
        if raw:
            try:
                product_ids = [int(x.strip()) for x in raw.split(",") if x.strip()]
            except ValueError:
                return Response(
                    {"detail": "product_ids must be comma-separated integers."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        suggestions = get_purchase_suggestions(product_ids=product_ids)
        return Response(
            {
                "count": len(suggestions),
                "results": suggestions,
            }
        )


class ProductDemandPlanningView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, product_id: int):
        return Response(calculate_product_demand(product_id=product_id))


class ProductAvailabilityView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, product_id: int):
        return Response(get_product_stock_availability(product_id=product_id))


class PurchaseNeedGenerateView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, product_id: int):
        need = upsert_purchase_need_for_product(product_id=product_id, created_by=request.user)
        if need is None:
            return Response({"created": False, "detail": "No shortage for this product."})
        return Response(
            {
                "created": True,
                "purchase_need_id": need.id,
                "product_id": need.product_id,
                "required_quantity": f"{need.required_quantity:.3f}",
                "available_quantity": f"{need.available_quantity:.3f}",
                "shortage_quantity": f"{need.shortage_quantity:.3f}",
                "status": need.status,
            }
        )
