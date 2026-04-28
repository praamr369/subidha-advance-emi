class AIRetrievalUnavailable(Exception):
    pass


def retrieve_chunks(*args, **kwargs):
    raise AIRetrievalUnavailable("AI retrieval is not active in Phase 8B.")
