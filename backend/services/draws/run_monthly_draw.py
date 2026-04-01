from subscriptions.services.lucky_draw_service import reveal_and_execute_draw


def run_monthly_draw(*, draw_id: int, revealed_seed: str, performed_by=None):
    """Execute monthly draw in idempotent and audited manner."""
    return reveal_and_execute_draw(
        draw_id=draw_id,
        revealed_seed=revealed_seed,
        performed_by=performed_by,
    )
