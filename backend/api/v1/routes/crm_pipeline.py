"""CRM Pipeline routes"""

from django.urls import path
from api.v1.crm_pipeline import CRMPipelineViewSet

urlpatterns = [
    # List all pipelines
    path('pipeline/', CRMPipelineViewSet.as_view({
        'get': 'list',
        'post': 'create',
    }), name='crm-pipeline-list'),

    # Retrieve single pipeline
    path('pipeline/<int:pk>/', CRMPipelineViewSet.as_view({
        'get': 'retrieve',
        'put': 'update',
        'patch': 'partial_update',
        'delete': 'destroy',
    }), name='crm-pipeline-detail'),

    # Approve lead
    path('pipeline/<int:pk>/approve/', CRMPipelineViewSet.as_view({
        'post': 'approve',
    }), name='crm-pipeline-approve'),

    # Send quote
    path('pipeline/<int:pk>/quote/', CRMPipelineViewSet.as_view({
        'post': 'quote',
    }), name='crm-pipeline-quote'),

    # Move stage (Kanban drag-drop)
    path('pipeline/<int:pk>/stage/', CRMPipelineViewSet.as_view({
        'patch': 'stage',
    }), name='crm-pipeline-stage'),

    # Pipeline metrics
    path('pipeline/metrics/', CRMPipelineViewSet.as_view({
        'get': 'metrics',
    }), name='crm-pipeline-metrics'),

    # Pipeline funnel
    path('pipeline/funnel/', CRMPipelineViewSet.as_view({
        'get': 'funnel',
    }), name='crm-pipeline-funnel'),

    # Pipeline analytics
    path('pipeline/analytics/', CRMPipelineViewSet.as_view({
        'get': 'analytics',
    }), name='crm-pipeline-analytics'),
]
