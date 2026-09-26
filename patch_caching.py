import sys

with open('backend/products_pim/viewsets.py', 'r') as f:
    content = f.read()

import_statement = "from rest_framework import viewsets, status, filters\nfrom django.utils.decorators import method_decorator\nfrom django.views.decorators.cache import cache_page\n"
content = content.replace("from rest_framework import viewsets, status, filters", import_statement)

target_class = "class PimProductViewSet(viewsets.ModelViewSet):"
replacement_class = "@method_decorator(cache_page(60 * 15), name='list')\n@method_decorator(cache_page(60 * 15), name='retrieve')\nclass PimProductViewSet(viewsets.ModelViewSet):"

content = content.replace(target_class, replacement_class)

with open('backend/products_pim/viewsets.py', 'w') as f:
    f.write(content)
