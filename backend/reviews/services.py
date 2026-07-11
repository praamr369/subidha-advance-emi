import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

from django.core.cache import cache

logger = logging.getLogger(__name__)

GOOGLE_CACHE_KEY = "reviews:google"
FACEBOOK_CACHE_KEY = "reviews:facebook"
CACHE_TTL = 60 * 30  # 30 minutes


def _google_api_key():
    return os.getenv("GOOGLE_PLACES_API_KEY", "")


def _google_place_id():
    return os.getenv("GOOGLE_PLACE_ID", "")


def _facebook_page_id():
    return os.getenv("FACEBOOK_PAGE_ID", "")


def _facebook_access_token():
    return os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN", "")


def fetch_google_reviews(force_refresh=False):
    if not force_refresh:
        cached = cache.get(GOOGLE_CACHE_KEY)
        if cached is not None:
            return cached

    api_key = _google_api_key()
    place_id = _google_place_id()

    if not api_key or not place_id:
        return {"error": "Google credentials not configured.", "reviews": [], "rating": None, "total": 0}

    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {
        "place_id": place_id,
        "fields": "rating,user_ratings_total,reviews",
        "key": api_key,
        "language": "en",
        "reviews_sort": "newest",
    }

    try:
        full_url = url + "?" + urllib.parse.urlencode(params)
        with urllib.request.urlopen(full_url, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except Exception as exc:
        logger.warning("Google Places API error: %s", exc)
        return {"error": "Could not fetch Google reviews.", "reviews": [], "rating": None, "total": 0}

    if data.get("status") != "OK":
        return {"error": data.get("error_message", data.get("status")), "reviews": [], "rating": None, "total": 0}

    result = data.get("result", {})
    reviews = [
        {
            "source": "google",
            "author": r.get("author_name", "Anonymous"),
            "avatar": r.get("profile_photo_url"),
            "rating": r.get("rating", 5),
            "text": r.get("text", ""),
            "time": r.get("time"),
            "relative_time": r.get("relative_time_description", ""),
        }
        for r in result.get("reviews", [])
    ]

    payload = {
        "reviews": reviews,
        "rating": result.get("rating"),
        "total": result.get("user_ratings_total", 0),
        "error": None,
    }
    cache.set(GOOGLE_CACHE_KEY, payload, CACHE_TTL)
    return payload


def fetch_facebook_reviews(force_refresh=False):
    if not force_refresh:
        cached = cache.get(FACEBOOK_CACHE_KEY)
        if cached is not None:
            return cached

    page_id = _facebook_page_id()
    access_token = _facebook_access_token()

    if not page_id or not access_token:
        return {"error": "Facebook credentials not configured.", "reviews": [], "rating": None, "total": 0}

    url = f"https://graph.facebook.com/v19.0/{page_id}/ratings"
    params = {
        "access_token": access_token,
        "fields": "reviewer{name,pic},rating,review_text,created_time,recommendation_type",
        "limit": 20,
    }

    try:
        full_url = url + "?" + urllib.parse.urlencode(params)
        with urllib.request.urlopen(full_url, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except Exception as exc:
        logger.warning("Facebook Graph API error: %s", exc)
        return {"error": "Could not fetch Facebook reviews.", "reviews": [], "rating": None, "total": 0}

    if "error" in data:
        return {"error": data["error"].get("message", "Facebook API error"), "reviews": [], "rating": None, "total": 0}

    reviews = []
    for r in data.get("data", []):
        reviewer = r.get("reviewer") or {}
        rec_type = r.get("recommendation_type", "")
        text = r.get("review_text", "")
        # Facebook ratings: 1–5 or recommendation_type POSITIVE/NEGATIVE
        rating = r.get("rating")
        if rating is None:
            rating = 5 if rec_type == "positive" else 2
        reviews.append({
            "source": "facebook",
            "author": reviewer.get("name", "Facebook User"),
            "avatar": reviewer.get("pic"),
            "rating": rating,
            "text": text,
            "time": None,
            "relative_time": r.get("created_time", "")[:10] if r.get("created_time") else "",
        })

    payload = {
        "reviews": reviews,
        "rating": None,
        "total": len(reviews),
        "error": None,
    }
    cache.set(FACEBOOK_CACHE_KEY, payload, CACHE_TTL)
    return payload


def get_combined_reviews():
    g = fetch_google_reviews()
    f = fetch_facebook_reviews()

    from reviews.models import InternalReview
    internal_qs = InternalReview.objects.filter(status="approved").order_by("-is_featured", "-created_at")[:20]
    internal = [
        {
            "source": "internal",
            "id": r.id,
            "author": r.reviewer_name,
            "avatar": None,
            "rating": r.rating,
            "text": r.body,
            "title": r.title,
            "is_featured": r.is_featured,
            "admin_reply": r.admin_reply,
            "relative_time": r.created_at.strftime("%d %b %Y"),
        }
        for r in internal_qs
    ]

    all_reviews = g["reviews"] + f["reviews"] + internal
    google_rating = g.get("rating")
    google_total = g.get("total", 0)

    return {
        "google": {"rating": google_rating, "total": google_total, "error": g.get("error")},
        "facebook": {"total": f.get("total", 0), "error": f.get("error")},
        "internal_count": len(internal),
        "reviews": all_reviews,
    }
