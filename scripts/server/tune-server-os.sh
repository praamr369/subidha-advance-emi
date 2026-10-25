#!/usr/bin/env bash
# ==============================================================================
# SUBIDHA CORE - Linux Kernel & System OS Tuning for High Concurrency (1000+ Users)
# Usage:
#   sudo ./scripts/server/tune-server-os.sh --status   # Inspect current settings
#   sudo ./scripts/server/tune-server-os.sh --apply    # Safely apply tuned values
# ==============================================================================
set -euo pipefail

SYSCTL_CONF="/etc/sysctl.d/99-subidha-high-concurrency.conf"
LIMITS_CONF="/etc/security/limits.d/99-subidha.conf"

note() { echo "==> $*"; }
warn() { echo "[WARN] $*"; }
die()  { echo "!!! $*" >&2; exit 1; }

check_status() {
    echo "==================================================================="
    echo "SUBIDHA CORE - Server OS High-Concurrency Tuning Status"
    echo "==================================================================="
    echo "1. Socket Listen Backlog (net.core.somaxconn):"
    echo "   Current: $(sysctl -n net.core.somaxconn 2>/dev/null || echo 'N/A') (Target: 65535)"
    echo "2. TCP SYN Backlog (net.ipv4.tcp_max_syn_backlog):"
    echo "   Current: $(sysctl -n net.ipv4.tcp_max_syn_backlog 2>/dev/null || echo 'N/A') (Target: 65535)"
    echo "3. System File Descriptors (fs.file-max):"
    echo "   Current: $(sysctl -n fs.file-max 2>/dev/null || echo 'N/A') (Target: 2097152)"
    echo "4. Local Ephemeral Port Range (net.ipv4.ip_local_port_range):"
    echo "   Current: $(sysctl -n net.ipv4.ip_local_port_range 2>/dev/null || echo 'N/A') (Target: 1024 65535)"
    echo "5. TCP TIME_WAIT Reuse (net.ipv4.tcp_tw_reuse):"
    echo "   Current: $(sysctl -n net.ipv4.tcp_tw_reuse 2>/dev/null || echo 'N/A') (Target: 1)"
    echo "6. User Open File Limit (ulimit -n):"
    echo "   Current: $(ulimit -n) (Target: >= 65535)"
    echo "==================================================================="
}

apply_tuning() {
    [[ $EUID -eq 0 ]] || die "This script must be run as root (sudo)."

    note "Applying high-concurrency kernel sysctl parameters to $SYSCTL_CONF"
    cat << 'EOF' > "$SYSCTL_CONF"
# Subidha Core High-Concurrency Kernel Tuning (1,000+ Concurrent Users)
# Prevents connection drops, socket backlog overflow, and port starvation.

# Increase maximum socket listen backlog for Gunicorn & Nginx
net.core.somaxconn = 65535

# Increase TCP SYN backlog for rapid connection bursts
net.ipv4.tcp_max_syn_backlog = 65535

# Maximum file handles across the entire system
fs.file-max = 2097152

# Ephemeral port range for outbound connections (PgBouncer, Redis, upstream)
net.ipv4.ip_local_port_range = 1024 65535

# Reuse sockets in TIME_WAIT state for new outgoing connections
net.ipv4.tcp_tw_reuse = 1

# Reduce TIME_WAIT duration to free sockets quickly
net.ipv4.tcp_fin_timeout = 15

# Increase max pending network packets
net.core.netdev_max_backlog = 16384
EOF

    note "Loading new sysctl settings..."
    sysctl -p "$SYSCTL_CONF" >/dev/null

    note "Applying file descriptor limits to $LIMITS_CONF"
    cat << 'EOF' > "$LIMITS_CONF"
# Subidha Core File Descriptor Limits
subidha          soft    nofile          65535
subidha          hard    nofile          65535
postgres         soft    nofile          65535
postgres         hard    nofile          65535
root             soft    nofile          65535
root             hard    nofile          65535
*                soft    nofile          65535
*                hard    nofile          65535
EOF

    note "Tuning applied successfully."
    check_status
}

case "${1:-}" in
    --apply)
        apply_tuning
        ;;
    --status|"")
        check_status
        ;;
    *)
        echo "Usage: $0 [--status | --apply]"
        exit 1
        ;;
esac
