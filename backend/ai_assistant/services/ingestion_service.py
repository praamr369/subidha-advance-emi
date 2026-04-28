class AIIngestionUnavailable(Exception):
    pass


def ingest_source(*args, **kwargs):
    raise AIIngestionUnavailable("AI ingestion is not active in Phase 8B.")
