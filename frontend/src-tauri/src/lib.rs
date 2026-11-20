use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct DesktopSystemInfo {
    pub app_name: String,
    pub version: String,
    pub os: String,
    pub is_desktop: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OfflineSyncStatus {
    pub is_online: bool,
    pub queued_transactions: u32,
    pub last_synced_at: Option<String>,
}

#[tauri::command]
fn get_system_info() -> DesktopSystemInfo {
    DesktopSystemInfo {
        app_name: "SUBIDHA CORE".to_string(),
        version: "0.1.0".to_string(),
        os: std::env::consts::OS.to_string(),
        is_desktop: true,
    }
}

#[tauri::command]
fn get_offline_status() -> OfflineSyncStatus {
    OfflineSyncStatus {
        is_online: true,
        queued_transactions: 0,
        last_synced_at: None,
    }
}

#[tauri::command]
fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn toggle_maximize_window(window: tauri::Window) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
fn close_window(window: tauri::Window) {
    let _ = window.close();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_offline_status,
            minimize_window,
            toggle_maximize_window,
            close_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running SUBIDHA CORE desktop application");
}
