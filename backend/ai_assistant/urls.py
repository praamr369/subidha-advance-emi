from django.urls import path

from ai_assistant.views import (
    AIAssistantHealthView,
    AIAssistantQueryView,
    AIKnowledgeSourceListCreateView,
)


app_name = "ai_assistant"

urlpatterns = [
    path("health/", AIAssistantHealthView.as_view(), name="health"),
    path("sources/", AIKnowledgeSourceListCreateView.as_view(), name="sources"),
    path("query/", AIAssistantQueryView.as_view(), name="query"),
]
