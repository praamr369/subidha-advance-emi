from subscriptions.services.lucky_draw_service import waive_future_emis


def apply_winner_waiver(*, subscription, draw_month: int):
    """Waive only future pending EMIs for winning subscription."""
    return waive_future_emis(subscription=subscription, draw_month=draw_month)
