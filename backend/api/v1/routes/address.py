from django.urls import path
from api.v1.views.address import (
    CustomerAddressListView,
    CustomerAddressDetailView,
    PincodeDetailView,
    SetPrimaryAddressView,
    VendorAvailabilityView,
    VendorsForAreaView,
)

urlpatterns = [
    # Customer address management
    path('customer/addresses/', CustomerAddressListView.as_view(), name='customer-address-list'),
    path('customer/addresses/<int:pk>/', CustomerAddressDetailView.as_view(), name='customer-address-detail'),
    path('customer/addresses/<int:pk>/set-primary/', SetPrimaryAddressView.as_view(), name='set-primary-address'),
    
    # Pincode lookup
    path('pincode/<str:postal_code>/details/', PincodeDetailView.as_view(), name='pincode-details'),
    
    # Vendor availability
    path('vendors/<int:vendor_id>/availability/<str:postal_code>/', VendorAvailabilityView.as_view(), name='vendor-availability'),
    path('vendors/by-postal-code/<str:postal_code>/', VendorsForAreaView.as_view(), name='vendors-for-area'),
]
