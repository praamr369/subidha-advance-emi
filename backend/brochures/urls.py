from django.urls import path

from brochures.views import (
    AdminBrochureDetailView,
    AdminBrochureEnquiryAssignView,
    AdminBrochureEnquiryCloseView,
    AdminBrochureEnquiryDetailView,
    AdminBrochureEnquiryListView,
    AdminBrochureEnquiryMarkContactedView,
    AdminBrochureGenerateView,
    AdminBrochureListView,
    AdminBrochurePreviewView,
    AdminBrochureProductsView,
    AdminProductBrochureSettingsBulkUpdateView,
    AdminProductBrochureSettingsDetailView,
    AdminProductBrochureSettingsListView,
    PublicBrochureDetailView,
    PublicBrochureEnquiryCreateView,
    PublicBrochureProductsView,
)

admin_urlpatterns = [
    path(
        "enquiries/<int:pk>/mark-contacted/",
        AdminBrochureEnquiryMarkContactedView.as_view(),
        name="admin-brochure-enquiry-mark-contacted",
    ),
    path(
        "enquiries/<int:pk>/assign/",
        AdminBrochureEnquiryAssignView.as_view(),
        name="admin-brochure-enquiry-assign",
    ),
    path(
        "enquiries/<int:pk>/close/",
        AdminBrochureEnquiryCloseView.as_view(),
        name="admin-brochure-enquiry-close",
    ),
    path(
        "enquiries/<int:pk>/",
        AdminBrochureEnquiryDetailView.as_view(),
        name="admin-brochure-enquiry-detail",
    ),
    path(
        "enquiries/",
        AdminBrochureEnquiryListView.as_view(),
        name="admin-brochure-enquiry-list",
    ),
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
        "<str:public_token>/enquiries/",
        PublicBrochureEnquiryCreateView.as_view(),
        name="public-brochure-enquiry-create",
    ),
    path(
        "<str:public_token>/products/",
        PublicBrochureProductsView.as_view(),
        name="public-brochure-products",
    ),
    path(
        "<str:public_token>/",
        PublicBrochureDetailView.as_view(),
        name="public-brochure-detail",
    ),
]

urlpatterns = admin_urlpatterns
