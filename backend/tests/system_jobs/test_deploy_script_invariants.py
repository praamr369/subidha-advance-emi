"""Structural guards on scripts/server/deploy.sh.

The deploy pipeline broke on 2026-09-06 and nobody knew until a deploy was
attempted: the PgBouncer cutover pointed DB_HOST/DB_PORT at the pooler, whose
[databases] section lists only "subidha", while the rehearsal step creates an
ad-hoc database and migrates it. Every deploy after the cutover died with

    FATAL: no such database: subidha_rehearsal_<stamp>

before a single migration ran — and because deploy.sh reports anything failing
there as "Migration FAILED on the rehearsal copy", a healthy deploy aborted
looking like a bad migration.

Two individually correct changes were incompatible in combination. No amount of
reading either file finds that, and no test in this suite touched the deploy
path, so the only detector was attempting a deploy.

TESTING LIMITATION, stated plainly: these are text assertions over a shell
script. They cannot prove the deploy works — only a real (or rehearsed) deploy
can. What they do is fail loudly if someone removes the specific coupling that
already broke once, which is the failure mode with a track record here.
"""
from pathlib import Path

from django.test import SimpleTestCase

DEPLOY_SH = (
    Path(__file__).resolve().parents[3] / "scripts" / "server" / "deploy.sh"
)


class DeployRehearsalTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.source = DEPLOY_SH.read_text(encoding="utf-8")

    def test_the_deploy_script_is_where_the_tests_think_it_is(self):
        """Guards the other tests: a moved script would make them vacuous."""
        self.assertTrue(
            DEPLOY_SH.is_file(), f"deploy.sh not found at {DEPLOY_SH}"
        )

    def test_the_rehearsal_overrides_the_host_and_port_with_the_database(self):
        """The exact coupling that broke.

        Overriding DB_NAME alone sends the rehearsal at whatever DB_HOST points
        to. Once that is a connection pooler, the ad-hoc database is not in its
        [databases] list and the connection is refused before any migration
        runs. The three overrides must travel together.
        """
        self.assertIn("DB_NAME=\"$REHEARSAL_DB\"", self.source)
        self.assertIn("DB_HOST=\"$REHEARSAL_DB_HOST\"", self.source)
        self.assertIn("DB_PORT=\"$REHEARSAL_DB_PORT\"", self.source)

    def test_the_rehearsal_defaults_to_the_cluster_not_the_pooler(self):
        """6432 is PgBouncer; the rehearsal must default to Postgres itself."""
        self.assertIn('REHEARSAL_DB_PORT="${REHEARSAL_DB_PORT:-5432}"', self.source)
        self.assertNotIn("REHEARSAL_DB_PORT:-6432", self.source)

    def test_production_is_backed_up_before_the_code_is_fetched(self):
        """The rollback point has to predate the change it rolls back.

        Ordering, not presence, is the property: a backup taken after the new
        code is checked out is not a rollback point for that deploy.
        """
        backup_at = self.source.find("backup.sh")
        fetch_at = self.source.find("git fetch")
        self.assertNotEqual(backup_at, -1, "the pre-update backup step is gone")
        self.assertNotEqual(fetch_at, -1, "the code fetch step is gone")
        self.assertLess(
            backup_at,
            fetch_at,
            "the backup must be taken before new code is fetched, or the "
            "rollback point belongs to the wrong version",
        )

    def test_a_failed_rehearsal_reverts_the_checkout_and_stops(self):
        """Production must not receive code whose migrations were not rehearsed."""
        self.assertIn("Migration FAILED on the rehearsal copy", self.source)
        self.assertIn('git checkout -q "$OLD_COMMIT"', self.source)

    def test_the_health_check_does_not_use_the_loopback_address(self):
        """Another bug with a track record.

        Django validates the Host header against DJANGO_ALLOWED_HOSTS, so
        hitting 127.0.0.1:8000 returns 400 regardless of application health.
        The PgBouncer setup script used exactly that, so its cutover check
        could never pass and always rolled itself back.
        """
        self.assertNotIn("127.0.0.1:8000", self.source)
