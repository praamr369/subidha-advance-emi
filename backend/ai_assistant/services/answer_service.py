class AIAnswerUnavailable(Exception):
    pass


def answer_query(*args, **kwargs):
    raise AIAnswerUnavailable("AI answer generation is not active in Phase 8B.")
