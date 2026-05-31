# Generated manually for BC-2 compatibility backfill.

import django.utils.timezone
from django.db import migrations


def forwards(apps, schema_editor):
    BusinessComplianceDocument = apps.get_model("subscriptions", "BusinessComplianceDocument")
    BusinessComplianceDocumentReviewState = apps.get_model("subscriptions", "BusinessComplianceDocumentReviewState")
    now = django.utils.timezone.now()

    for document in BusinessComplianceDocument.objects.all():
        if not document.is_active:
            review_status = "EXPIRED"
        elif document.verification_status == "VERIFIED":
            review_status = "APPROVED"
        elif document.verification_status == "REJECTED":
            review_status = "REJECTED"
        else:
            review_status = "PENDING"

        has_file = bool(getattr(document.file, "name", ""))
        BusinessComplianceDocumentReviewState.objects.get_or_create(
            document_id=document.id,
            defaults={
                "review_status": review_status,
                "reviewed_at": document.verified_at if review_status in ("APPROVED", "REJECTED") else None,
                "evidence_uploaded_at": now if has_file else None,
                "last_action_reason": "Backfilled from existing compliance document state.",
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0078_business_compliance_review_state"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
