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
    AdminBrochureQuotationAcceptView,
    AdminBrochureQuotationCancelView,
    AdminBrochureQuotationDetailView,
    AdminBrochureQuotationFromEnquiryView,
    AdminBrochureQuotationListCreateView,
    AdminBrochureQuotationRecalculateView,
    AdminBrochureQuotationRegeneratePdfView,
    AdminBrochureQuotationRejectView,
    AdminBrochureQuotationSendView,
    AdminProductBrochureSettingsBulkUpdateView,
    AdminProductBrochureSettingsDetailView,
    AdminProductBrochureSettingsListView,
    PublicBrochureDetailView,
    PublicBrochureEnquiryCreateView,
    PublicBrochureQuotationDetailView,
    PublicBrochureProductsView,
)

admin_urlpatterns = [
    path(
        "quotations/from-enquiry/<int:enquiry_id>/",
        AdminBrochureQuotationFromEnquiryView.as_view(),
        name="admin-brochure-quotation-from-enquiry",
    ),
    path(
        "quotations/<int:pk>/recalculate/",
        AdminBrochureQuotationRecalculateView.as_view(),
        name="admin-brochure-quotation-recalculate",
    ),
    path(
        "quotations/<int:pk>/send/",
        AdminBrochureQuotationSendView.as_view(),
        name="admin-brochure-quotation-send",
    ),
    path(
        "quotations/<int:pk>/accept/",
        AdminBrochureQuotationAcceptView.as_view(),
        name="admin-brochure-quotation-accept",
    ),
    path(
        "quotations/<int:pk>/reject/",
        AdminBrochureQuotationRejectView.as_view(),
        name="admin-brochure-quotation-reject",
    ),
    path(
        "quotations/<int:pk>/cancel/",
        AdminBrochureQuotationCancelView.as_view(),
        name="admin-brochure-quotation-cancel",
    ),
    path(
        "quotations/<int:pk>/regenerate-pdf/",
        AdminBrochureQuotationRegeneratePdfView.as_view(),
        name="admin-brochure-quotation-regenerate-pdf",
    ),
    path(
        "quotations/<int:pk>/",
        AdminBrochureQuotationDetailView.as_view(),
        name="admin-brochure-quotation-detail",
    ),
    path(
        "quotations/",
        AdminBrochureQuotationListCreateView.as_view(),
        name="admin-brochure-quotation-list",
    ),
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

public_quotation_urlpatterns = [
    path(
        "<str:public_token>/",
        PublicBrochureQuotationDetailView.as_view(),
        name="public-brochure-quotation-detail",
    ),
]

urlpatterns = admin_urlpatterns
