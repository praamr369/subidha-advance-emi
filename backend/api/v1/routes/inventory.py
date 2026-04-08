from django.urls import include, path
from rest_framework.routers import DefaultRouter

from api.v1.views.inventory import (
    InventoryItemViewSet,
    InventoryValuationView,
    PurchaseBillViewSet,
    StockAdjustmentViewSet,
    StockLedgerViewSet,
    StockSummaryView,
)

router = DefaultRouter()
router.register(r"items", InventoryItemViewSet, basename="inventory-items")
router.register(r"movements", StockLedgerViewSet, basename="inventory-movements")
router.register(r"stock-adjustments", StockAdjustmentViewSet, basename="inventory-stock-adjustments")
router.register(r"purchase-bills", PurchaseBillViewSet, basename="inventory-purchase-bills")
router.register(r"stock-ledger", StockLedgerViewSet, basename="inventory-stock-ledger")

urlpatterns = [
    path("stock-summary/", StockSummaryView.as_view()),
    path("valuation/", InventoryValuationView.as_view()),
    path("", include(router.urls)),
]
