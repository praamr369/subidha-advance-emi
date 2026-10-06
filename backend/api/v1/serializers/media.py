def serialize_media_url(request, field_file) -> str | None:
    if not field_file:
        return None

    if isinstance(field_file, str):
        image_url = field_file
    else:
        try:
            image_url = field_file.url
        except (AttributeError, ValueError):
            return None

    if request is None:
        return image_url

    if image_url.startswith("http://") or image_url.startswith("https://"):
        return image_url

    return request.build_absolute_uri(image_url)
