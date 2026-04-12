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

