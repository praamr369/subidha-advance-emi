from django.db import migrations

DEFAULT_LEAVE_TYPES = [
    {
        "code": "CL",
        "name": "Casual Leave",
        "is_paid": True,
        "annual_allowance_days": "12.0",
    },
    {
        "code": "SL",
        "name": "Sick Leave",
        "is_paid": True,
        "annual_allowance_days": "12.0",
    },
    {
        "code": "EL",
        "name": "Earned Leave",
        "is_paid": True,
        "annual_allowance_days": "15.0",
    },
    {
        "code": "LOP",
        "name": "Leave Without Pay",
        "is_paid": False,
        "annual_allowance_days": None,
    },
]


def seed_leave_types(apps, schema_editor):
    LeaveType = apps.get_model("accounting", "LeaveType")
    for entry in DEFAULT_LEAVE_TYPES:
        LeaveType.objects.get_or_create(
            code=entry["code"],
            defaults={
                "name": entry["name"],
                "is_paid": entry["is_paid"],
                "annual_allowance_days": entry["annual_allowance_days"],
                "is_active": True,
            },
        )


def unseed_leave_types(apps, schema_editor):
    LeaveType = apps.get_model("accounting", "LeaveType")
    LeaveType.objects.filter(
        code__in=[entry["code"] for entry in DEFAULT_LEAVE_TYPES]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounting", "0049_compliance_phase3_pay_rent_contract"),
    ]

    operations = [
        migrations.RunPython(seed_leave_types, unseed_leave_types),
    ]
