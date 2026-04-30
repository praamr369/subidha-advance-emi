from django.urls import include, path
from rest_framework.routers import DefaultRouter

from api.v1.views.inventory import (
    GoodsReceiptViewSet,
    InventoryItemViewSet,
    InventoryValuationView,
    OpeningStockImportPostView,
    OpeningStockImportPreviewView,
    PurchaseBillViewSet,
    PurchaseOrderViewSet,
    StockLocationViewSet,
    StockAdjustmentViewSet,
    StockLedgerViewSet,
    StockSummaryView,
    VendorBillViewSet,
    VendorContactViewSet,
    VendorPaymentViewSet,
    VendorViewSet,
)
from api.v1.views.inventory_phase2 import (
    DemandSummaryView,
    ProductAvailabilityView,
    ProductDemandPlanningView,
    ProductStockStatusView,
    PurchaseNeedGenerateView,
    PurchaseSuggestionView,
)

router = DefaultRouter()
router.register(r"items", InventoryItemViewSet, basename="inventory-items")
router.register(r"locations", StockLocationViewSet, basename="inventory-locations")
router.register(r"movements", StockLedgerViewSet, basename="inventory-movements")
router.register(r"stock-adjustments", StockAdjustmentViewSet, basename="inventory-stock-adjustments")
router.register(r"purchase-bills", PurchaseBillViewSet, basename="inventory-purchase-bills")
router.register(r"vendors", VendorViewSet, basename="inventory-vendors")
router.register(r"vendor-contacts", VendorContactViewSet, basename="inventory-vendor-contacts")
router.register(r"purchase-orders", PurchaseOrderViewSet, basename="inventory-purchase-orders")
router.register(r"goods-receipts", GoodsReceiptViewSet, basename="inventory-goods-receipts")
router.register(r"vendor-bills", VendorBillViewSet, basename="inventory-vendor-bills")
router.register(r"vendor-payments", VendorPaymentViewSet, basename="inventory-vendor-payments")
router.register(r"stock-ledger", StockLedgerViewSet, basename="inventory-stock-ledger")

urlpatterns = [
    path("stock-summary/", StockSummaryView.as_view()),
    path("valuation/", InventoryValuationView.as_view()),
    path("opening-stock/preview/", OpeningStockImportPreviewView.as_view()),
    path("opening-stock/post/", OpeningStockImportPostView.as_view()),
    # Phase 2: stock status per product, demand summary, purchase suggestions
    path("products/<int:product_id>/stock-status/", ProductStockStatusView.as_view(), name="inventory-product-stock-status"),
    path("products/<int:product_id>/availability/", ProductAvailabilityView.as_view(), name="inventory-product-availability"),
    path("products/<int:product_id>/demand-planning/", ProductDemandPlanningView.as_view(), name="inventory-product-demand-planning"),
    path("products/<int:product_id>/purchase-needs/generate/", PurchaseNeedGenerateView.as_view(), name="inventory-product-purchase-needs-generate"),
    path("demand-summary/", DemandSummaryView.as_view(), name="inventory-demand-summary"),
    path("purchase-suggestions/", PurchaseSuggestionView.as_view(), name="inventory-purchase-suggestions"),
    path("", include(router.urls)),
]
