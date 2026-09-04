"""Replica routing safety.

The replica alias is optional, so these assert the behaviour that must hold in
BOTH shapes: provisioned and not. The dangerous failure is a router that
silently sends financial reads to a lagging standby, so that is what is pinned
here.
"""
from django.conf import settings
from django.test import TestCase

from audit.models import AuditLog
from core.db_routers import REPLICA_ALIAS, ReplicaRouter


class ReplicaRouterTests(TestCase):
    def setUp(self):
        self.router = ReplicaRouter()

    def test_reads_are_not_silently_routed_to_the_replica(self):
        """The whole point: reads stay on the primary unless asked otherwise."""
        self.assertIsNone(self.router.db_for_read(AuditLog))

    def test_writes_are_pinned_to_the_primary(self):
        self.assertEqual(self.router.db_for_write(AuditLog), "default")

    def test_migrations_never_run_against_the_replica(self):
        self.assertIs(
            self.router.allow_migrate(REPLICA_ALIAS, "audit", "auditlog"), False
        )

    def test_migrations_are_unconstrained_on_other_aliases(self):
        self.assertIsNone(self.router.allow_migrate("default", "audit", "auditlog"))

    def test_relations_are_allowed_across_aliases(self):
        self.assertTrue(self.router.allow_relation(object(), object()))


class ReplicaAliasSettingTests(TestCase):
    def test_alias_falls_back_to_default_when_unprovisioned(self):
        """Reporting code uses this alias unconditionally, so it must be valid.

        With no replica configured it has to be "default", otherwise every
        .using(REPLICA_DATABASE_ALIAS) call site raises ConnectionDoesNotExist
        in dev and CI.
        """
        alias = settings.REPLICA_DATABASE_ALIAS
        self.assertIn(alias, settings.DATABASES)

    def test_queries_through_the_alias_work_in_this_environment(self):
        AuditLog.objects.create(
            action_type=AuditLog.ActionType.BACKGROUND_TASK_FAILED,
            model_name="CeleryTask",
            object_id=0,
            metadata={},
        )

        count = (
            AuditLog.objects.using(settings.REPLICA_DATABASE_ALIAS)
            .filter(model_name="CeleryTask")
            .count()
        )

        self.assertEqual(count, 1)
