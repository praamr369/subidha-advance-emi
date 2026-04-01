from rest_framework import generics
from rest_framework.permissions import AllowAny
from subscriptions.models import Product
from api.v1.serializers.public import PublicProductSerializer

class PublicProductListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    queryset = Product.objects.filter(is_active=True)
    serializer_class = PublicProductSerializer

class PublicProductDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    queryset = Product.objects.filter(is_active=True)
    serializer_class = PublicProductSerializer
    lookup_field = 'id'