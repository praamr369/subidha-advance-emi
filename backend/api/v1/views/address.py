from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.core.exceptions import ValidationError
from django.db import transaction

from api.v1.serializers.address import (
    AddressListSerializer, AddressDetailSerializer, AddressCreateSerializer,
    PincodeDetailSerializer, PincodeSerializer, VendorAvailabilitySerializer
)
from api.v1.permissions import IsCustomer, IsAdmin
from subscriptions.models import Address, Customer, PincodeDatabase
from subscriptions.services.address_service import (
    lookup_pincode, create_address, check_service_availability,
    find_vendors_for_area, set_primary_address
)

class CustomerAddressListView(APIView):
    """List and create customer addresses"""
    permission_classes = [IsAuthenticated, IsCustomer]
    
    def get(self, request):
        try:
            customer = Customer.objects.get(user=request.user)
        except Customer.DoesNotExist:
            return Response(
                {"detail": "Customer profile not found."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        addresses = customer.addresses.all()
        serializer = AddressListSerializer(addresses, many=True)
        return Response(serializer.data)
    
    @transaction.atomic
    def post(self, request):
        try:
            customer = Customer.objects.get(user=request.user)
        except Customer.DoesNotExist:
            return Response(
                {"detail": "Customer profile not found."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = AddressCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            address = create_address(customer, **serializer.validated_data)
            response_serializer = AddressDetailSerializer(address)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response(e.message_dict, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

class CustomerAddressDetailView(APIView):
    """Retrieve, update, delete customer address"""
    permission_classes = [IsAuthenticated, IsCustomer]
    
    def get_address(self, request, pk):
        try:
            customer = Customer.objects.get(user=request.user)
            return customer.addresses.get(id=pk)
        except Customer.DoesNotExist:
            return None
        except Address.DoesNotExist:
            return None
    
    def get(self, request, pk):
        address = self.get_address(request, pk)
        if not address:
            return Response(
                {"detail": "Address not found."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = AddressDetailSerializer(address)
        return Response(serializer.data)
    
    @transaction.atomic
    def patch(self, request, pk):
        address = self.get_address(request, pk)
        if not address:
            return Response(
                {"detail": "Address not found."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = AddressCreateSerializer(address, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        response_serializer = AddressDetailSerializer(address)
        return Response(response_serializer.data)
    
    @transaction.atomic
    def delete(self, request, pk):
        address = self.get_address(request, pk)
        if not address:
            return Response(
                {"detail": "Address not found."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Don't allow deleting primary address
        if address.is_primary:
            return Response(
                {"detail": "Cannot delete primary address."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        address.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class PincodeDetailView(APIView):
    """Get pincode details (city, state, district)"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request, postal_code):
        try:
            pincode_data = lookup_pincode(postal_code)
            try:
                pincode_obj = PincodeDatabase.objects.get(postal_code=postal_code)
                serializer = PincodeDetailSerializer(pincode_obj)
                return Response(serializer.data)
            except PincodeDatabase.DoesNotExist:
                return Response(pincode_data)
        except ValidationError as e:
            return Response(
                {"detail": e.messages[0] if e.messages else str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

class SetPrimaryAddressView(APIView):
    """Set a specific address as primary"""
    permission_classes = [IsAuthenticated, IsCustomer]
    
    @transaction.atomic
    def post(self, request, pk):
        try:
            customer = Customer.objects.get(user=request.user)
        except Customer.DoesNotExist:
            return Response(
                {"detail": "Customer profile not found."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            set_primary_address(customer, pk)
            address = customer.addresses.get(id=pk)
            serializer = AddressDetailSerializer(address)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                e.message_dict if hasattr(e, 'message_dict') else {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

class VendorAvailabilityView(APIView):
    """Check if vendor can serve a postal code"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request, vendor_id, postal_code):
        try:
            availability = check_service_availability(vendor_id, postal_code)
            serializer = VendorAvailabilitySerializer(availability)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {"detail": e.messages[0] if e.messages else str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

class VendorsForAreaView(APIView):
    """Find all vendors who serve a specific postal code"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request, postal_code):
        try:
            vendors = find_vendors_for_area(postal_code)
            return Response({
                "postal_code": postal_code,
                "vendors": vendors,
                "count": len(vendors)
            })
        except ValidationError as e:
            return Response(
                {"detail": e.messages[0] if e.messages else str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
