// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // On modern Linux (GNOME 44+ / Wayland), GTK3 crashes when querying deprecated xsettings schemas.
    // Setting GDK_BACKEND to x11 avoids the missing GSettings antialiasing key crash.
    #[cfg(target_os = "linux")]
    {
        if std::env::var("GDK_BACKEND").is_err() {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }

    subidha_desktop_lib::run();
}
