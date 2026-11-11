from __future__ import annotations

from datetime import datetime, timedelta
from django.db.models import Count, Q, Sum, Avg, F
from django.db.models.functions import TruncDate
from django.utils import timezone
from decimal import Decimal

from crm.models import PublicLead, ProductRequest, SubscriptionRequest, WebappVisitorEvent, ProductReaction
from contracts.models import Subscription
from crm.models import OnlineRequest
from billing.models import DirectSale
from products_core.models import Product


def get_date_range(days: int = 30) -> tuple[datetime, datetime]:
    """Get date range for analytics (last N days)"""
    end_date = timezone.now()
    start_date = end_date - timedelta(days=days)
    return start_date, end_date


def get_funnel_analytics(days: int = 30) -> dict:
    """Get CRM funnel: Visitors → Leads → Requests → Subscriptions"""
    start_date, end_date = get_date_range(days)

    # Public webapp visitors and registrations
    public_visits_total = WebappVisitorEvent.objects.filter(
        created_at__range=[start_date, end_date]
    ).count()

    unique_visitors_total = WebappVisitorEvent.objects.filter(
        created_at__range=[start_date, end_date]
    ).values('session_id').distinct().count()

    registered_visitors_total = WebappVisitorEvent.objects.filter(
        created_at__range=[start_date, end_date],
        is_registered=True,
    ).values('session_id').distinct().count()

    unregistered_visitors_total = max(0, unique_visitors_total - registered_visitors_total)

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
        online_request__isnull=False
    ).count()

    # Direct sales from approved requests (via OnlineRequest.approved_direct_sale FK)
    direct_sales_created = OnlineRequest.objects.filter(
        approved_at__range=[start_date, end_date],
        approved_direct_sale__isnull=False
    ).count()

    # Calculate percentages
    def pct(numerator, denominator):
        return round((numerator / denominator * 100), 1) if denominator > 0 else 0

    visitor_to_registered_pct = pct(registered_visitors_total, unique_visitors_total)
    visitor_to_lead_pct = pct(leads_total, unique_visitors_total)

    return {
        'period_days': days,
        'funnel': {
            'public_visits': public_visits_total,
            'unique_visitors': unique_visitors_total,
            'registered_visitors': registered_visitors_total,
            'unregistered_visitors': unregistered_visitors_total,
            'visitor_to_registered_pct': visitor_to_registered_pct,
            'visitor_to_lead_pct': visitor_to_lead_pct,
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
    """Get product performance: views, likes/dislikes, requests, conversions, revenue"""
    start_date, end_date = get_date_range(days)

    # Collect distinct product IDs across requests, visitor events, and reactions
    request_pids = set(
        OnlineRequest.objects
        .filter(created_at__range=[start_date, end_date], product_id__isnull=False)
        .values_list('product_id', flat=True)
    )
    reaction_pids = set(
        ProductReaction.objects
        .filter(created_at__range=[start_date, end_date])
        .values_list('product_id', flat=True)
    )
    view_pids = set(
        WebappVisitorEvent.objects
        .filter(created_at__range=[start_date, end_date], product_id__isnull=False)
        .values_list('product_id', flat=True)
    )
    all_pids = request_pids | reaction_pids | view_pids

    if not all_pids:
        # If no activity in period, fall back to top active catalog products
        all_pids = set(Product.objects.filter(is_active=True).values_list('id', flat=True)[:20])

    products = {p.id: p for p in Product.objects.filter(id__in=all_pids)}

    # Bulk query stats across all products to avoid N+1 queries
    req_stats_by_pid = {
        row['product_id']: row
        for row in (
            OnlineRequest.objects
            .filter(product_id__in=all_pids, created_at__range=[start_date, end_date])
            .values('product_id')
            .annotate(
                count=Count('id'),
                approved=Count('id', filter=Q(status__in=['APPROVED', 'COMPLETED'])),
                avg_price=Avg('unit_price'),
                total_quoted=Sum('total_amount'),
            )
        )
    }

    views_by_pid = {
        row['product_id']: row['count']
        for row in (
            WebappVisitorEvent.objects
            .filter(product_id__in=all_pids, created_at__range=[start_date, end_date])
            .values('product_id')
            .annotate(count=Count('id'))
        )
    }

    reaction_stats_by_pid = {
        row['product_id']: row
        for row in (
            ProductReaction.objects
            .filter(product_id__in=all_pids, created_at__range=[start_date, end_date])
            .values('product_id')
            .annotate(
                likes=Count('id', filter=Q(is_like=True)),
                dislikes=Count('id', filter=Q(is_like=False)),
            )
        )
    }

    subs_revenue_by_pid = {
        row['product_id']: row['total']
        for row in (
            Subscription.objects
            .filter(product_id__in=all_pids, created_at__range=[start_date, end_date])
            .values('product_id')
            .annotate(total=Sum('total_amount'))
        )
    }

    result = []
    for pid in all_pids:
        prod = products.get(pid)
        if not prod:
            continue

        # Requests stats from bulk map
        req_stats = req_stats_by_pid.get(pid, {})
        requests = req_stats.get('count', 0)
        approved = req_stats.get('approved', 0)
        conversion_rate = round((approved / requests * 100), 1) if requests > 0 else 0

        # Public visitor views from bulk map
        views_count = views_by_pid.get(pid, 0)

        # Public likes and dislikes from bulk map
        rx_stats = reaction_stats_by_pid.get(pid, {})
        likes_count = rx_stats.get('likes', 0)
        dislikes_count = rx_stats.get('dislikes', 0)

        total_reactions = likes_count + dislikes_count
        like_ratio = round((likes_count / total_reactions * 100), 1) if total_reactions > 0 else 0

        sentiment = (
            "NO_VOTES" if total_reactions == 0
            else "HIGHLY_LIKED" if like_ratio >= 80
            else "POPULAR" if like_ratio >= 60
            else "MIXED" if like_ratio >= 40
            else "LOW_APPROVAL"
        )

        # Revenue from subscriptions
        revenue_subscriptions = subs_revenue_by_pid.get(pid) or Decimal(0)
        revenue_sales = Decimal(0)

        result.append({
            'product_id': pid,
            'product_name': prod.name,
            'product_code': getattr(prod, 'product_code', ''),
            'category': str(getattr(prod, 'category', 'General')),
            'views_count': views_count,
            'likes_count': likes_count,
            'dislikes_count': dislikes_count,
            'total_reactions': total_reactions,
            'like_ratio': like_ratio,
            'sentiment': sentiment,
            'requests_count': requests,
            'approved_count': approved,
            'conversion_rate': conversion_rate,
            'avg_quoted_price': float(req_stats.get('avg_price') or 0),
            'total_quoted_amount': float(req_stats.get('total_quoted') or 0),
            'revenue_from_subscriptions': float(revenue_subscriptions),
            'revenue_from_sales': float(revenue_sales),
            'total_revenue': float(revenue_subscriptions + revenue_sales),
        })

    # Order by highest views, likes, and requests
    result.sort(key=lambda r: (r['views_count'] + r['requests_count'] * 2 + r['likes_count']), reverse=True)
    return result


def get_timeline_analytics(days: int = 30) -> dict:
    """Get daily trends: leads, requests, approvals, conversions"""
    start_date, end_date = get_date_range(days)

    # Daily leads
    daily_leads = (
        PublicLead.objects
        .filter(created_at__range=[start_date, end_date])
        .annotate(date=TruncDate('created_at'))
        .values('date')
        .annotate(count=Count('id'))
        .order_by('date')
    )

    # Daily requests
    daily_requests = (
        OnlineRequest.objects
        .filter(created_at__range=[start_date, end_date])
        .annotate(date=TruncDate('created_at'))
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
        .annotate(date=TruncDate('approved_at'))
        .values('date')
        .annotate(count=Count('id'))
        .order_by('date')
    )

    # Daily subscriptions
    daily_subscriptions = (
        Subscription.objects
        .filter(
            created_at__range=[start_date, end_date],
            online_request__isnull=False
        )
        .annotate(date=TruncDate('created_at'))
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
        .annotate(date=TruncDate('created_at'))
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
        )
        .order_by('-count')
    )

    result = {}
    for row in type_stats:
        request_type = row['request_type']
        count = row['count']
        approved = row['approved']
        total_amt = float(row['total_amount'] or 0)
        conversion_rate = round((approved / count * 100), 1) if count > 0 else 0
        avg_amount = round(total_amt / count, 2) if count > 0 else 0

        result[request_type] = {
            'requests_count': count,
            'approved_count': approved,
            'conversion_rate': conversion_rate,
            'total_amount': total_amt,
            'avg_amount': avg_amount,
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
    try:
        # Stage counts - use count() for accuracy
        public_visits_count = WebappVisitorEvent.objects.count()
        unique_visitors_count = WebappVisitorEvent.objects.values('session_id').distinct().count()
        registered_visitors_count = WebappVisitorEvent.objects.filter(is_registered=True).values('session_id').distinct().count()
        total_product_likes = ProductReaction.objects.filter(is_like=True).count()
        total_product_dislikes = ProductReaction.objects.filter(is_like=False).count()
        total_reactions = total_product_likes + total_product_dislikes

        leads_count = PublicLead.objects.count()
        online_requests_count = OnlineRequest.objects.count()
        product_requests_count = ProductRequest.objects.count()
        subscription_requests_count = SubscriptionRequest.objects.count()
        subscriptions_count = Subscription.objects.filter(status__in=['ACTIVE', 'PROCESSING']).count()
        direct_sales_count = DirectSale.objects.filter(status__in=['CONFIRMED', 'INVOICED', 'COMPLETED']).count()

        # Revenue metrics - only count active/completed records
        total_revenue_subscriptions_result = (
            Subscription.objects
            .filter(status__in=['ACTIVE', 'PROCESSING'])
            .aggregate(total=Sum('total_amount'))
        )
        total_revenue_subscriptions = (
            total_revenue_subscriptions_result['total'] or Decimal(0)
        )

        total_revenue_direct_sales_result = (
            DirectSale.objects
            .filter(status__in=['CONFIRMED', 'INVOICED', 'COMPLETED'])
            .aggregate(total=Sum('grand_total'))
        )
        total_revenue_direct_sales = (
            total_revenue_direct_sales_result['total'] or Decimal(0)
        )

        # Ensure Decimal conversion
        total_revenue_subscriptions = float(total_revenue_subscriptions) if total_revenue_subscriptions else 0.0
        total_revenue_direct_sales = float(total_revenue_direct_sales) if total_revenue_direct_sales else 0.0
        total_revenue = total_revenue_subscriptions + total_revenue_direct_sales

        # Conversion rates
        total_conversions = subscriptions_count + direct_sales_count

        if leads_count > 0:
            lead_to_sale_conversion = round((total_conversions / leads_count * 100), 2)
            avg_revenue_per_lead = round(total_revenue / leads_count, 2)
        else:
            lead_to_sale_conversion = 0.0
            avg_revenue_per_lead = 0.0

        return {
            'visitors': {
                'stage': 'Webapp Visitors',
                'visits': public_visits_count,
                'unique': unique_visitors_count,
                'registered': registered_visitors_count,
                'unregistered': max(0, unique_visitors_count - registered_visitors_count),
                'regConversionRate': round((registered_visitors_count / unique_visitors_count * 100), 1) if unique_visitors_count > 0 else 0.0,
            },
            'productSentiment': {
                'likes': total_product_likes,
                'dislikes': total_product_dislikes,
                'totalReactions': total_reactions,
                'likeRatio': round((total_product_likes / total_reactions * 100), 1) if total_reactions > 0 else 0.0,
            },
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
                'revenue': round(total_revenue_subscriptions, 2),
            },
            'directSales': {
                'stage': 'Direct Sales',
                'count': direct_sales_count,
                'revenue': round(total_revenue_direct_sales, 2),
            },
            'roi': {
                'totalLeads': leads_count,
                'totalConversions': total_conversions,
                'conversionRate': lead_to_sale_conversion,
                'totalRevenue': round(total_revenue, 2),
                'avgRevenuePerLead': avg_revenue_per_lead,
            },
        }
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error calculating dashboard metrics: {str(e)}")
        # Return safe default values on error
        return {
            'leads': {'stage': 'Leads', 'count': 0},
            'onlineRequests': {'stage': 'Online Requests', 'count': 0},
            'productRequests': {'stage': 'Product Requests', 'count': 0},
            'subscriptionRequests': {'stage': 'Subscription Requests', 'count': 0},
            'subscriptions': {'stage': 'Active Subscriptions', 'count': 0, 'revenue': 0.0},
            'directSales': {'stage': 'Direct Sales', 'count': 0, 'revenue': 0.0},
            'roi': {
                'totalLeads': 0,
                'totalConversions': 0,
                'conversionRate': 0.0,
                'totalRevenue': 0.0,
                'avgRevenuePerLead': 0.0,
            },
        }
