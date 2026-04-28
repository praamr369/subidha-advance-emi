class AIChunkingUnavailable(Exception):
    pass


def chunk_source_text(*args, **kwargs):
    raise AIChunkingUnavailable("AI chunking is not active in Phase 8B.")
