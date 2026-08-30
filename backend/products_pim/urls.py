from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .bridge_views import (
    ProductPimAttributesView,
    ProductPimDetailView,
    ProductPimAccessoriesView,
    ProductPimAccessoryDetailView,
    ProductPimVariantPublishControlView,
)
from .viewsets import (
    AttributeOptionViewSet,
    ProductCategoryViewSet,
    ProductSubcategoryViewSet,
    CategoryAttributeViewSet,
    PimProductViewSet,
    ProductVariantViewSet,
    ProductMediaItemViewSet,
)
from .workbench_views import PimProductWorkbenchViewSet

router = DefaultRouter()
router.register(r"attribute-options", AttributeOptionViewSet, basename="pim-attribute-option")
router.register(r"categories", ProductCategoryViewSet, basename="pim-category")
router.register(r"subcategories", ProductSubcategoryViewSet, basename="pim-subcategory")
router.register(r"attributes", CategoryAttributeViewSet, basename="pim-attribute")
router.register(r"products", PimProductViewSet, basename="pim-product")
router.register(r"variants", ProductVariantViewSet, basename="pim-variant")
router.register(r"workbench", PimProductWorkbenchViewSet, basename="pim-workbench")
router.register(r"media", ProductMediaItemViewSet, basename="pim-media")

urlpatterns = [
    path("by-product/<int:product_id>/", ProductPimDetailView.as_view(), name="pim-by-product"),
    path("by-product/<int:product_id>/attributes/", ProductPimAttributesView.as_view(), name="pim-by-product-attributes"),
    path("by-product/<int:product_id>/accessories/", ProductPimAccessoriesView.as_view(), name="pim-by-product-accessories"),
    path("by-product/<int:product_id>/accessories/<int:accessory_id>/", ProductPimAccessoryDetailView.as_view(), name="pim-by-product-accessory-detail"),
    path("by-product/<int:product_id>/variants/publish-control/", ProductPimVariantPublishControlView.as_view(), name="pim-by-product-variant-publish-control"),
    path("", include(router.urls)),
]
