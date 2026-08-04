"""Layer-B: audit helper contract.

`log_audit` is the single write path for the audit trail. Proving it records the
model name + object id, normalises metadata to a dict, and tolerates a null
instance covers every caller across the app.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


class AuditServiceContractTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.actor = get_user_model().objects.create_user(
            username="audit_actor", password="x", role="ADMIN",
            phone="9990020001", is_staff=True,
        )

    def test_records_model_name_object_id_and_actor(self):
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=self.actor,  # any model instance
            performed_by=self.actor,
            metadata={"event": "TEST"},
        )
        entry = AuditLog.objects.latest("id")
        self.assertEqual(entry.model_name, "User")
        self.assertEqual(entry.object_id, self.actor.pk)
        self.assertEqual(entry.performed_by_id, self.actor.id)
        self.assertEqual(entry.metadata, {"event": "TEST"})

    def test_null_instance_records_system(self):
        log_audit(action_type=AuditLog.ActionType.PAYMENT_FLAGGED, instance=None)
        entry = AuditLog.objects.latest("id")
        self.assertEqual(entry.model_name, "System")
        self.assertEqual(entry.object_id, 0)

    def test_metadata_is_normalised_to_dict(self):
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=None,
            metadata=None,
        )
        self.assertEqual(AuditLog.objects.latest("id").metadata, {})

        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=None,
            metadata="not-a-dict",
        )
        self.assertEqual(AuditLog.objects.latest("id").metadata, {"value": "not-a-dict"})
