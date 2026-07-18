"""CRM Pipeline API Views"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from subscriptions.models_crm_pipeline import CRMPipeline
from subscriptions.services.crm_approval_service import (
    approve_online_request,
    move_pipeline_stage,
    get_pipeline_metrics,
)


class CRMPipelineSerializer:
    """Simple serializer for CRM Pipeline"""

    @staticmethod
    def to_representation(obj):
        return {
            'id': obj.id,
            'lead': {
                'id': obj.lead.id if obj.lead else None,
                'customer_name': obj.lead.customer_name if obj.lead else None,
                'phone': obj.lead.customer_phone if obj.lead else None,
                'email': obj.lead.customer_email if obj.lead else None,
            },
            'current_stage': obj.current_stage,
            'request_type': obj.request_type,
            'quoted_amount': float(obj.quoted_amount),
            'revenue': float(obj.revenue),
            'probability': obj.probability,
            'approved_by': obj.approved_by.username if obj.approved_by else None,
            'approved_at': obj.approved_at.isoformat() if obj.approved_at else None,
            'converted_to': obj.converted_to,
            'expected_close_date': obj.expected_close_date.isoformat() if obj.expected_close_date else None,
            'created_at': obj.created_at.isoformat(),
            'updated_at': obj.updated_at.isoformat(),
            'is_approved': obj.is_approved,
            'is_converted': obj.is_converted,
            'days_in_pipeline': obj.days_in_pipeline,
        }


class CRMPipelineViewSet(viewsets.ModelViewSet):
    """CRM Pipeline management - lead tracking through sales funnel"""

    queryset = CRMPipeline.objects.select_related('lead', 'online_request', 'approved_by').order_by('-created_at')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['current_stage', 'request_type', 'approved_by']
    search_fields = ['lead__customer_name', 'lead__customer_phone']
    ordering_fields = ['created_at', 'quoted_amount', 'revenue', 'expected_close_date']

    def list(self, request, *args, **kwargs):
        """List all pipeline leads with filtering"""
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            data = [CRMPipelineSerializer.to_representation(obj) for obj in page]
            return self.get_paginated_response(data)

        data = [CRMPipelineSerializer.to_representation(obj) for obj in queryset]
        return Response(data)

    def retrieve(self, request, pk=None):
        """Get single pipeline lead"""
        try:
            obj = self.get_object()
            data = CRMPipelineSerializer.to_representation(obj)
            return Response(data)
        except CRMPipeline.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Approve lead for specific contract type.
        Auto-creates contract if auto_convert=True.

        POST /api/v1/crm/pipeline/{id}/approve/
        {
            "approval_type": "DIRECT_SALE",  // or SUBSCRIPTION, RENT, LEASE
            "auto_convert": true,
            "notes": "Approved by operator"
        }
        """
        try:
            pipeline = self.get_object()
            online_request = pipeline.online_request

            if not online_request:
                return Response(
                    {'error': 'No online request associated'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            approval_type = request.data.get('approval_type')
            auto_convert = request.data.get('auto_convert', True)
            notes = request.data.get('notes', '')

            if approval_type not in ['DIRECT_SALE', 'SUBSCRIPTION', 'RENT', 'LEASE']:
                return Response(
                    {'error': 'Invalid approval_type'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Approve and auto-create contract
            contract = approve_online_request(
                online_request=online_request,
                approval_type=approval_type,
                approval_user=request.user,
                auto_convert=auto_convert,
                notes=notes
            )

            # Refresh pipeline
            pipeline.refresh_from_db()
            data = CRMPipelineSerializer.to_representation(pipeline)

            return Response({
                'message': f'Lead approved as {approval_type}',
                'pipeline': data,
                'contract_created': contract is not None,
            })

        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def quote(self, request, pk=None):
        """
        Mark quote as sent to customer.
        Updates approval_status to QUOTED.
        """
        try:
            pipeline = self.get_object()
            online_request = pipeline.online_request

            if not online_request:
                return Response(
                    {'error': 'No online request associated'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            online_request.approval_status = 'QUOTED'
            online_request.save()

            pipeline.current_stage = 'QUOTED'
            pipeline.quoted_amount = float(online_request.total_amount or 0)
            pipeline.save()

            data = CRMPipelineSerializer.to_representation(pipeline)
            return Response({
                'message': 'Quote sent',
                'pipeline': data,
            })

        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['patch'])
    def stage(self, request, pk=None):
        """
        Move lead between pipeline stages (Kanban drag-drop).

        PATCH /api/v1/crm/pipeline/{id}/stage/
        {
            "stage": "QUOTED"  // or APPROVED, CONVERTED, etc.
        }
        """
        try:
            pipeline = self.get_object()
            new_stage = request.data.get('stage')

            if not new_stage:
                return Response(
                    {'error': 'stage is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            move_pipeline_stage(pipeline, new_stage)
            pipeline.save()

            data = CRMPipelineSerializer.to_representation(pipeline)
            return Response({
                'message': f'Moved to {new_stage}',
                'pipeline': data,
            })

        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'])
    def metrics(self, request):
        """
        Get CRM pipeline health metrics.

        GET /api/v1/crm/pipeline/metrics/?days=30
        """
        days = int(request.query_params.get('days', 30))
        metrics = get_pipeline_metrics(days=days)

        return Response({
            'period_days': days,
            'metrics': metrics,
        })

    @action(detail=False, methods=['get'])
    def funnel(self, request):
        """
        Get pipeline funnel visualization data.

        GET /api/v1/crm/pipeline/funnel/
        """
        from django.db.models import Count

        queryset = self.get_queryset()

        funnel_data = []
        stages = ['LEAD', 'ENQUIRY', 'QUOTED', 'APPROVED', 'CONVERTED']

        for stage in stages:
            count = queryset.filter(current_stage=stage).count()
            funnel_data.append({
                'stage': stage,
                'count': count,
            })

        return Response({
            'funnel': funnel_data,
        })
