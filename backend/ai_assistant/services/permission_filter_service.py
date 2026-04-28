def allowed_visibility_for_user(user):
    role = (getattr(user, "role", "") or "").strip().upper()
    if role == "ADMIN":
        return {"ADMIN_ONLY", "STAFF", "PARTNER", "CUSTOMER_PUBLIC", "PUBLIC"}
    return set()
