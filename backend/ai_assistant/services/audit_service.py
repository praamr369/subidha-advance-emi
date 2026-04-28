class AIAuditUnavailable(Exception):
    pass


def log_ai_query(*args, **kwargs):
    raise AIAuditUnavailable("AI query audit service is not active in Phase 8B.")
