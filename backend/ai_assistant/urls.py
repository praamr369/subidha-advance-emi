from django.urls import path

from ai_assistant.views import (
    AIBIExplainView,
    AIAssistantReadinessView,
    AIAssistantHealthView,
    AIAssistantQueryView,
    AIFeedbackView,
    AIKnowledgeSourceChunkListView,
    AIKnowledgeSourceDetailView,
    AIKnowledgeSourceIngestView,
    AIKnowledgeSourceListCreateView,
    AIQueryLogListView,
)


app_name = "ai_assistant"

urlpatterns = [
    path("health/", AIAssistantHealthView.as_view(), name="health"),
    path("sources/", AIKnowledgeSourceListCreateView.as_view(), name="sources"),
    path("sources/<int:source_id>/", AIKnowledgeSourceDetailView.as_view(), name="source-detail"),
    path("sources/<int:source_id>/ingest/", AIKnowledgeSourceIngestView.as_view(), name="source-ingest"),
    path("sources/<int:source_id>/chunks/", AIKnowledgeSourceChunkListView.as_view(), name="source-chunks"),
    path("query/", AIAssistantQueryView.as_view(), name="query"),
    path("bi-explain/", AIBIExplainView.as_view(), name="bi-explain"),
    path("readiness/", AIAssistantReadinessView.as_view(), name="readiness"),
    path("query-log/", AIQueryLogListView.as_view(), name="query-log"),
    path("feedback/", AIFeedbackView.as_view(), name="feedback"),
]
