from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.conf import settings
import os

from subscriptions.models import Subscription
from subscriptions.services.statement_service import (
    generate_subscription_statement_pdf
)


def subscription_statement_view(request, subscription_id):
    subscription = get_object_or_404(Subscription, id=subscription_id)

    file_path = os.path.join(
        settings.MEDIA_ROOT,
        f"statement_subscription_{subscription.id}.pdf"
    )

    generate_subscription_statement_pdf(subscription, file_path)

    return FileResponse(
        open(file_path, "rb"),
        as_attachment=True,
        filename=f"Subscription_{subscription.id}_Statement.pdf",
    )