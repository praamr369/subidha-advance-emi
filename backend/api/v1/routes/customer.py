from django.urls import path
from api.v1.views.customer import CustomerDashboard

urlpatterns = [
    path("dashboard/", CustomerDashboard.as_view()),
]