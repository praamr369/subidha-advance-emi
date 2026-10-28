from django.urls import path

from api.v1.views.crm import (
    CrmOverviewView,
    PartyDirectoryDetailView,
    PartyDirectoryListView,
    PartyInteractionCreateView,
    PartyInteractionStatusUpdateView,
    PartyResolveView,
)
from api.v1.views.party_archive import AdminCrmPartyArchiveView

urlpatterns = [
    path("overview/", CrmOverviewView.as_view()),
    path("parties/", PartyDirectoryListView.as_view()),
    path("parties/resolve/", PartyResolveView.as_view()),
    path("parties/<int:pk>/", PartyDirectoryDetailView.as_view()),
    path("parties/<int:pk>/archive/", AdminCrmPartyArchiveView.as_view()),
    path("parties/<int:pk>/interactions/", PartyInteractionCreateView.as_view()),
    path("interactions/<int:pk>/status/", PartyInteractionStatusUpdateView.as_view()),
]
