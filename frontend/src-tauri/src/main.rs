// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Linux WebKitGTK High-Performance Rendering & Stability Tuning
    #[cfg(target_os = "linux")]
    {
        // 1. Force X11 backend to avoid GNOME Wayland xsettings deprecation crashes
        if std::env::var("GDK_BACKEND").is_err() {
            std::env::set_var("GDK_BACKEND", "x11");
        }
        // 2. Eliminate WebKitGTK DMA-BUF IPC stutter / 15 FPS frame drops on X11 / Xwayland:
        // Disabling DMA-BUF forces the fast shared-memory / OpenGL pipeline (60 FPS smooth rendering)
        if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        // 3. Force hardware-accelerated GPU compositing to prevent CPU raster fallback
        if std::env::var("WEBKIT_FORCE_COMPOSITING_MODE").is_err() {
            std::env::set_var("WEBKIT_FORCE_COMPOSITING_MODE", "1");
        }
    }

    subidha_desktop_lib::run();
}
