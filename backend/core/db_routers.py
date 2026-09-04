"""Database routing for the optional read-only reporting replica.

Deliberately *not* a read/write splitter. The usual pattern — send every read
to the standby — is wrong for this application:

* ``ATOMIC_REQUESTS`` is on, so a request routinely reads rows it has just
  written in the same transaction. A standby cannot see them.
* Replication lag is unbounded under load. A trial balance, ledger export or
  daily close assembled from a lagging standby can report a combination of
  figures that never existed together, and it looks like a real answer.

So reads stay on the primary unless a call site opts in explicitly::

    from django.conf import settings

    rows = (JournalEntry.objects
            .using(settings.REPLICA_DATABASE_ALIAS)
            .filter(...))

``REPLICA_DATABASE_ALIAS`` is ``"replica"`` when one is provisioned and
``"default"`` when not, so the same code runs unchanged in dev, CI and any
environment without a standby. An explicit ``.using()`` bypasses routers
entirely, which is what makes the opt-in work.

This router exists to make the standby safe: it refuses writes and keeps
migrations off it.
"""
from __future__ import annotations

REPLICA_ALIAS = "replica"


class ReplicaRouter:
    """Keep writes and migrations off the read-only replica."""

    def db_for_read(self, model, **hints):
        # Reads default to the primary. Reporting opts in with .using().
        return None

    def db_for_write(self, model, **hints):
        # Never the replica: it is physically read-only, and routing a write
        # there would surface as a confusing runtime error rather than a
        # clear one.
        return "default"

    def allow_relation(self, obj1, obj2, **hints):
        # Same database, same schema — cross-alias relations are fine.
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        # A streaming replica receives schema changes through replication.
        # Running migrations against it directly would fail, or worse, diverge.
        if db == REPLICA_ALIAS:
            return False
        return None
