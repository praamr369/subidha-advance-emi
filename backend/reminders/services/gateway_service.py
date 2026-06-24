from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings

from reminders.models import PaymentReminder, ReminderChannel

logger = logging.getLogger(__name__)


class ReminderGatewayError(ValueError):
    pass


@dataclass(frozen=True)
class GatewayConfig:
    provider: str
    channel: str
    configured: bool
    url: str
    token_configured: bool


def _channel_url_and_token(channel: str) -> tuple[str, str]:
    if channel == ReminderChannel.SMS:
        return settings.REMINDER_SMS_GATEWAY_URL, settings.REMINDER_SMS_GATEWAY_TOKEN
    if channel == ReminderChannel.WHATSAPP:
        return settings.REMINDER_WHATSAPP_GATEWAY_URL, settings.REMINDER_WHATSAPP_GATEWAY_TOKEN
    return "", ""


def gateway_status() -> dict:
    provider = getattr(settings, "REMINDER_GATEWAY_PROVIDER", "disabled")
    channels = {}
    for channel in (ReminderChannel.SMS, ReminderChannel.WHATSAPP):
        url, token = _channel_url_and_token(channel)
        configured = provider == "console" or (provider == "http_json" and bool(url and token))
        channels[channel] = GatewayConfig(
            provider=provider,
            channel=channel,
            configured=configured,
            url=url,
            token_configured=bool(token),
        ).__dict__
    return {
        "provider": provider,
        "automated_dispatch_available": any(row["configured"] for row in channels.values()),
        "channels": channels,
    }


def dispatch_gateway_message(*, reminder: PaymentReminder, message: str) -> dict:
    provider = getattr(settings, "REMINDER_GATEWAY_PROVIDER", "disabled")
    channel = reminder.channel
    if channel not in {ReminderChannel.SMS, ReminderChannel.WHATSAPP}:
        raise ReminderGatewayError(f"Gateway dispatch is not supported for {channel}.")

    recipient = (reminder.customer_contact or "").strip()
    if not recipient:
        raise ReminderGatewayError("No customer_contact is available for gateway dispatch.")

    if provider == "disabled":
        raise ReminderGatewayError("Reminder gateway is disabled. Configure REMINDER_GATEWAY_PROVIDER and channel credentials.")

    payload = {
        "channel": channel,
        "to": recipient,
        "message": message,
        "reminder_id": reminder.id,
        "reminder_no": reminder.reminder_no,
        "template_key": reminder.template_key,
    }

    if provider == "console":
        logger.info("Console reminder gateway dispatch: %s", payload)
        return {"provider": provider, "accepted": True, "gateway_reference": f"console:{reminder.id}"}

    if provider != "http_json":
        raise ReminderGatewayError(f"Unsupported reminder gateway provider: {provider}.")

    url, token = _channel_url_and_token(channel)
    if not url or not token:
        raise ReminderGatewayError(f"{channel} gateway URL/token is not configured.")

    body = json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=getattr(settings, "REMINDER_GATEWAY_TIMEOUT_SECONDS", 10)) as response:
            response_body = response.read().decode("utf-8", errors="replace")
            return {
                "provider": provider,
                "accepted": 200 <= response.status < 300,
                "status_code": response.status,
                "gateway_response": response_body[:1000],
            }
    except HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        raise ReminderGatewayError(f"Gateway HTTP {exc.code}: {body_text[:300]}") from exc
    except URLError as exc:
        raise ReminderGatewayError(f"Gateway connection failed: {exc.reason}") from exc
