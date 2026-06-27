from django.contrib import admin

from .models import FieldSuggestionMapping, HsnCode, PincodeLocation


@admin.register(PincodeLocation)
class PincodeLocationAdmin(admin.ModelAdmin):
    list_display = ("pincode", "city", "district", "state", "source", "hit_count")
    list_filter = ("source", "state")
    search_fields = ("pincode", "city", "district", "state")


@admin.register(HsnCode)
class HsnCodeAdmin(admin.ModelAdmin):
    list_display = ("code", "description", "gst_rate", "chapter", "is_active")
    list_filter = ("is_active", "chapter")
    search_fields = ("code", "description", "keywords")


@admin.register(FieldSuggestionMapping)
class FieldSuggestionMappingAdmin(admin.ModelAdmin):
    list_display = (
        "field_key",
        "input_normalized",
        "suggested_value",
        "source",
        "hit_count",
    )
    list_filter = ("field_key", "source")
    search_fields = ("input_normalized", "suggested_value", "suggested_label")
