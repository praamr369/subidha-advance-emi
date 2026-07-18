from __future__ import annotations

from datetime import datetime, timedelta
from django.db.models import Count, Q, Sum, Avg
from django.utils import timezone
from decimal import Decimal

from subscriptions.models import PublicLead, Subscription, ProductRequest
from subscriptions.models_online_request import OnlineRequest
from billing.models import DirectSale
from requests.models import SubscriptionRequest


def get_date_range(days: int = 30) -> tuple[datetime, datetime]:
    """Get date range for analytics (last N days)"""
    end_date = timezone.now()
    start_date = end_date - timedelta(days=days)
    return start_date, end_date


def get_funnel_analytics(days: int = 30) -> dict:
    """Get CRM funnel: Leads → Requests → Subscriptions"""
    start_date, end_date = get_date_range(days)

    # Leads created
    leads_total = PublicLead.objects.filter(
        created_at__range=[start_date, end_date]
    ).count()

    # Leads contacted (has online request)
    leads_contacted = PublicLead.objects.filter(
        created_at__range=[start_date, end_date],
        converted_online_request__isnull=False
    ).count()

    # Online requests created
    requests_total = OnlineRequest.objects.filter(
        created_at__range=[start_date, end_date]
    ).count()

    # Requests quoted (quote sent)
    requests_quoted = OnlineRequest.objects.filter(
        created_at__range=[start_date, end_date],
        status__in=['QUOTE_SENT', 'QUOTE_ACCEPTED', 'APPROVED', 'COMPLETED']
    ).count()

    # Requests accepted (quote accepted)
    requests_accepted = OnlineRequest.objects.filter(
        created_at__range=[start_date, end_date],
        status__in=['QUOTE_ACCEPTED', 'APPROVED', 'COMPLETED']
    ).count()

    # Requests approved
    requests_approved = OnlineRequest.objects.filter(
        created_at__range=[start_date, end_date],
        status__in=['APPROVED', 'COMPLETED']
    ).count()

    # Subscriptions created from approved requests
    subscriptions_created = Subscription.objects.filter(
        created_at__range=[start_date, end_date],
        source_online_request__isnull=False
    ).count()

    # Direct sales from approved requests (via OnlineRequest.approved_direct_sale FK)
    direct_sales_created = OnlineRequest.objects.filter(
        approved_at__range=[start_date, end_date],
        approved_direct_sale__isnull=False
    ).count()

    # Calculate percentages
    def pct(numerator, denominator):
        return round((numerator / denominator * 100), 1) if denominator > 0 else 0

    return {
        'period_days': days,
        'funnel': {
            'leads_created': leads_total,
            'leads_contacted': leads_contacted,
            'leads_contacted_pct': pct(leads_contacted, leads_total),
            'requests_created': requests_total,
            'requests_quoted': requests_quoted,
            'requests_quoted_pct': pct(requests_quoted, requests_total),
            'requests_accepted': requests_accepted,
            'requests_accepted_pct': pct(requests_accepted, requests_quoted),
            'requests_approved': requests_approved,
            'requests_approved_pct': pct(requests_approved, requests_accepted),
            'subscriptions_created': subscriptions_created,
            'direct_sales_created': direct_sales_created,
            'total_conversions': subscriptions_created + direct_sales_created,
            'conversion_rate_lead_to_sale': pct(subscriptions_created + direct_sales_created, leads_total),
        },
        'date_range': {
            'start': start_date.isoformat(),
            'end': end_date.isoformat(),
        }
    }


def get_product_performance(days: int = 30) -> list[dict]:
    """Get product performance: requests, conversions, revenue"""
    start_date, end_date = get_date_range(days)

    products_data = (
        OnlineRequest.objects
        .filter(created_at__range=[start_date, end_date])
        .values('product_id', 'product__name')
        .annotate(
            requests_count=Count('id'),
            avg_quoted_price=Avg('unit_price'),
            approved_count=Count('id', filter=Q(status__in=['APPROVED', 'COMPLETED'])),
            total_amount_quoted=Sum('total_amount'),
        )
        .order_by('-requests_count')
    )

    result = []
    for row in products_data:
        requests = row['requests_count']
        approved = row['approved_count']
        conversion_rate = round((approved / requests * 100), 1) if requests > 0 else 0

        # Get revenue from subscriptions for this product
        revenue_subscriptions = (
            Subscription.objects
            .filter(
                product_id=row['product_id'],
                created_at__range=[start_date, end_date]
            )
            .aggregate(total=Sum('price'))['total'] or Decimal(0)
        )

        # Direct sales revenue (estimate based on requests converted to sales)
        revenue_sales = Decimal(0)

        result.append({
            'product_id': row['product_id'],
            'product_name': row['product__name'],
            'requests_count': requests,
            'approved_count': approved,
            'conversion_rate': conversion_rate,
            'avg_quoted_price': float(row['avg_quoted_price'] or 0),
            'total_quoted_amount': float(row['total_amount_quoted'] or 0),
            'revenue_from_subscriptions': float(revenue_subscriptions),
            'revenue_from_sales': float(revenue_sales),
            'total_revenue': float(revenue_subscriptions + revenue_sales),
        })

    return result


def get_timeline_analytics(days: int = 30) -> dict:
    """Get daily trends: leads, requests, approvals, conversions"""
    start_date, end_date = get_date_range(days)

    # Daily leads
    daily_leads = (
        PublicLead.objects
        .filter(created_at__range=[start_date, end_date])
        .extra(select={'date': 'DATE(created_at)'})
        .values('date')
        .annotate(count=Count('id'))
        .order_by('date')
    )

    # Daily requests
    daily_requests = (
        OnlineRequest.objects
        .filter(created_at__range=[start_date, end_date])
        .extra(select={'date': 'DATE(created_at)'})
        .values('date')
        .annotate(count=Count('id'))
        .order_by('date')
    )

    # Daily approvals
    daily_approvals = (
        OnlineRequest.objects
        .filter(
            approved_at__range=[start_date, end_date],
            status__in=['APPROVED', 'COMPLETED']
        )
        .extra(select={'date': 'DATE(approved_at)'})
        .values('date')
        .annotate(count=Count('id'))
        .order_by('date')
    )

    # Daily subscriptions
    daily_subscriptions = (
        Subscription.objects
        .filter(
            created_at__range=[start_date, end_date],
            source_online_request__isnull=False
        )
        .extra(select={'date': 'DATE(created_at)'})
        .values('date')
        .annotate(count=Count('id'))
        .order_by('date')
    )

    # Daily direct sales
    daily_sales = (
        DirectSale.objects
        .filter(
            created_at__range=[start_date, end_date],
            status__in=['CONFIRMED', 'INVOICED', 'COMPLETED']
        )
        .extra(select={'date': 'DATE(created_at)'})
        .values('date')
        .annotate(count=Count('id'))
        .order_by('date')
    )

    # Format results
    def format_daily(queryset):
        return [
            {
                'date': str(row['date']),
                'count': row['count']
            }
            for row in queryset
        ]

    return {
        'daily_leads': format_daily(daily_leads),
        'daily_requests': format_daily(daily_requests),
        'daily_approvals': format_daily(daily_approvals),
        'daily_subscriptions': format_daily(daily_subscriptions),
        'daily_sales': format_daily(daily_sales),
        'date_range': {
            'start': start_date.isoformat(),
            'end': end_date.isoformat(),
        }
    }


def get_request_type_analytics(days: int = 30) -> dict:
    """Get analytics by request type: ADVANCE_EMI, DIRECT_SALE, RENT, LEASE"""
    start_date, end_date = get_date_range(days)

    type_stats = (
        OnlineRequest.objects
        .filter(created_at__range=[start_date, end_date])
        .values('request_type')
        .annotate(
            count=Count('id'),
            approved=Count('id', filter=Q(status__in=['APPROVED', 'COMPLETED'])),
            total_amount=Sum('total_amount'),
            avg_amount=Avg('total_amount'),
        )
        .order_by('-count')
    )

    result = {}
    for row in type_stats:
        request_type = row['request_type']
        count = row['count']
        approved = row['approved']
        conversion_rate = round((approved / count * 100), 1) if count > 0 else 0

        result[request_type] = {
            'requests_count': count,
            'approved_count': approved,
            'conversion_rate': conversion_rate,
            'total_amount': float(row['total_amount'] or 0),
            'avg_amount': float(row['avg_amount'] or 0),
        }

    return result


def get_analytics_summary(days: int = 30) -> dict:
    """Get complete analytics summary"""
    return {
        'funnel': get_funnel_analytics(days),
        'products': get_product_performance(days),
        'timeline': get_timeline_analytics(days),
        'by_request_type': get_request_type_analytics(days),
    }


def get_dashboard_metrics() -> dict:
    """Get unified CRM dashboard metrics (current counts, not time-filtered)"""
    # Stage counts
    leads_count = PublicLead.objects.count()
    online_requests_count = OnlineRequest.objects.count()
    product_requests_count = ProductRequest.objects.count()
    subscription_requests_count = SubscriptionRequest.objects.count()
    subscriptions_count = Subscription.objects.count()
    direct_sales_count = DirectSale.objects.count()

    # Revenue metrics
    total_revenue_subscriptions = (
        Subscription.objects
        .aggregate(total=Sum('price'))['total'] or Decimal(0)
    )
    total_revenue_direct_sales = (
        DirectSale.objects
        .aggregate(total=Sum('amount'))['total'] or Decimal(0)
    )

    total_revenue = float(total_revenue_subscriptions + total_revenue_direct_sales)

    # Conversion rates
    total_conversions = subscriptions_count + direct_sales_count
    lead_to_sale_conversion = (
        round((total_conversions / leads_count * 100), 2)
        if leads_count > 0 else 0
    )

    avg_revenue_per_lead = (
        round(total_revenue / leads_count, 2)
        if leads_count > 0 else 0
    )

    return {
        'leads': {
            'stage': 'Leads',
            'count': leads_count,
        },
        'onlineRequests': {
            'stage': 'Online Requests',
            'count': online_requests_count,
        },
        'productRequests': {
            'stage': 'Product Requests',
            'count': product_requests_count,
        },
        'subscriptionRequests': {
            'stage': 'Subscription Requests',
            'count': subscription_requests_count,
        },
        'subscriptions': {
            'stage': 'Active Subscriptions',
            'count': subscriptions_count,
            'revenue': float(total_revenue_subscriptions),
        },
        'directSales': {
            'stage': 'Direct Sales',
            'count': direct_sales_count,
            'revenue': float(total_revenue_direct_sales),
        },
        'roi': {
            'totalLeads': leads_count,
            'totalConversions': total_conversions,
            'conversionRate': lead_to_sale_conversion,
            'totalRevenue': total_revenue,
            'avgRevenuePerLead': avg_revenue_per_lead,
            'roi': lead_to_sale_conversion,
        },
    }
