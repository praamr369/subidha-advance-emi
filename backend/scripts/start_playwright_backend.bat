@echo off
if "%DJANGO_SETTINGS_MODULE%"=="" set DJANGO_SETTINGS_MODULE=core.settings.playwright
if "%PLAYWRIGHT_DB_PATH%"=="" set PLAYWRIGHT_DB_PATH=playwright-smoke.sqlite3
if "%PLAYWRIGHT_SMOKE_META_PATH%"=="" set PLAYWRIGHT_SMOKE_META_PATH=playwright-smoke-meta.json
cd %~dp0\..

if "%PLAYWRIGHT_SKIP_BOOTSTRAP%"=="1" (
    echo [playwright-backend] PLAYWRIGHT_SKIP_BOOTSTRAP=1, skipping db migrate and seed.
    goto runserver
)

if exist "playwright-smoke-template.sqlite3" (
    echo [playwright-backend] Found playwright-smoke-template.sqlite3. Using it to skip migrations.
    copy /Y playwright-smoke-template.sqlite3 "%PLAYWRIGHT_DB_PATH%" >nul
    goto runserver
)

del /q "%PLAYWRIGHT_DB_PATH%" 2>nul
del /q "%PLAYWRIGHT_SMOKE_META_PATH%" 2>nul
python manage.py migrate --noinput --settings %DJANGO_SETTINGS_MODULE%
python manage.py seed_playwright_smoke --settings %DJANGO_SETTINGS_MODULE%

echo [playwright-backend] Caching DB as playwright-smoke-template.sqlite3
copy /Y "%PLAYWRIGHT_DB_PATH%" playwright-smoke-template.sqlite3 >nul

:runserver
python manage.py runserver 127.0.0.1:8100 --noreload --settings %DJANGO_SETTINGS_MODULE%
