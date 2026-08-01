"""
CRM Pipeline API Views
PublicLead → OnlineRequest → ProductRequest/SubscriptionRequest → Subscription/Sale
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db.models import Q
from django.utils import timezone

from subscriptions.models import PublicLead, OnlineRequest
from crm.services.crm_pipeline_service import (
    create_online_request_from_lead,
    convert_online_request_to_product_request,
    convert_online_request_to_subscription_request,
    mark_public_lead_converted,
    get_public_lead_conversion_history,
)
from api.v1.serializers.crm_pipeline import (
    PublicLeadListSerializer,
    PublicLeadDetailSerializer,
    PublicLeadCreateSerializer,
    ConvertPublicLeadSerializer,
    AcceptQuoteSerializer,
)
from api.v1.permissions import IsAdmin


class PublicLeadViewSet(viewsets.ModelViewSet):
    """
    Public Lead Management

    Public: POST to create lead (public form submission)
    Admin: GET/PATCH/DELETE for management
    """
    queryset = PublicLead.objects.all()

    def get_serializer_class(self):
        if self.action == 'create':
            return PublicLeadCreateSerializer
        elif self.action == 'retrieve':
            return PublicLeadDetailSerializer
        else:
            return PublicLeadListSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [AllowAny()]
        return [IsAuthenticated(), IsAdmin()]

    def get_queryset(self):
        """Filter by status and search"""
        qs = super().get_queryset()

        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        search = self.request.query_params.get('q')
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(phone__icontains=search)
                | Q(email__icontains=search)
            )

        return qs.order_by('-created_at')

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsAdmin])
    def convert_to_online_request(self, request, pk=None):
        """
        Admin converts PublicLead to OnlineRequest (quote workflow)

        Body:
        {
          "request_type": "ADVANCE_EMI",
          "unit_price": 50000,
          "preferred_tenure": 12
        }
        """
        public_lead = self.get_object()

        serializer = ConvertPublicLeadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            online_request = create_online_request_from_lead(
                public_lead=public_lead,
                request_type=serializer.validated_data['request_type'],
                quantity=serializer.validated_data.get('quantity', 1),
                preferred_tenure=serializer.validated_data.get('preferred_tenure'),
                preferred_lucky_number=serializer.validated_data.get('preferred_lucky_number'),
                unit_price=serializer.validated_data.get('unit_price'),
            )

            # Mark as contacted
            public_lead.contacted_at = timezone.now()
            public_lead.save(update_fields=['contacted_at'])

            return Response({
                'status': 'success',
                'message': 'PublicLead converted to OnlineRequest',
                'online_request_id': online_request.id,
                'online_request_number': online_request.request_number,
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({
                'status': 'error',
                'message': str(e),
            }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
    def conversion_history(self, request, pk=None):
        """Get complete conversion history of this PublicLead"""
        public_lead = self.get_object()

        history = get_public_lead_conversion_history(public_lead)

        return Response({
            'public_lead': PublicLeadDetailSerializer(public_lead).data,
            'stages': [
                {
                    'stage': 'PublicLead',
                    'object_id': public_lead.id,
                    'created_at': public_lead.created_at,
                },
                {
                    'stage': 'OnlineRequest',
                    'object_id': history['online_request'].id if history['online_request'] else None,
                    'created_at': history['online_request'].created_at if history['online_request'] else None,
                    'status': history['online_request'].status if history['online_request'] else None,
                },
                {
                    'stage': 'ProductRequest',
                    'object_id': history['product_request'].id if history['product_request'] else None,
                    'created_at': history['product_request'].created_at if history['product_request'] else None,
                    'status': history['product_request'].status if history['product_request'] else None,
                },
                {
                    'stage': 'SubscriptionRequest',
                    'object_id': history['subscription_request'].id if history['subscription_request'] else None,
                    'created_at': history['subscription_request'].created_at if history['subscription_request'] else None,
                    'status': history['subscription_request'].status if history['subscription_request'] else None,
                },
                {
                    'stage': 'Subscription',
                    'object_id': history['subscription'].id if history['subscription'] else None,
                    'created_at': history['subscription'].created_at if history['subscription'] else None,
                    'status': history['subscription'].status if history['subscription'] else None,
                },
            ],
        })


class OnlineRequestToProductRequestViewSet(viewsets.ViewSet):
    """
    Convert OnlineRequest to ProductRequest/SubscriptionRequest when quote is accepted
    """
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['post'], url_path='accept-quote')
    def accept_quote(self, request, online_request_id=None):
        """
        Accept OnlineRequest quote → Convert to ProductRequest or SubscriptionRequest

        Body:
        {
          "request_target_type": "product_request",  # or "subscription_request"
          "batch_id": 5  # Required if subscription_request
        }
        """
        try:
            online_request = OnlineRequest.objects.get(id=online_request_id)
        except OnlineRequest.DoesNotExist:
            return Response({'error': 'OnlineRequest not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = AcceptQuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_type = serializer.validated_data['request_target_type']

        try:
            if target_type == 'product_request':
                product_request = convert_online_request_to_product_request(
                    online_request=online_request,
                    requester_user=request.user,
                    requester_role='CUSTOMER' if hasattr(request.user, 'customer') else 'ADMIN',
                )
                return Response({
                    'status': 'success',
                    'message': 'OnlineRequest converted to ProductRequest',
                    'product_request_id': product_request.id,
                }, status=status.HTTP_201_CREATED)

            elif target_type == 'subscription_request':
                batch_id = serializer.validated_data.get('batch_id')
                if not batch_id:
                    return Response({
                        'error': 'batch_id is required for subscription_request'
                    }, status=status.HTTP_400_BAD_REQUEST)

                from subscriptions.models import Batch
                try:
                    batch = Batch.objects.get(id=batch_id)
                except Batch.DoesNotExist:
                    return Response({'error': 'Batch not found'}, status=status.HTTP_404_NOT_FOUND)

                subscription_request = convert_online_request_to_subscription_request(
                    online_request=online_request,
                    requester_user=request.user,
                    requester_role='CUSTOMER' if hasattr(request.user, 'customer') else 'ADMIN',
                    batch=batch,
                )
                return Response({
                    'status': 'success',
                    'message': 'OnlineRequest converted to SubscriptionRequest',
                    'subscription_request_id': subscription_request.id,
                }, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({
                'status': 'error',
                'message': str(e),
            }, status=status.HTTP_400_BAD_REQUEST)
