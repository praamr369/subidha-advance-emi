from django.urls import path
from api.v1.views.winner_views import ExecuteWinnerView

urlpatterns = [
    path("execute-winner/", ExecuteWinnerView.as_view()),
]