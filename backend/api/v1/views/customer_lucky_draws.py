"""
Customer-facing Lucky Draws API Views
Allows customers to view their lucky draw participation history and certificate
"""
from django.db.models import Q, Prefetch
from rest_framework import generics, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from api.permissions import IsCustomer
from subscriptions.models import LuckyDraw, Emi
from api.v1.serializers.lucky_draw import LuckyDrawReadSerializer


class CustomerLuckyDrawListView(generics.ListAPIView):
    """
    GET /api/v1/customer/lucky-draws/

    List customer's lucky draw participation history
    Filters by status, batch, and date range
    """
    serializer_class = LuckyDrawReadSerializer
    permission_classes = [IsCustomer]
    filterset_fields = ['status', 'batch_id', 'draw_date']
    ordering_fields = ['draw_date', 'created_at']
    ordering = ['-draw_date']

    def get_queryset(self):
        """
        Get all lucky draws where this customer has EMIs
        """
        customer = self.request.user.customer
        return LuckyDraw.objects.filter(
            emis__subscription__customer=customer
        ).distinct().select_related(
            'batch'
        ).prefetch_related(
            Prefetch('emis', queryset=Emi.objects.filter(subscription__customer=customer))
        )


class CustomerLuckyDrawDetailView(generics.RetrieveAPIView):
    """
    GET /api/v1/customer/lucky-draws/<id>/

    Get details of a specific lucky draw for the customer
    Includes verification hash and waiver details
    """
    serializer_class = LuckyDrawReadSerializer
    permission_classes = [IsCustomer]

    def get_queryset(self):
        """
        Only allow customer to view their own lucky draws
        """
        customer = self.request.user.customer
        return LuckyDraw.objects.filter(
            emis__subscription__customer=customer
        ).select_related(
            'batch'
        ).prefetch_related(
            Prefetch('emis', queryset=Emi.objects.filter(subscription__customer=customer))
        ).distinct()


@api_view(['GET'])
def customer_lucky_draw_certificate_view(request, pk):
    """
    GET /api/v1/customer/lucky-draws/<id>/certificate/

    Generate PDF certificate for won lucky draw
    Only available for completed/won draws
    """
    customer = getattr(request.user, 'customer', None)
    if not customer:
        return Response(
            {'detail': 'Customer profile required'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        draw = LuckyDraw.objects.get(
            pk=pk,
            emis__subscription__customer=customer,
            status='COMPLETED'
        )
    except LuckyDraw.DoesNotExist:
        return Response(
            {'detail': 'Draw not found or not eligible for certificate'},
            status=status.HTTP_404_NOT_FOUND
        )

    # Generate certificate PDF
    # This would typically use a PDF generation library like reportlab or weasyprint
    # For now, return a placeholder response
    return Response({
        'draw_id': draw.id,
        'customer': customer.id,
        'draw_date': draw.draw_date,
        'batch': draw.batch_id,
        'winner_status': draw.winner_status,
        'certificate_url': f'/api/v1/customer/lucky-draws/{pk}/certificate/pdf/',
        'message': 'Certificate ready for download'
    })
