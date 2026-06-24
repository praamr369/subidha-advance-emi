from django.contrib import messages
from subscriptions.services.reconciliation_service import (
    system_financial_health
)

from django.contrib import admin
from django import forms
from django.contrib.admin import AdminSite
from django.core.exceptions import ValidationError
from decimal import Decimal
from subscriptions.services.lucky_draw_service import reveal_and_execute_draw
from django.utils.html import format_html
from django.utils.safestring import mark_safe
from subscriptions.services.ledger_service import (
    emi_ledger,
    subscription_summary,
)
from api.v1.services.admin_dashboard_service import build_admin_dashboard
from subscriptions.admin_forms import PaymentAdminForm, LuckyDrawAdminForm

from .models import (
    Customer,
    Product,
    Batch,
    LuckyId,
    Subscription,
    Emi,
    Payment,
    LuckyDraw,
    EmiStatus,
    LuckyIdStatus,
    RecoveryCase,
    RecoveryStage,
)

# =====================================================
# LUCKY ID ADMIN FORM
# =====================================================

class LuckyIdAdminForm(forms.ModelForm):
    class Meta:
        model = LuckyId
        fields = "__all__"

    def clean_lucky_number(self):
        n = self.cleaned_data.get("lucky_number")
        if n is not None and (n < 0 or n > 99):
            raise ValidationError("Lucky number must be between 00 and 99")
        return n


# =====================================================
# SUBSCRIPTION ADMIN FORM
# =====================================================

class SubscriptionAdminForm(forms.ModelForm):
    class Meta:
        model = Subscription
        exclude = (
            "total_amount",
            "monthly_amount",
        )

    def clean(self):
        cleaned = super().clean()
        product = cleaned.get("product")
        tenure = cleaned.get("tenure_months")

        # Optional preview calculation (not saved here)
        if product and tenure:
            cleaned["total_amount_preview"] = product.base_price
            cleaned["monthly_amount_preview"] = (
                product.base_price / Decimal(tenure)
            ).quantize(Decimal("0.01"))

        return cleaned


# =====================================================
# CUSTOMER
# =====================================================

@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "phone", "kyc_status", "created_at")
    search_fields = ("name", "phone")
    list_filter = ("kyc_status",)
    readonly_fields = ("created_at",)

# =====================================================
# PRODUCT
# =====================================================

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "base_price", "created_at")
    search_fields = ("name",)
    readonly_fields = ("created_at",)


# =====================================================
# BATCH
# =====================================================

@admin.register(Batch)
class BatchAdmin(admin.ModelAdmin):
    list_display = ("id", "batch_code", "duration_months", "start_date")
    search_fields = ("batch_code",)


# =====================================================
# LUCKY ID
# =====================================================

@admin.register(LuckyId)
class LuckyIdAdmin(admin.ModelAdmin):
    list_display = (
        "batch",
        "lucky_number",
        "status",
        "created_at",
    )

    list_filter = ("batch", "status")
    search_fields = ("lucky_number",)

    def has_delete_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        if obj and obj.status != LuckyIdStatus.AVAILABLE:
            return False
        return super().has_change_permission(request, obj)

    def get_readonly_fields(self, request, obj=None):
        if obj:
            return ("batch", "lucky_number", "created_at")
        return ()





# =====================================================
# EMI INLINE (READ-ONLY)
# =====================================================




# =====================================================
# SUBSCRIPTION
# =====================================================

from django.contrib import admin
from django.utils.html import format_html

from subscriptions.models import Subscription, LuckyId


from subscriptions.services.ledger_service import (
    emi_ledger,
    subscription_summary,
)


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    

    list_display = (
        "id",
        "customer",
        "product",
        "plan_type",
        "batch",
        "lucky_id",
        "monthly_amount",
        "tenure_months",
        "status",
        "start_date",
    )

    list_filter = ("plan_type", "status", "batch")
    search_fields = ("customer__name", "customer__phone")
    ordering = ("-created_at",)

    # ✅ SINGLE readonly_fields definition
    readonly_fields = (
        "subscription_financial_summary",
        "emi_ledger_table",
        "total_amount",
        "monthly_amount",
        "created_at",
        "download_statement",
    )

    # ❌ REMOVE EMI INLINE (ledger replaces it)
    # inlines = [EmiInline]

    # ===============================
    # FINANCIAL SUMMARY
    # ===============================
    def subscription_financial_summary(self, obj):
        summary = subscription_summary(obj)

        return format_html(
            """
            <table style="width:100%; border-collapse: collapse;">
                <tr><th align="left">Total Amount</th><td>₹{}</td></tr>
                <tr><th align="left">Paid</th><td>₹{}</td></tr>
                <tr><th align="left">Waived</th><td>₹{}</td></tr>
                <tr><th align="left"><b>Balance</b></th><td><b>₹{}</b></td></tr>
                <tr><th align="left">Status</th><td>{}</td></tr>
            </table>
            """,
            summary["total_due"],
            summary["paid"],
            summary["waived"],
            summary["balance"],
            summary["status"],
        )

    subscription_financial_summary.short_description = "Financial Summary"

    # ===============================
    # EMI LEDGER TABLE
    # ===============================
    def emi_ledger_table(self, obj):
        rows = emi_ledger(obj)

        html = """
        <table style="width:100%; border-collapse: collapse;" border="1">
            <tr>
                <th>Month</th>
                <th>Due Date</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
            </tr>
        """

        for r in rows:
            html += f"""
            <tr>
                <td>{r['month']}</td>
                <td>{r['due_date']}</td>
                <td>₹{r['amount']}</td>
                <td>₹{r['paid']}</td>
                <td>₹{r['balance']}</td>
                <td>{r['status']}</td>
            </tr>
            """

        html += "</table>"
        return mark_safe(html)

    emi_ledger_table.short_description = "EMI Ledger"

    # ===============================
    # LUCKY ID FILTERING
    # ===============================
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "lucky_id":
            batch_id = request.GET.get("batch") or request.POST.get("batch")

            if batch_id:
                kwargs["queryset"] = LuckyId.objects.filter(
                    batch_id=batch_id,
                    status=LuckyIdStatus.AVAILABLE,
                )
            else:
                kwargs["queryset"] = LuckyId.objects.none()

        return super().formfield_for_foreignkey(db_field, request, **kwargs)
    
    def download_statement(self, obj):
        return format_html(
        '<a class="button" href="/admin/subscriptions/subscription/{}/statement/">Download Statement</a>',
        obj.id,
    )

    download_statement.short_description = "Customer Statement"

    def has_delete_permission(self, request, obj=None):
        return False


# =====================================================
# EMI (READ-ONLY LEDGER)
# =====================================================

@admin.register(Emi)
class EmiAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "subscription",
        "month_no",
        "due_date",
        "amount",
        "status",
    )

    readonly_fields = list_display

    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None): return False


# =====================================================
# PAYMENT
# =====================================================

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    form = PaymentAdminForm
    list_display = (
        "id",
        "customer",
        "emi",
        "amount",
        "method",
        "payment_date",
        "receipt_no",
    )
    readonly_fields = ("created_at",)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "emi":
            customer_id = request.GET.get("customer") or request.POST.get("customer")

            qs = Emi.objects.filter(status=EmiStatus.PENDING)

            if customer_id:
                qs = qs.filter(subscription__customer_id=customer_id)

            kwargs["queryset"] = qs.select_related(
                "subscription__customer",
                "subscription__product",
            )

        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def receipt_no(self, obj):
         from subscriptions.services.receipt_service import generate_receipt_no
         return generate_receipt_no(obj)

         receipt_no.short_description = "Receipt No"    

    def save_model(self, request, obj, form, change):
        if obj.emi:
            if obj.emi.status in [EmiStatus.PAID, EmiStatus.WAIVED]:
                raise ValidationError("Cannot pay PAID / WAIVED EMI")
        super().save_model(request, obj, form, change)

    def has_delete_permission(self, request, obj=None):
        return False
    
    


# =====================================================
# LUCKY DRAW (AUDIT)
# =====================================================







# =====================================================
# LUCKY DRAW (PRODUCTION SAFE)
# =====================================================

@admin.register(LuckyDraw)
class LuckyDrawAdmin(admin.ModelAdmin):
    form = LuckyDrawAdminForm

    list_display = ("id", "batch", "draw_month", "winner_lucky_id", "is_revealed")
    actions = ["reveal_draw_action"]

    readonly_fields = (
        "committed_hash",
        "winner_lucky_id",
        "is_revealed",
        "created_at",
    )

    # ----------------------------------------
    # Reveal Action (SAFE VERSION)
    # ----------------------------------------
    def reveal_draw_action(self, request, queryset):

        if queryset.count() != 1:
            self.message_user(
                request,
                "Select exactly ONE draw to reveal.",
                level=messages.ERROR,
            )
            return

        draw = queryset.first()

        if draw.is_revealed:
            self.message_user(
                request,
                "This draw is already revealed.",
                level=messages.ERROR,
            )
            return

        seed = request.POST.get("revealed_seed")

        if not seed:
            self.message_user(
                request,
                "Reveal seed must be provided.",
                level=messages.ERROR,
            )
            return

        try:
            result = reveal_and_execute_draw(
                draw_id=draw.id,
                revealed_seed=seed,
            )

            self.message_user(
                request,
                f"Winner Lucky ID: {result['winner_lucky_number']} | "
                f"Waived Amount: ₹{result['waived_amount']}",
                level=messages.SUCCESS,
            )

        except ValidationError as e:
            self.message_user(
                request,
                f"Error: {str(e)}",
                level=messages.ERROR,
            )

    reveal_draw_action.short_description = "Reveal selected Lucky Draw (requires seed)"
    def get_actions(self, request):
        actions = super().get_actions(request)
        if not request.user.is_superuser:
            actions.pop("reveal_draw_action", None)
        return actions

    # ----------------------------------------
    # Lock revealed draws
    # ----------------------------------------
    def has_change_permission(self, request, obj=None):
        if obj and obj.is_revealed:
            return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        return False


# =====================================================
# RECOVERY CASE
# =====================================================

@admin.register(RecoveryCase)
class RecoveryCaseAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "subscription",
        "stage",
        "assigned_to",
        "overdue_amount",
        "settled_amount",
        "first_overdue_date",
    )
    list_filter = ("stage", "assigned_to", "first_overdue_date")
    search_fields = ("subscription__customer__name", "subscription__id")
    readonly_fields = ("created_at", "updated_at", "aging_days", "aging_bucket")
    fieldsets = (
        ("Subscription", {"fields": ("subscription",)}),
        ("Recovery Status", {"fields": ("stage", "assigned_to")}),
        ("Overdue Info", {"fields": ("overdue_amount", "overdue_emis", "first_overdue_date")}),
        ("Timeline", {"fields": ("notice_sent_at", "field_visit_at", "legal_at", "last_contact_at")}),
        ("Settlement", {"fields": ("settled_amount", "settlement_type", "settled_at")}),
        ("Metadata", {"fields": ("notes", "aging_days", "aging_bucket", "created_at", "updated_at")}),
    )

# =====================================================
# CUSTOM ADMIN SITE
# =====================================================

class SubidhaAdminSite(AdminSite):
    site_header = "SUBIDHA CORE – Business Control"
    site_title = "Subidha Admin"
    index_title = "Live Business Dashboard"

    def each_context(self, request):
        context = super().each_context(request)
        context["dashboard"] = admin_dashboard_stats()
        context["financial_health"] = system_financial_health()
        return context


admin_site = SubidhaAdminSite(name="subidha_admin")

admin_site.register(Customer, CustomerAdmin)
admin_site.register(Product, ProductAdmin)
admin_site.register(Batch, BatchAdmin)
admin_site.register(Subscription, SubscriptionAdmin)
admin_site.register(Emi, EmiAdmin)
admin_site.register(Payment, PaymentAdmin)
admin_site.register(LuckyDraw, LuckyDrawAdmin)