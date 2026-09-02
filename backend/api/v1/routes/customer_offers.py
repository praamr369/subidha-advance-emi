from django.urls import path

from api.v1.views.customer_offers import (
    CustomerMyOffersView,
    CustomerProductPricingView,
)

urlpatterns = [
    path("offers/", CustomerMyOffersView.as_view()),
    path("products/<str:product_code>/pricing/", CustomerProductPricingView.as_view()),
]
