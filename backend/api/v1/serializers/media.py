def serialize_media_url(request, field_file) -> str | None:
    if not field_file:
        return None

    try:
        image_url = field_file.url
    except (AttributeError, ValueError):
        return None

    if request is None:
        return image_url

    return request.build_absolute_uri(image_url)
