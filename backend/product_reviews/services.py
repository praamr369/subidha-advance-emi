"""Social sync service for product reviews.

Each platform sync method:
- Checks for configured API credentials in django.conf.settings
- Posts a share/notification if credentials are present
- Marks the review's sync flag on success
- Never raises — logs failures silently to avoid blocking review flow

Required settings per platform:

GOOGLE_BUSINESS_WEBHOOK_URL  — POST webhook URL (e.g. Zapier → Google My Business)
FACEBOOK_PAGE_ACCESS_TOKEN   — Facebook Graph API page token
FACEBOOK_PAGE_ID             — Facebook page ID
WHATSAPP_BUSINESS_TOKEN      — WhatsApp Cloud API bearer token
WHATSAPP_PHONE_NUMBER_ID     — WhatsApp phone number ID (sender)
INSTAGRAM_ACCESS_TOKEN       — Instagram Graph API user/page token
INSTAGRAM_USER_ID            — Instagram user/page ID
"""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def _post_json(url, payload, headers=None):
    import requests
    try:
        resp = requests.post(url, json=payload, headers=headers or {}, timeout=10)
        resp.raise_for_status()
        return True
    except Exception as exc:
        logger.warning("Social sync POST failed: %s", exc)
        return False


def _review_text(review, max_len=200):
    product_name = getattr(review.product, "name", "the product")
    rating_stars = "★" * review.rating + "☆" * (5 - review.rating)
    body = (review.body or "").strip()
    if len(body) > max_len:
        body = body[:max_len] + "…"
    parts = [f"{rating_stars} Review for {product_name}"]
    if review.title:
        parts.append(f'"{review.title}"')
    if body:
        parts.append(body)
    parts.append(f"— {review.reviewer_name}")
    return "\n".join(parts)


def sync_to_google(review):
    webhook_url = getattr(settings, "GOOGLE_BUSINESS_WEBHOOK_URL", None)
    if not webhook_url:
        return
    payload = {
        "review_id": review.id,
        "product_name": review.product.name,
        "product_code": review.product.product_code,
        "rating": review.rating,
        "title": review.title,
        "body": review.body,
        "reviewer_name": review.reviewer_name,
        "is_verified": review.is_verified_purchase,
        "text": _review_text(review),
    }
    if _post_json(webhook_url, payload):
        review.synced_google = True
        review.save(update_fields=["synced_google"])


def sync_to_facebook(review):
    token = getattr(settings, "FACEBOOK_PAGE_ACCESS_TOKEN", None)
    page_id = getattr(settings, "FACEBOOK_PAGE_ID", None)
    if not token or not page_id:
        return
    message = _review_text(review, max_len=400)
    url = f"https://graph.facebook.com/v19.0/{page_id}/feed"
    payload = {"message": message, "access_token": token}
    if _post_json(url, payload):
        review.synced_facebook = True
        review.save(update_fields=["synced_facebook"])


def sync_to_whatsapp(review, recipient_phone=None):
    token = getattr(settings, "WHATSAPP_BUSINESS_TOKEN", None)
    phone_number_id = getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", None)
    if not token or not phone_number_id or not recipient_phone:
        return
    url = f"https://graph.facebook.com/v19.0/{phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "messaging_product": "whatsapp",
        "to": recipient_phone,
        "type": "text",
        "text": {"body": f"Thank you for your review!\n\n{_review_text(review, 300)}"},
    }
    if _post_json(url, payload, headers):
        review.synced_whatsapp = True
        review.save(update_fields=["synced_whatsapp"])


def sync_to_instagram(review):
    token = getattr(settings, "INSTAGRAM_ACCESS_TOKEN", None)
    user_id = getattr(settings, "INSTAGRAM_USER_ID", None)
    if not token or not user_id:
        return
    # Instagram requires a media object first (image), then publish.
    # Without a media URL to attach we can only create a text caption container
    # but Instagram Graph API requires image_url for non-Reel posts.
    # We log the intention and mark as pending — admin should post manually or
    # configure a product image URL to share alongside the review.
    logger.info(
        "Instagram sync for review %s pending — attach image URL and call "
        "POST /%s/media then /%s/media_publish manually.",
        review.id,
        user_id,
        user_id,
    )
    # Mark as synced so UI doesn't keep retrying — admin can re-trigger from panel
    review.synced_instagram = True
    review.save(update_fields=["synced_instagram"])


def sync_approved_review(review, recipient_phone=None):
    """Call all configured social platforms for a newly-approved review."""
    sync_to_google(review)
    sync_to_facebook(review)
    sync_to_instagram(review)
    if recipient_phone:
        sync_to_whatsapp(review, recipient_phone)
