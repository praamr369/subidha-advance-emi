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
    calculate_product_demand_bulk,
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


class BulkDemandPlanningView(APIView):
    """
    GET /api/v1/inventory/demand-planning/bulk/?page=1&page_size=50&search=SKU&critical_shortage=true&demand_sources=subscriptions,direct_sales,rent_lease

    Returns paginated demand planning data for multiple products.
    Uses calculate_product_demand_bulk to fetch demand data in 5 queries total.

    Query Parameters:
      page: Page number (default 1)
      page_size: Items per page (default 50, max 500)
      search: Search by SKU, product code, or name
      critical_shortage: Filter for products with shortages (true/false)
      demand_sources: Comma-separated list of demand sources to include:
        - subscriptions (active subs + locked batch + winners)
        - direct_sales
        - rent_lease
    """

    permission_classes = [IsAdmin]

    def get(self, request):
        from inventory.models import InventoryItem
        from products_core.models import Product
        from django.db.models import Q

        # Parse pagination params
        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 50))
            page = max(1, page)
            page_size = min(page_size, 500)  # Cap at 500
        except (ValueError, TypeError):
            page = 1
            page_size = 50

        # Get search and filter params
        search = (request.query_params.get("search") or "").strip()
        critical_shortage = request.query_params.get("critical_shortage", "").lower() == "true"

        # Parse demand source filters
        demand_sources_param = (request.query_params.get("demand_sources") or "").strip().lower()
        selected_sources = set()
        if demand_sources_param:
            sources = [s.strip() for s in demand_sources_param.split(",") if s.strip()]
            selected_sources = set(sources)

        # Step 1: Get ALL products (including those without inventory items)
        # This ensures we show demand even for products not yet in inventory system
        products_queryset = Product.objects.all()

        # Apply search filter
        if search:
            products_queryset = products_queryset.filter(
                Q(product_code__icontains=search) |
                Q(name__icontains=search)
            )

        # Get all products
        all_products = list(products_queryset.order_by("name", "id"))
        product_ids = [p.id for p in all_products]

        # Step 2: Get demand data for ALL products in bulk (5 queries)
        # This will return demand even for products without inventory items
        demand_map = calculate_product_demand_bulk(product_ids)

        # Step 3: Get inventory items for products that have them (optional enhancement)
        inventory_items_map = {}
        if product_ids:
            from inventory.services.stock_on_hand_service import _annotate_stock_qty
            
            qs = InventoryItem.objects.filter(product_id__in=product_ids)
            qs = _annotate_stock_qty(qs)
            
            inventory_items = qs.values(
                "product_id", "sku", "physical_qty", "stock_tracking_enabled"
            )
            for item in inventory_items:
                inventory_items_map[item["product_id"]] = item

        # Get total count BEFORE filtering (count of products with demand)
        total_count = len(all_products)

        # Build enriched list with demand data (including products without inventory items)
        enriched_items = []
        for product in all_products:
            demand = demand_map.get(product.id, {})

            # Skip products with zero demand, unless the user explicitly searched for them
            total_required = float(demand.get("total_required", "0"))
            if total_required == 0 and not demand and not search:
                continue

            # Get on-hand quantity (if inventory item exists)
            on_hand = 0.0
            sku = ""
            inventory_item = inventory_items_map.get(product.id)
            if inventory_item:
                try:
                    on_hand = float(inventory_item.get("physical_qty") or 0)
                except (ValueError, TypeError):
                    on_hand = 0.0
                sku = inventory_item.get("sku") or ""

            # Extract demand components
            active_subs = demand.get("active_subscriptions", 0)
            locked_batch = demand.get("locked_batch_demand", 0)
            winners = demand.get("winners_pending_delivery", 0)
            direct_sales = demand.get("direct_sale_orders", 0)
            rent_lease = demand.get("rent_lease_commitments", 0)

            result = {
                "product": product,
                "on_hand": on_hand,
                "sku": sku,
                "demand": demand,
                "total_required": total_required,
                "shortage": max(0, total_required - on_hand),
            }

            # Apply demand source filter (if specified)
            if selected_sources:
                has_subscription_demand = (active_subs + locked_batch + winners) > 0
                has_direct_sales_demand = direct_sales > 0
                has_rent_lease_demand = rent_lease > 0

                matches_filter = False
                if "subscriptions" in selected_sources and has_subscription_demand:
                    matches_filter = True
                if "direct_sales" in selected_sources and has_direct_sales_demand:
                    matches_filter = True
                if "rent_lease" in selected_sources and has_rent_lease_demand:
                    matches_filter = True

                if not matches_filter:
                    continue

            # Apply critical shortage filter (if enabled)
            if not critical_shortage or result["shortage"] > 0:
                enriched_items.append(result)

        # Now apply pagination to filtered results
        filtered_count = len(enriched_items)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_results = enriched_items[start_idx:end_idx]

        num_pages = (filtered_count + page_size - 1) // page_size if filtered_count > 0 else 1

        # Build final response
        results = []
        for item_data in paginated_results:
            product = item_data["product"]
            demand = item_data["demand"]
            on_hand = item_data["on_hand"]
            sku = item_data["sku"]

            result = {
                "product_id": product.id,
                "sku": sku if sku else f"NOSKU-{product.id}",  # Provide fallback for products without inventory items
                "product_code": product.product_code,
                "product_name": product.name,
                "on_hand": f"{on_hand:.3f}",
                "active_subscriptions": demand.get("active_subscriptions", 0),
                "locked_batch_demand": demand.get("locked_batch_demand", 0),
                "winners_pending_delivery": demand.get("winners_pending_delivery", 0),
                "direct_sale_orders": demand.get("direct_sale_orders", 0),
                "rent_lease_commitments": demand.get("rent_lease_commitments", 0),
                "total_required": demand.get("total_required", "0.000"),
            }
            results.append(result)

        return Response({
            "count": filtered_count if (critical_shortage or selected_sources) else total_count,
            "page": page,
            "page_size": page_size,
            "num_pages": num_pages,
            "results": results,
        })
