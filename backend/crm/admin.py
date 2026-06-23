from django.contrib import admin

from crm.models import PartyInteraction, PartyLink, PartyMaster


@admin.register(PartyMaster)
class PartyMasterAdmin(admin.ModelAdmin):
    list_display = ("party_no", "display_name", "party_kind", "primary_phone", "primary_email", "is_active")
    list_filter = ("party_kind", "is_active")
    search_fields = ("party_no", "display_name", "primary_phone", "primary_email")


@admin.register(PartyLink)
class PartyLinkAdmin(admin.ModelAdmin):
    list_display = ("party", "role_type", "source_model", "source_pk", "source_reference", "is_primary")
    list_filter = ("role_type", "is_primary", "source_model")
    search_fields = ("party__party_no", "party__display_name", "source_reference")


@admin.register(PartyInteraction)
class PartyInteractionAdmin(admin.ModelAdmin):
    list_display = ("party", "interaction_type", "status", "subject", "next_follow_up_at", "created_by")
    list_filter = ("interaction_type", "status")
    search_fields = ("party__party_no", "party__display_name", "subject", "note")



from crm.models import CustomerInteraction, FollowUpTask, Lead, Opportunity


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "phone", "source", "stage", "created_at")
    list_filter = ("source", "stage", "interested_plan_type")
    search_fields = ("name", "phone", "email")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("-created_at",)


@admin.register(Opportunity)
class OpportunityAdmin(admin.ModelAdmin):
    list_display = ("id", "lead", "stage", "created_at")
    list_filter = ("stage",)
    search_fields = ("lead__name", "lead__phone")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("-created_at",)


@admin.register(FollowUpTask)
class FollowUpTaskAdmin(admin.ModelAdmin):
    list_display = ("id", "lead", "customer", "status", "due_at", "assigned_to", "created_at")
    list_filter = ("status",)
    search_fields = ("lead__name", "lead__phone")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("due_at",)


@admin.register(CustomerInteraction)
class CustomerInteractionAdmin(admin.ModelAdmin):
    list_display = ("id", "customer", "lead", "created_at")
    list_filter = ()
    search_fields = ("customer__phone",)
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)
