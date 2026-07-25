"""
Lead Subscription Tracker - Track lead conversions across all subscription types
Handles: EMI, RENT, LEASE subscriptions and Direct Sales
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db import transaction
from django.shortcuts import get_object_or_404

from subscriptions.models import Customer, PublicLead, Subscription
from billing.models import DirectSale
from api.v1.permissions import IsAdmin


class LeadSubscriptionTrackerView(APIView):
    """Track lead conversions by subscription type"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, customer_id):
        """Get all subscriptions and sales for a customer linked to their leads"""
        try:
            customer = get_object_or_404(Customer, id=customer_id)

            # Find all leads linked to this customer
            leads = PublicLead.objects.filter(converted_customer=customer)

            # Get all subscription types for customer
            emi_subscriptions = Subscription.objects.filter(
                customer=customer,
                plan_type="EMI"
            )
            rent_subscriptions = Subscription.objects.filter(
                customer=customer,
                plan_type="RENT"
            )
            lease_subscriptions = Subscription.objects.filter(
                customer=customer,
                plan_type="LEASE"
            )
            direct_sales = DirectSale.objects.filter(customer=customer)

            # Build comprehensive response
            return Response({
                "status": "success",
                "data": {
                    "customer": {
                        "id": customer.id,
                        "name": customer.name,
                        "phone": customer.phone,
                        "email": customer.user.email if customer.user else None,
                        "kyc_status": customer.kyc_status,
                    },
                    "leads": [
                        {
                            "id": lead.id,
                            "status": lead.status,
                            "source": lead.source,
                            "created_at": lead.created_at.isoformat(),
                        }
                        for lead in leads
                    ],
                    "subscriptions": {
                        "emi": [
                            {
                                "id": sub.id,
                                "amount": str(sub.grand_total) if sub.grand_total else "0",
                                "status": sub.status,
                                "created_at": sub.created_at.isoformat(),
                                "plan_type": "EMI",
                            }
                            for sub in emi_subscriptions
                        ],
                        "rent": [
                            {
                                "id": sub.id,
                                "amount": str(sub.grand_total) if sub.grand_total else "0",
                                "status": sub.status,
                                "created_at": sub.created_at.isoformat(),
                                "plan_type": "RENT",
                            }
                            for sub in rent_subscriptions
                        ],
                        "lease": [
                            {
                                "id": sub.id,
                                "amount": str(sub.grand_total) if sub.grand_total else "0",
                                "status": sub.status,
                                "created_at": sub.created_at.isoformat(),
                                "plan_type": "LEASE",
                            }
                            for sub in lease_subscriptions
                        ],
                    },
                    "direct_sales": [
                        {
                            "id": sale.id,
                            "amount": str(sale.grand_total) if sale.grand_total else "0",
                            "status": sale.status,
                            "created_at": sale.created_at.isoformat(),
                        }
                        for sale in direct_sales
                    ],
                    "summary": {
                        "total_emi_active": emi_subscriptions.filter(status="ACTIVE").count(),
                        "total_rent_active": rent_subscriptions.filter(status="ACTIVE").count(),
                        "total_lease_active": lease_subscriptions.filter(status="ACTIVE").count(),
                        "total_direct_sales": direct_sales.count(),
                        "total_revenue": str(
                            sum([s.grand_total or 0 for s in emi_subscriptions] +
                                [s.grand_total or 0 for s in rent_subscriptions] +
                                [s.grand_total or 0 for s in lease_subscriptions] +
                                [s.grand_total or 0 for s in direct_sales])
                        ),
                    }
                }
            })
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class LeadConversionTypeView(APIView):
    """Track what subscription type a lead converted to"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, lead_id):
        """Get conversion type for a specific lead"""
        try:
            lead = get_object_or_404(PublicLead, id=lead_id)

            if not lead.converted_customer:
                return Response({
                    "status": "success",
                    "data": {
                        "lead_id": lead.id,
                        "lead_status": lead.status,
                        "conversion_type": None,
                        "message": "Lead not yet converted to customer",
                    }
                })

            customer = lead.converted_customer

            # Check what the customer converted to
            emi_subs = Subscription.objects.filter(
                customer=customer,
                plan_type="EMI"
            ).exists()
            rent_subs = Subscription.objects.filter(
                customer=customer,
                plan_type="RENT"
            ).exists()
            lease_subs = Subscription.objects.filter(
                customer=customer,
                plan_type="LEASE"
            ).exists()
            direct_sale = DirectSale.objects.filter(customer=customer).exists()

            # Determine primary conversion type
            conversion_type = None
            if direct_sale:
                conversion_type = "DIRECT_SALE"
            elif emi_subs:
                conversion_type = "EMI"
            elif rent_subs:
                conversion_type = "RENT"
            elif lease_subs:
                conversion_type = "LEASE"

            return Response({
                "status": "success",
                "data": {
                    "lead_id": lead.id,
                    "lead_status": lead.status,
                    "customer_id": customer.id,
                    "customer_name": customer.name,
                    "conversion_type": conversion_type,
                    "conversions": {
                        "emi": emi_subs,
                        "rent": rent_subs,
                        "lease": lease_subs,
                        "direct_sale": direct_sale,
                    },
                }
            })
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# URL Configuration
from django.urls import path

urlpatterns = [
    path(
        'admin/lead-tracker/customer/<int:customer_id>/subscriptions/',
        LeadSubscriptionTrackerView.as_view(),
        name='lead-subscription-tracker'
    ),
    path(
        'admin/lead-tracker/lead/<int:lead_id>/conversion-type/',
        LeadConversionTypeView.as_view(),
        name='lead-conversion-type'
    ),
]
