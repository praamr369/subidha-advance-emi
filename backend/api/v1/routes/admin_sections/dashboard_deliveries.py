from django.urls import include, path
from api.v1.views.admin_dashboard import AdminDashboardView
from api.v1.views.admin_deliveries import AdminDeliveryCancelView
from api.v1.views.admin_deliveries import AdminDeliveryDetailView
from api.v1.views.admin_deliveries import AdminDeliveryListCreateView
from api.v1.views.admin_deliveries import AdminDeliveryMarkDeliveredView
from api.v1.views.admin_deliveries import AdminDeliveryMarkFailedView
from api.v1.views.admin_deliveries import AdminDeliveryMarkReturnedView
from api.v1.views.admin_deliveries import AdminDeliveryPdfView
from api.v1.views.admin_deliveries import AdminDeliveryRequestReturnView
from api.v1.views.admin_deliveries import AdminDeliverySourceDirectSalePrefillView
from api.v1.views.admin_deliveries import AdminDeliverySourceDirectSalesView
from api.v1.views.admin_deliveries import AdminDeliverySourceSubscriptionPrefillView
from api.v1.views.admin_deliveries import AdminDeliverySourceSubscriptionsView
from api.v1.views.admin_deliveries import AdminDeliverySummaryView
from api.v1.views.admin_deliveries import AdminDeliveryTransitionView
from api.v1.views.admin_deliveries import AdminDirectSaleDeliveryApprovePaymentExceptionView
from api.v1.views.admin_deliveries import AdminDirectSaleDeliveryCancelView
from api.v1.views.admin_deliveries import AdminDirectSaleDeliveryDetailView
from api.v1.views.admin_deliveries import AdminDirectSaleDeliveryDispatchView
from api.v1.views.admin_deliveries import AdminDirectSaleDeliveryMarkDeliveredView
from api.v1.views.admin_deliveries import AdminDirectSaleDeliveryMetadataView
from api.v1.views.admin_deliveries import AdminDirectSaleDeliveryNoteView
from api.v1.views.admin_deliveries import AdminDirectSaleDeliveryScheduleView
from api.v1.views.admin_navigation import AdminNavigationBadgesView

urlpatterns = [
    path("ai/", include("ai_assistant.urls")),
    path("dashboard/", AdminDashboardView.as_view()),
    path("dashboard/navigation-badges/", AdminNavigationBadgesView.as_view()),
    path("deliveries/", AdminDeliveryListCreateView.as_view()),
    path("deliveries/summary/", AdminDeliverySummaryView.as_view()),
    path("deliveries/sources/subscriptions/", AdminDeliverySourceSubscriptionsView.as_view()),
    path(
        "deliveries/sources/subscriptions/<int:subscription_id>/prefill/",
        AdminDeliverySourceSubscriptionPrefillView.as_view(),
    ),
    path("deliveries/sources/direct-sales/", AdminDeliverySourceDirectSalesView.as_view()),
    path(
        "deliveries/sources/direct-sales/<int:direct_sale_id>/prefill/",
        AdminDeliverySourceDirectSalePrefillView.as_view(),
    ),
    path("deliveries/<int:pk>/", AdminDeliveryDetailView.as_view()),
    path("deliveries/<int:pk>/pdf/", AdminDeliveryPdfView.as_view()),
    path("deliveries/<int:pk>/transition/", AdminDeliveryTransitionView.as_view()),
    path("deliveries/<int:pk>/mark-delivered/", AdminDeliveryMarkDeliveredView.as_view()),
    path("deliveries/<int:pk>/mark-failed/", AdminDeliveryMarkFailedView.as_view()),
    path("deliveries/<int:pk>/cancel/", AdminDeliveryCancelView.as_view()),
    path("deliveries/<int:pk>/request-return/", AdminDeliveryRequestReturnView.as_view()),
    path("deliveries/<int:pk>/mark-returned/", AdminDeliveryMarkReturnedView.as_view()),
    path("deliveries/direct-sale-cases/<int:case_id>/schedule/", AdminDirectSaleDeliveryScheduleView.as_view()),
    path("deliveries/direct-sale-cases/<int:case_id>/", AdminDirectSaleDeliveryDetailView.as_view()),
    path("deliveries/direct-sale-cases/<int:case_id>/metadata/", AdminDirectSaleDeliveryMetadataView.as_view()),
    path("deliveries/direct-sale-cases/<int:case_id>/dispatch/", AdminDirectSaleDeliveryDispatchView.as_view()),
    path(
        "deliveries/direct-sale-cases/<int:case_id>/mark-delivered/",
        AdminDirectSaleDeliveryMarkDeliveredView.as_view(),
    ),
    path("deliveries/direct-sale-cases/<int:case_id>/cancel/", AdminDirectSaleDeliveryCancelView.as_view()),
    path("deliveries/direct-sale-cases/<int:case_id>/note/", AdminDirectSaleDeliveryNoteView.as_view()),
    path(
        "deliveries/direct-sale-cases/<int:case_id>/approve-payment-exception/",
        AdminDirectSaleDeliveryApprovePaymentExceptionView.as_view(),
    ),
]
