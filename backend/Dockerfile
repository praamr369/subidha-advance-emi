FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt gunicorn

COPY . /app

EXPOSE 8000
# gthread workers: the SSE realtime stream (/api/v1/realtime/stream/) holds a
# connection open for ~50s per browser tab; sync workers would be exhausted by
# a handful of open dashboards and starve the whole API.
CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--worker-class", "gthread", "--threads", "16", "--timeout", "120"]
