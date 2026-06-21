from django.urls import path

from brochures.views import (
    AdminBrochureDetailView,
    AdminBrochureGenerateView,
    AdminBrochureListView,
    AdminBrochurePreviewView,
    AdminBrochureProductsView,
    PublicBrochureDetailView,
)

admin_urlpatterns = [
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
