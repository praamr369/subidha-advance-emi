from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """Standard pagination for all list endpoints"""
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class LargeResultsSetPagination(PageNumberPagination):
    """Larger pagination for high-volume lists"""
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class SmallResultsSetPagination(PageNumberPagination):
    """Smaller pagination for detail pages"""
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 50
