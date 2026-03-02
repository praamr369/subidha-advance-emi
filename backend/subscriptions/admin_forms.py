from django import forms
from django.core.exceptions import ValidationError

from subscriptions.models import Payment,LuckyDraw


class PaymentAdminForm(forms.ModelForm):
    class Meta:
        model = Payment
        fields = "__all__"

    def clean_amount(self):
        amount = self.cleaned_data.get("amount")
        emi = self.cleaned_data.get("emi")

        if emi and amount:
            if amount > emi.balance_amount():
                raise ValidationError(
                    f"Maximum payable amount is ₹{emi.balance_amount()}"
                )

        return amount
    


import hashlib
import secrets

class LuckyDrawAdminForm(forms.ModelForm):
    class Meta:
        model = LuckyDraw
        fields = ("batch", "draw_month", "committed_hash")

    def clean(self):
        cleaned = super().clean()
        batch = cleaned.get("batch")
        draw_date = cleaned.get("draw_date")

        if not batch or not draw_date:
            return cleaned

        # Prevent duplicate draw per batch per month
        qs = LuckyDraw.objects.filter(
            batch=batch,
            draw_date__year=draw_date.year,
            draw_date__month=draw_date.month,
        )

        if self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)

        if qs.exists():
            raise ValidationError(
                f"A lucky draw already exists for {batch} in "
                f"{draw_date.strftime('%B %Y')}."
            )

        # 🔐 AUTO GENERATE COMMIT HASH IF NOT PROVIDED
        if not cleaned.get("committed_hash"):
            seed = secrets.token_hex(16)
            committed_hash = hashlib.sha256(seed.encode()).hexdigest()
            cleaned["committed_hash"] = committed_hash

        return cleaned