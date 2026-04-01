from rest_framework.throttling import AnonRateThrottle


class ForgotPasswordThrottle(AnonRateThrottle):
    scope = "forgot_password"


class ResetPasswordThrottle(AnonRateThrottle):
    scope = "reset_password"


class ResendPasswordResetOtpThrottle(AnonRateThrottle):
    scope = "resend_password_reset_otp"