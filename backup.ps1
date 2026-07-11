# One-click VPS → local backup
# Usage: .\backup.ps1
# Requires: ssh alias 'subidha-vps' already configured in ~/.ssh/config

$LocalDest = "D:\subidha-backup"
$RemoteMediaPath = "/var/www/subidha/backend/media/"

if (-not (Test-Path $LocalDest)) {
    New-Item -ItemType Directory -Force -Path $LocalDest | Out-Null
    Write-Host "Created $LocalDest"
}

Write-Host "Starting backup: VPS media → $LocalDest"
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

# rsync: archive mode, compress, delete locally removed files, show progress
$rsyncArgs = @(
    "-avz",
    "--delete",
    "--progress",
    "subidha-vps:$RemoteMediaPath",
    "$LocalDest\"
)

& rsync $rsyncArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Backup complete." -ForegroundColor Green
    Write-Host "Files saved to: $LocalDest"
} else {
    Write-Host ""
    Write-Host "Backup failed (rsync exit code $LASTEXITCODE)." -ForegroundColor Red
    Write-Host "Check your SSH alias and VPS connectivity."
    exit 1
}
