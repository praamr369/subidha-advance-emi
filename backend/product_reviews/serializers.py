from rest_framework import serializers

from .models import ProductReview, ReviewPhoto


class ReviewPhotoSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = ReviewPhoto
        fields = ["id", "file", "file_url"]

    def get_file_url(self, obj):
        req = self.context.get("request")
        if obj.file and req:
            return req.build_absolute_uri(obj.file.url)
        return str(obj.file) if obj.file else None


class ProductReviewSerializer(serializers.ModelSerializer):
    photos = ReviewPhotoSerializer(many=True, read_only=True)

    class Meta:
        model = ProductReview
        fields = [
            "id",
            "reviewer_name",
            "rating",
            "title",
            "body",
            "is_verified_purchase",
            "photos",
            "created_at",
        ]
        read_only_fields = ["id", "is_verified_purchase", "created_at"]


class SubmitReviewSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    reviewer_name = serializers.CharField(max_length=120)
    reviewer_email = serializers.EmailField(required=False, allow_blank=True)
    rating = serializers.IntegerField(min_value=1, max_value=5)
    title = serializers.CharField(max_length=200, required=False, allow_blank=True)
    body = serializers.CharField(required=False, allow_blank=True)


class AdminReviewSerializer(serializers.ModelSerializer):
    photos = ReviewPhotoSerializer(many=True, read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_code = serializers.CharField(source="product.product_code", read_only=True)

    class Meta:
        model = ProductReview
        fields = [
            "id",
            "product",
            "product_name",
            "product_code",
            "customer",
            "reviewer_name",
            "reviewer_email",
            "rating",
            "title",
            "body",
            "is_verified_purchase",
            "status",
            "synced_google",
            "synced_facebook",
            "synced_whatsapp",
            "synced_instagram",
            "admin_note",
            "moderated_at",
            "photos",
            "created_at",
        ]
        read_only_fields = [
            "id", "product_name", "product_code", "is_verified_purchase",
            "synced_google", "synced_facebook", "synced_whatsapp", "synced_instagram",
            "moderated_at", "created_at",
        ]
