from django.db.models import Sum
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.generics import ListAPIView

from subscriptions.models import Commission, Subscription, Emi
from api.v1.serializers import CommissionSerializer


class PartnerDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        partner = request.user

        total_customers = Subscription.objects.filter(
            partner=partner
        ).values("customer").distinct().count()

        total_commission = Commission.objects.filter(
            partner=partner
        ).aggregate(total=Sum("commission_amount"))["total"] or 0

        pending_commission = Commission.objects.filter(
            partner=partner,
            status="PENDING"
        ).aggregate(total=Sum("commission_amount"))["total"] or 0

        paid_commission = Commission.objects.filter(
            partner=partner,
            status="PAID"
        ).aggregate(total=Sum("commission_amount"))["total"] or 0

        total_emis_paid = Emi.objects.filter(
            subscription__partner=partner,
            status="PAID"
        ).count()

        return Response({
            "total_customers": total_customers,
            "total_emis_paid": total_emis_paid,
            "total_commission": total_commission,
            "pending_commission": pending_commission,
            "paid_commission": paid_commission,
        })


class PartnerCommissionListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CommissionSerializer

    def get_queryset(self):
        return Commission.objects.filter(
            partner=self.request.user
        ).order_by("-created_at")