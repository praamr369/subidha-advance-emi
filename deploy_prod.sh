#!/bin/bash
echo "Starting Production Setup..."

# Ensure we are in the project root
cd "$(dirname "$0")"

echo "1. Collecting static files..."
source backend/.venv/bin/activate
cd backend
python manage.py collectstatic --noinput

echo "2. Applying migrations..."
python manage.py migrate

echo "3. Bootstrapping initial production configurations..."
python manage.py loaddata fixtures/production_bootstrap.json
python manage.py bootstrap_accounting_setup

echo "4. Creating your Superuser (Owner account)..."
python manage.py createsuperuser

echo "Deployment backend setup complete!"
echo "Make sure to run your Gunicorn server and Next.js server now."
