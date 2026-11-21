#!/usr/bin/env bash
set -e

# ==============================================================================
# SUBIDHA CORE — Linux Desktop ERP Compiler (Tauri v2)
# ==============================================================================

echo "========================================================"
echo "🚀 SUBIDHA CORE — Compiling Linux Desktop App (Tauri v2)"
echo "========================================================"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${REPO_ROOT}/frontend"

# 1. Check for Rust / Cargo
if ! command -v cargo &> /dev/null; then
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    fi
fi

if ! command -v cargo &> /dev/null; then
    echo "❌ Rust (cargo) is not installed."
    echo "👉 Install Rust with: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"
    echo "👉 Then reload environment: source \$HOME/.cargo/env"
    exit 1
fi

echo "✅ Rust toolchain detected: $(cargo --version)"

# 2. Check for Linux WebKitGTK dev libraries
if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
    echo "⚠️  Missing webkit2gtk-4.1 development headers."
    echo "👉 Run on your Linux host: sudo apt update && sudo apt install -y libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev"
    exit 1
fi

echo "✅ WebKitGTK dev headers detected."

# 3. Install frontend node dependencies if needed
cd "${FRONTEND_DIR}"
if [ ! -d "node_modules/@tauri-apps" ]; then
    echo "📦 Installing Tauri CLI and packages..."
    npm install
fi

# 4. Clean Snap environment leaks if running from VS Code / Cursor terminal
unset GTK_PATH GTK_EXE_PREFIX GSETTINGS_SCHEMA_DIR GDK_PIXBUF_MODULE_FILE GDK_PIXBUF_MODULEDIR GIO_MODULE_DIR LOCPATH GTK_MODULES LD_LIBRARY_PATH
export XDG_DATA_DIRS="${XDG_DATA_DIRS_VSCODE_SNAP_ORIG:-/usr/local/share/:/usr/share/}"
export GDK_BACKEND=x11

# 5. Compile Desktop Application
echo "🔨 Compiling native Linux desktop binary..."
npm run tauri:build

echo ""
echo "========================================================"
echo "🎉 Linux Desktop Build Complete!"
echo "========================================================"
echo "Native Binary: ${FRONTEND_DIR}/src-tauri/target/release/subidha-admin"
echo "Installable Packages: ${FRONTEND_DIR}/src-tauri/target/release/bundle/"
echo "========================================================"
