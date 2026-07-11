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
YOUTUBE_CACHE_KEY = "reviews:youtube"
CACHE_TTL = 60 * 30  # 30 minutes


# ── credential helpers ────────────────────────────────────────────────────────
# DB config (set from the admin Brand Data Center) wins; .env is the fallback.

CONFIG_CACHE_KEY = "reviews:platform-config"


def _config():
    cached = cache.get(CONFIG_CACHE_KEY)
    if cached is not None:
        return cached
    try:
        from reviews.models import ReviewPlatformConfig
        obj = ReviewPlatformConfig.load()
        values = {
            "google_places_api_key": obj.google_places_api_key,
            "google_place_id": obj.google_place_id,
            "facebook_page_id": obj.facebook_page_id,
            "facebook_page_access_token": obj.facebook_page_access_token,
            "youtube_api_key": obj.youtube_api_key,
            "youtube_channel_id": obj.youtube_channel_id,
        }
    except Exception:  # table missing during migrate, etc.
        values = {}
    cache.set(CONFIG_CACHE_KEY, values, 60)
    return values


def invalidate_config_cache():
    cache.delete(CONFIG_CACHE_KEY)
    cache.delete(GOOGLE_CACHE_KEY)
    cache.delete(FACEBOOK_CACHE_KEY)
    cache.delete(YOUTUBE_CACHE_KEY)


def _cred(db_field, env_var):
    return _config().get(db_field) or os.getenv(env_var, "")

def _google_api_key():
    return _cred("google_places_api_key", "GOOGLE_PLACES_API_KEY")

def _google_place_id():
    return _cred("google_place_id", "GOOGLE_PLACE_ID")

def _facebook_page_id():
    return _cred("facebook_page_id", "FACEBOOK_PAGE_ID")

def _facebook_access_token():
    return _cred("facebook_page_access_token", "FACEBOOK_PAGE_ACCESS_TOKEN")

def _youtube_api_key():
    return _cred("youtube_api_key", "YOUTUBE_API_KEY")

def _youtube_channel_id():
    return _cred("youtube_channel_id", "YOUTUBE_CHANNEL_ID")


# ── public URL helpers ────────────────────────────────────────────────────────

def get_review_links():
    """Return direct-link URLs so the frontend never needs to embed credentials."""
    place_id = _google_place_id()
    fb_page_id = _facebook_page_id()
    channel_id = _youtube_channel_id()
    return {
        "google_write_url": (
            f"https://search.google.com/local/writereview?placeid={place_id}"
            if place_id else None
        ),
        "facebook_review_url": (
            f"https://www.facebook.com/{fb_page_id}/reviews"
            if fb_page_id else None
        ),
        "youtube_channel_url": (
            f"https://www.youtube.com/channel/{channel_id}"
            if channel_id else None
        ),
    }


# ── Google Places API ─────────────────────────────────────────────────────────

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
        req = urllib.request.Request(
            url + "?" + urllib.parse.urlencode(params),
            headers={"User-Agent": "SubidhaApp/1.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except Exception as exc:
        logger.warning("Google Places API error: %s", exc)
        return {"error": "Could not fetch Google reviews.", "reviews": [], "rating": None, "total": 0}

    if data.get("status") != "OK":
        err_msg = data.get("error_message") or data.get("status", "Unknown error")
        logger.warning("Google Places API returned status %s: %s", data.get("status"), err_msg)
        return {"error": err_msg, "reviews": [], "rating": None, "total": 0}

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
        if r.get("text", "").strip()
    ]

    payload = {
        "reviews": reviews,
        "rating": result.get("rating"),
        "total": result.get("user_ratings_total", 0),
        "error": None,
    }
    cache.set(GOOGLE_CACHE_KEY, payload, CACHE_TTL)
    return payload


# ── Facebook Graph API ────────────────────────────────────────────────────────

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
        req = urllib.request.Request(
            url + "?" + urllib.parse.urlencode(params),
            headers={"User-Agent": "SubidhaApp/1.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        logger.warning("Facebook API HTTP %s: %s", exc.code, body)
        return {"error": f"Facebook API error {exc.code}.", "reviews": [], "rating": None, "total": 0}
    except Exception as exc:
        logger.warning("Facebook Graph API error: %s", exc)
        return {"error": "Could not fetch Facebook reviews.", "reviews": [], "rating": None, "total": 0}

    if "error" in data:
        err = data["error"]
        logger.warning("Facebook API error response: %s", err)
        return {"error": err.get("message", "Facebook API error"), "reviews": [], "rating": None, "total": 0}

    reviews = []
    for r in data.get("data", []):
        reviewer = r.get("reviewer") or {}
        rec_type = (r.get("recommendation_type") or "").lower()
        text = (r.get("review_text") or "").strip()
        if not text:
            continue
        rating = r.get("rating")
        if rating is None:
            rating = 5 if rec_type == "positive" else 2
        reviews.append({
            "source": "facebook",
            "author": reviewer.get("name", "Facebook User"),
            "avatar": reviewer.get("pic"),
            "rating": int(rating),
            "text": text,
            "time": None,
            "relative_time": (r.get("created_time") or "")[:10],
        })

    payload = {
        "reviews": reviews,
        "rating": None,
        "total": len(reviews),
        "error": None,
    }
    cache.set(FACEBOOK_CACHE_KEY, payload, CACHE_TTL)
    return payload


# ── YouTube Data API v3 ───────────────────────────────────────────────────────

def fetch_youtube_comments(force_refresh=False):
    if not force_refresh:
        cached = cache.get(YOUTUBE_CACHE_KEY)
        if cached is not None:
            return cached

    api_key = _youtube_api_key()
    channel_id = _youtube_channel_id()

    if not api_key or not channel_id:
        return {"error": "YouTube credentials not configured.", "reviews": [], "total": 0}

    # Fetch the most-commented videos on the channel, then grab top comments
    search_url = "https://www.googleapis.com/youtube/v3/search"
    search_params = {
        "part": "snippet",
        "channelId": channel_id,
        "maxResults": 5,
        "order": "viewCount",
        "type": "video",
        "key": api_key,
    }

    try:
        req = urllib.request.Request(
            search_url + "?" + urllib.parse.urlencode(search_params),
            headers={"User-Agent": "SubidhaApp/1.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            search_data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        logger.warning("YouTube search API HTTP %s: %s", exc.code, body)
        return {"error": f"YouTube API error {exc.code}.", "reviews": [], "total": 0}
    except Exception as exc:
        logger.warning("YouTube search API error: %s", exc)
        return {"error": "Could not fetch YouTube data.", "reviews": [], "total": 0}

    if "error" in search_data:
        err = search_data["error"]
        return {"error": err.get("message", "YouTube API error"), "reviews": [], "total": 0}

    video_ids = [
        item["id"]["videoId"]
        for item in search_data.get("items", [])
        if item.get("id", {}).get("videoId")
    ]

    if not video_ids:
        return {"error": None, "reviews": [], "total": 0}

    comments_url = "https://www.googleapis.com/youtube/v3/commentThreads"
    comments_params = {
        "part": "snippet",
        "videoId": ",".join(video_ids[:3]),  # top 3 videos
        "maxResults": 20,
        "order": "relevance",
        "key": api_key,
        "textFormat": "plainText",
    }

    try:
        req = urllib.request.Request(
            comments_url + "?" + urllib.parse.urlencode(comments_params),
            headers={"User-Agent": "SubidhaApp/1.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            comments_data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        logger.warning("YouTube comments API HTTP %s: %s", exc.code, body)
        return {"error": f"YouTube comments error {exc.code}.", "reviews": [], "total": 0}
    except Exception as exc:
        logger.warning("YouTube comments API error: %s", exc)
        return {"error": "Could not fetch YouTube comments.", "reviews": [], "total": 0}

    if "error" in comments_data:
        return {"error": comments_data["error"].get("message", "YouTube error"), "reviews": [], "total": 0}

    reviews = []
    for item in comments_data.get("items", []):
        top = item.get("snippet", {}).get("topLevelComment", {}).get("snippet", {})
        text = (top.get("textDisplay") or top.get("textOriginal") or "").strip()
        if not text or len(text) < 20:
            continue
        author = top.get("authorDisplayName", "YouTube User")
        avatar = top.get("authorProfileImageUrl")
        like_count = top.get("likeCount", 0)
        published = (top.get("publishedAt") or "")[:10]
        reviews.append({
            "source": "youtube",
            "author": author,
            "avatar": avatar,
            "rating": 5,
            "text": text,
            "time": None,
            "relative_time": published,
            "like_count": like_count,
        })

    reviews.sort(key=lambda r: r.get("like_count", 0), reverse=True)

    payload = {
        "reviews": reviews[:15],
        "total": len(reviews),
        "error": None,
    }
    cache.set(YOUTUBE_CACHE_KEY, payload, CACHE_TTL)
    return payload


# ── Combined feed ─────────────────────────────────────────────────────────────

def get_combined_reviews():
    g = fetch_google_reviews()
    f = fetch_facebook_reviews()
    y = fetch_youtube_comments()

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

    all_reviews = g["reviews"] + f["reviews"] + y["reviews"] + internal

    return {
        "google": {
            "rating": g.get("rating"),
            "total": g.get("total", 0),
            "error": g.get("error"),
        },
        "facebook": {
            "total": f.get("total", 0),
            "error": f.get("error"),
        },
        "youtube": {
            "total": y.get("total", 0),
            "error": y.get("error"),
        },
        "internal_count": len(internal),
        "reviews": all_reviews,
        "links": get_review_links(),
    }
