class AIEmbeddingUnavailable(Exception):
    pass


def embed_chunks(*args, **kwargs):
    raise AIEmbeddingUnavailable("AI embeddings are not active in Phase 8B.")
