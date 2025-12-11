mod types;
mod autoclicker;
mod macro_player;
mod overlay;
mod recorder;
mod app_state;

use tauri::{Manager, State, WindowEvent};
use tauri_plugin_global_shortcut::Builder as GlobalShortcutBuilder;

pub use autoclicker::{start_autoclicker, stop_autoclicker};
pub use macro_player::{play_macro, stop_macro_playback};
pub use overlay::{
    close_overlay_window,
    disable_overlay_windows,
    enable_overlay_windows,
    resize_overlay_window,
    sync_overlay_windows,
};
pub use recorder::{start_recording, stop_recording};

use app_state::AppState;
use types::FrontendStatus;

#[tauri::command]
fn app_status(state: State<'_, AppState>) -> FrontendStatus {
    let recorder = state.recorder.lock();
    let autoclicker = state.autoclicker.lock();
    let buffered_events = recorder.events.lock().len();

    FrontendStatus {
        recording: recorder.active,
        buffered_events,
        autoclicker_running: autoclicker.active,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(GlobalShortcutBuilder::new().build())
        .manage(AppState::default())
        .setup(|app| {
            let app_handle = app.handle();
            if let Some(window) = app.get_webview_window("main") {
                let handle_clone = app_handle.clone();
                window.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
                        handle_clone.exit(0);
                    }
                    _ => {}
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            play_macro,
            stop_macro_playback,
            start_autoclicker,
            stop_autoclicker,
            app_status,
            enable_overlay_windows,
            disable_overlay_windows,
            sync_overlay_windows,
            resize_overlay_window,
            close_overlay_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
