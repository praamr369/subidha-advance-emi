from django.urls import include, path
from rest_framework.routers import DefaultRouter

from api.v1.views.reminders import PaymentReminderRunView, PaymentReminderViewSet

router = DefaultRouter()
router.register(r"", PaymentReminderViewSet, basename="payment-reminders")

urlpatterns = [
    path("run/", PaymentReminderRunView.as_view()),
    path("payment-reminders/", include(router.urls)),
    path("", include(router.urls)),
]
