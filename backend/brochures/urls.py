from django.urls import path

from brochures.views import (
    AdminBrochureDetailView,
    AdminBrochureGenerateView,
    AdminBrochureListView,
    AdminBrochurePreviewView,
    AdminBrochureProductsView,
    AdminProductBrochureSettingsBulkUpdateView,
    AdminProductBrochureSettingsDetailView,
    AdminProductBrochureSettingsListView,
    PublicBrochureDetailView,
)

admin_urlpatterns = [
    path(
        "product-settings/bulk-update/",
        AdminProductBrochureSettingsBulkUpdateView.as_view(),
        name="admin-brochure-product-settings-bulk-update",
    ),
    path(
        "product-settings/<int:product_id>/",
        AdminProductBrochureSettingsDetailView.as_view(),
        name="admin-brochure-product-settings-detail",
    ),
    path(
        "product-settings/",
        AdminProductBrochureSettingsListView.as_view(),
        name="admin-brochure-product-settings-list",
    ),
    path(
        "products/", AdminBrochureProductsView.as_view(), name="admin-brochure-products"
    ),
    path("preview/", AdminBrochurePreviewView.as_view(), name="admin-brochure-preview"),
    path(
        "generate/", AdminBrochureGenerateView.as_view(), name="admin-brochure-generate"
    ),
    path("", AdminBrochureListView.as_view(), name="admin-brochure-list"),
    path("<int:pk>/", AdminBrochureDetailView.as_view(), name="admin-brochure-detail"),
]

public_urlpatterns = [
    path(
        "<str:public_token>/",
        PublicBrochureDetailView.as_view(),
        name="public-brochure-detail",
    ),
]

urlpatterns = admin_urlpatterns
