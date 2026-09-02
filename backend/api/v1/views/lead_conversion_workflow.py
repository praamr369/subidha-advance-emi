"""
Lead Conversion Workflow API
Complete lead → customer → fulfillment workflow
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from decimal import Decimal

from crm.services.lead_conversion_service import LeadConversionService, LeadConversionError
from api.v1.permissions import IsAdmin


class ProcessOnlineEnquiryView(APIView):
    """Convert online enquiry to customer + lead link"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        """
        Process online enquiry and link to lead/customer

        Request body:
        {
            "phone": "9000090000",
            "email": "customer@example.com",
            "name": "Amrita Roy",
            "product_name": "Sofa Set",
            "amount": "50000",
            "request_number": "ONL-001"
        }
        """
        try:
            phone = request.data.get("phone", "").strip()
            email = request.data.get("email", "").strip()
            name = request.data.get("name", "").strip()
            product_name = request.data.get("product_name", "")
            amount = request.data.get("amount")
            request_number = request.data.get("request_number")

            if not phone or not name:
                return Response(
                    {"error": "Phone and name are required"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Process enquiry
            online_request, customer, lead, created_customer = LeadConversionService.process_online_enquiry(
                phone=phone,
                email=email,
                name=name,
                product_name=product_name,
                amount=amount,
                request_number=request_number,
            )

            return Response({
                "status": "success",
                "message": "Online enquiry processed successfully",
                "data": {
                    "online_request": {
                        "id": online_request.id,
                        "request_number": online_request.request_number,
                        "status": online_request.status,
                    },
                    "customer": {
                        "id": customer.id,
                        "name": customer.name,
                        "phone": customer.phone,
                        "created": created_customer,
                    },
                    "lead": {
                        "id": lead.id,
                        "name": lead.name,
                        "status": lead.status,
                        "phone": lead.phone,
                    },
                    "customer_created": created_customer,
                }
            })

        except LeadConversionError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ProcessDirectSaleView(APIView):
    """
    Raise a direct-sale request for a lead, pending approval.

    Does not book a sale. Approving the resulting OnlineRequest is what issues
    the numbered DirectSale document.
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        """
        Raise a direct-sale request and link it to the lead/customer

        Request body:
        {
            "phone": "9000090000",
            "email": "customer@example.com",
            "name": "Amrita Roy",
            "product_name": "Bed Frame",
            "amount": "75000"
        }
        """
        try:
            phone = request.data.get("phone", "").strip()
            email = request.data.get("email", "").strip()
            name = request.data.get("name", "").strip()
            product_name = request.data.get("product_name", "")
            amount = request.data.get("amount")

            if not phone or not name:
                return Response(
                    {"error": "Phone and name are required"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Raise a direct-sale request. Approving it is what issues the
            # numbered sale document.
            online_request, customer, lead, created_customer = LeadConversionService.process_direct_sale(
                phone=phone,
                email=email,
                name=name,
                product_name=product_name,
                amount=amount,
                created_by=request.user,
            )

            return Response({
                "status": "success",
                "message": "Direct sale request raised and is awaiting approval",
                "data": {
                    "online_request": {
                        "id": online_request.id,
                        "request_number": online_request.request_number,
                        "amount": str(online_request.total_amount),
                        "status": online_request.status,
                        "awaiting_approval": True,
                    },
                    "customer": {
                        "id": customer.id,
                        "name": customer.name,
                        "phone": customer.phone,
                        "created": created_customer,
                    },
                    "lead": {
                        "id": lead.id,
                        "name": lead.name,
                        "status": lead.status,
                        "phone": lead.phone,
                    },
                    "customer_created": created_customer,
                }
            })

        except LeadConversionError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class LeadConversionJourneyView(APIView):
    """Get complete lead conversion journey"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        """
        Get lead conversion journey by phone/email/name

        Query params:
        ?phone=9000090000
        or
        ?email=customer@example.com
        or
        ?name=Amrita+Roy
        """
        try:
            phone = request.query_params.get("phone", "").strip()
            email = request.query_params.get("email", "").strip()
            name = request.query_params.get("name", "").strip()

            if not (phone or email or name):
                return Response(
                    {"error": "Provide phone, email, or name"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            summary = LeadConversionService.get_lead_summary(
                phone=phone,
                email=email,
                name=name
            )

            if not summary:
                return Response({
                    "status": "not_found",
                    "message": "Lead not found",
                    "data": None
                })

            return Response({
                "status": "success",
                "data": summary
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
        'admin/lead-workflow/online-enquiry/',
        ProcessOnlineEnquiryView.as_view(),
        name='process-online-enquiry'
    ),
    path(
        'admin/lead-workflow/direct-sale/',
        ProcessDirectSaleView.as_view(),
        name='process-direct-sale'
    ),
    path(
        'admin/lead-workflow/journey/',
        LeadConversionJourneyView.as_view(),
        name='lead-conversion-journey'
    ),
]
