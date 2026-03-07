from __future__ import annotations

from typing import Optional

from subscriptions.models import Customer


def get_customer_by_phone(phone: str) -> Optional[Customer]:
  return Customer.objects.filter(phone=phone).first()


def get_customer_by_user_id(user_id: int) -> Optional[Customer]:
  return Customer.objects.filter(user_id=user_id).first()

