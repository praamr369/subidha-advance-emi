from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from subscriptions.models import Product, ProductCategoryMaster
from api.v1.serializers.public import PublicProductSerializer, PublicProductCategorySerializer

class PublicProductListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    queryset = Product.objects.filter(is_active=True, pim__is_published=True).prefetch_related('pim')
    serializer_class = PublicProductSerializer

class PublicProductDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    queryset = Product.objects.filter(is_active=True, pim__is_published=True).prefetch_related('pim')
    serializer_class = PublicProductSerializer
    lookup_field = 'id'