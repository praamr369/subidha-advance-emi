from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from api.v1.serializers.payment import PaymentSerializer
from subscriptions.models import Payment


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only payment visibility endpoint.

    Enterprise rule:
    - No generic payment create/update/delete from this route.
    - All payment mutations must go through subscriptions.services.payment_service.
    """

    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]

    queryset = (
        Payment.objects.select_related(
            "customer",
            "subscription",
            "subscription__product",
            "subscription__lucky_id",
            "subscription__partner",
            "emi",
            "collected_by",
            "verified_by",
        )
        .all()
        .order_by("-payment_date", "-id")
    )

    def get_queryset(self):
        user = self.request.user
        role = getattr(user, "role", "")

        if user.is_superuser or role == "ADMIN":
            return self.queryset

        if role == "PARTNER":
            return self.queryset.filter(subscription__partner=user)

        if role == "CUSTOMER":
            customer_profile = getattr(user, "customer_profile", None)
            if customer_profile is None:
                return self.queryset.none()
            return self.queryset.filter(customer=customer_profile)

        return self.queryset.none()