# api/views/payment.py

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from subscriptions.models import Payment, PaymentStatus

class PaymentViewSet(viewsets.ModelViewSet):

    queryset = Payment.objects.all()
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        # Admin sees all
        if user.is_superuser:
            return Payment.objects.all()

        # Partner sees only their own
        if user.groups.filter(name="partner").exists():
            return Payment.objects.filter(collected_by=user)

        return Payment.objects.none()
    
    def update(self, request, *args, **kwargs):
        payment = self.get_object()

        # Only allow editing pending payments
        if payment.status != PaymentStatus.PENDING:
            return Response(
                {"error": "Cannot modify verified payment"},
                status=400
            )

        # Partner can only edit own payments
        if request.user.groups.filter(name="partner").exists():
            if payment.collected_by != request.user:
                return Response(
                    {"error": "You can only modify your own payments"},
                    status=403
                )

        return super().update(request, *args, **kwargs)
    
    def destroy(self, request, *args, **kwargs):
        payment = self.get_object()

        if payment.status != PaymentStatus.PENDING:
            return Response(
                {"error": "Cannot delete verified payment"},
                status=400
            )

        if request.user.groups.filter(name="partner").exists():
            if payment.collected_by != request.user:
                return Response(
                    {"error": "You can only delete your own payments"},
                    status=403
                )

        return super().destroy(request, *args, **kwargs)