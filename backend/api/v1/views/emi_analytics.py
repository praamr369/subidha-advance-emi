from django.db.models import Sum, Count
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from subscriptions.models import Batch, Emi


class BatchAnalyticsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, batch_id):
        batch = Batch.objects.get(pk=batch_id)

        total_emis = Emi.objects.filter(
            subscription__batch=batch
        ).count()

        total_collected = Emi.objects.filter(
            subscription__batch=batch,
            status="PAID"
        ).aggregate(total=Sum("amount"))["total"] or 0

        pending_count = Emi.objects.filter(
            subscription__batch=batch,
            status="PENDING"
        ).count()

        return Response({
            "batch_id": batch_id,
            "total_emis": total_emis,
            "total_collected": total_collected,
            "pending_emis": pending_count,
        })