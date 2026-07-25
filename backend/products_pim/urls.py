from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .bridge_views import ProductPimAttributesView, ProductPimDetailView
from .viewsets import (
    AttributeOptionViewSet,
    ProductCategoryViewSet,
    ProductSubcategoryViewSet,
    CategoryAttributeViewSet,
    PimProductViewSet,
    ProductVariantViewSet,
)

router = DefaultRouter()
router.register(r"attribute-options", AttributeOptionViewSet, basename="pim-attribute-option")
router.register(r"categories", ProductCategoryViewSet, basename="pim-category")
router.register(r"subcategories", ProductSubcategoryViewSet, basename="pim-subcategory")
router.register(r"attributes", CategoryAttributeViewSet, basename="pim-attribute")
router.register(r"products", PimProductViewSet, basename="pim-product")
router.register(r"variants", ProductVariantViewSet, basename="pim-variant")

urlpatterns = [
    path("by-product/<int:product_id>/", ProductPimDetailView.as_view(), name="pim-by-product"),
    path("by-product/<int:product_id>/attributes/", ProductPimAttributesView.as_view(), name="pim-by-product-attributes"),
    path("", include(router.urls)),
]
