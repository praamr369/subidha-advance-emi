# Push the current update branch to main and deploy it to the Hostinger VPS.
# Run from the repo root on the dev machine:  .\scripts\push-live.ps1
# Requires: SSH alias 'subidha-vps' (~/.ssh/config) and server scripts installed
# on the VPS (see scripts/server/README.md).
$ErrorActionPreference = "Stop"

Write-Host "==> [1/5] Verifying local branch is clean" -ForegroundColor Cyan
$dirty = git status --porcelain
if ($dirty) { Write-Host "Working tree has uncommitted changes:" -ForegroundColor Red; git status --short; exit 1 }

Write-Host "==> [2/5] Running pre-flight verification gates (all tests must be green)" -ForegroundColor Cyan
Write-Host "    [2a/5] Frontend: check routes..."
npm --prefix frontend run check:routes
if ($LASTEXITCODE -ne 0) { Write-Host "!!! Route check failed. Deploy aborted." -ForegroundColor Red; exit 1 }

Write-Host "    [2b/5] Frontend: linting..."
npm --prefix frontend run lint
if ($LASTEXITCODE -ne 0) { Write-Host "!!! Linting failed. Deploy aborted." -ForegroundColor Red; exit 1 }

Write-Host "    [2c/5] Frontend: typechecking..."
npm --prefix frontend run typecheck
if ($LASTEXITCODE -ne 0) { Write-Host "!!! Typecheck failed. Deploy aborted." -ForegroundColor Red; exit 1 }

Write-Host "    [2d/5] Frontend: unit tests..."
npm --prefix frontend run test:unit
if ($LASTEXITCODE -ne 0) { Write-Host "!!! Unit tests failed. Deploy aborted." -ForegroundColor Red; exit 1 }

Write-Host "    [2e/5] Backend: system check & migration drift..."
$py = if (Test-Path "backend\.venv\Scripts\python.exe") { "backend\.venv\Scripts\python.exe" } else { "backend/venv/bin/python" }
& $py backend\manage.py check --settings=core.settings.test
if ($LASTEXITCODE -ne 0) { Write-Host "!!! Django check failed. Deploy aborted." -ForegroundColor Red; exit 1 }
& $py backend\manage.py makemigrations --check --dry-run --settings=core.settings.test
if ($LASTEXITCODE -ne 0) { Write-Host "!!! Migration drift detected. Deploy aborted." -ForegroundColor Red; exit 1 }

Write-Host "==> All test gates GREEN!" -ForegroundColor Green

Write-Host "==> [3/5] Pushing update branch and merging update -> main" -ForegroundColor Cyan
git push origin update
git fetch origin
git checkout main
git pull origin main
git merge --no-ff origin/update -m "release: merge update into main"
git push origin main
git checkout update

Write-Host "==> [4/5] Running safe deploy on the VPS (backup -> rehearse -> build -> migrate -> restart)" -ForegroundColor Cyan
ssh subidha-vps "cd /var/www/subidha/app && ./scripts/server/deploy.sh"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deploy FAILED on the server. Production was protected." -ForegroundColor Red
    Write-Host "See the output above; rollback (if needed): ssh subidha-vps then ./scripts/server/restore.sh <backup-dir>" -ForegroundColor Yellow
    exit 1
}

Write-Host "==> [5/5] Done. Live version:" -ForegroundColor Green
ssh subidha-vps "cd /var/www/subidha/app && git log -1 --oneline"
