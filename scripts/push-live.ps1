# Push the current update branch to main and deploy it to the Hostinger VPS.
# Run from the repo root on the dev machine:  .\scripts\push-live.ps1
# Requires: SSH alias 'subidha-vps' (~/.ssh/config) and server scripts installed
# on the VPS (see scripts/server/README.md).
$ErrorActionPreference = "Stop"

Write-Host "==> [1/4] Verifying local branch is clean and pushed" -ForegroundColor Cyan
$dirty = git status --porcelain
if ($dirty) { Write-Host "Working tree has uncommitted changes:" -ForegroundColor Red; git status --short; exit 1 }
git push origin update

Write-Host "==> [2/4] Merging update -> main" -ForegroundColor Cyan
git fetch origin
git checkout main
git pull origin main
git merge --no-ff origin/update -m "release: merge update into main"
git push origin main
git checkout update

Write-Host "==> [3/4] Running safe deploy on the VPS (backup -> rehearse -> migrate -> restart)" -ForegroundColor Cyan
ssh subidha-vps "cd /var/www/subidha/app && ./scripts/server/deploy.sh"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deploy FAILED on the server. Production was protected by the rehearsal step." -ForegroundColor Red
    Write-Host "See the output above; rollback (if needed): ssh subidha-vps then ./scripts/server/restore.sh <backup-dir>" -ForegroundColor Yellow
    exit 1
}

Write-Host "==> [4/4] Done. Live version:" -ForegroundColor Green
ssh subidha-vps "cd /var/www/subidha/app && git log -1 --oneline"
