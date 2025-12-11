use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use enigo::{Enigo, MouseButton as EnigoMouseButton, MouseControllable};
use rand::{thread_rng, Rng};
use tauri::{Emitter, State, Window};

use crate::{app_state::AppState, types::AutoClickerRequest};

#[derive(Default)]
pub struct AutoClickerState {
    pub(crate) stop_flag: Option<Arc<AtomicBool>>,
    pub(crate) handle: Option<thread::JoinHandle<()>>,
    pub(crate) active: bool,
}

#[tauri::command]
pub fn start_autoclicker(
    state: State<'_, AppState>,
    window: Window,
    config: AutoClickerRequest,
) -> Result<(), String> {
    let mut autoclicker = state.autoclicker.lock();

    if autoclicker.active {
        return Err("Autoclicker already running".into());
    }

    let stop_flag = Arc::new(AtomicBool::new(false));
    autoclicker.stop_flag = Some(stop_flag.clone());
    autoclicker.active = true;

    let interval = config.interval_ms.max(5);
    let jitter = config.jitter_ms.unwrap_or(0);
    let button = config.button.unwrap_or_else(|| "left".to_string());
    let burst = config.burst;
    let window_clone = window.clone();

    let handle = thread::spawn(move || {
        let mut enigo = Enigo::new();
        let mut rng = thread_rng();
        let mut clicks_sent = 0u32;

        loop {
            if stop_flag.load(Ordering::Relaxed) {
                break;
            }

            enigo.mouse_click(parse_mouse_button(&button));
            clicks_sent += 1;
            let _ = window_clone.emit("autoclicker://tick", clicks_sent);

            if let Some(max_clicks) = burst {
                if clicks_sent >= max_clicks {
                    break;
                }
            }

            let jitter_offset = if jitter == 0 {
                0
            } else {
                rng.gen_range(0..=jitter)
            };

            thread::sleep(Duration::from_millis(interval + jitter_offset));
        }

        let _ = window_clone.emit("autoclicker://done", clicks_sent);
    });

    autoclicker.handle = Some(handle);
    Ok(())
}

#[tauri::command]
pub fn stop_autoclicker(state: State<'_, AppState>) -> Result<(), String> {
    let handle = {
        let mut autoclicker = state.autoclicker.lock();

        if !autoclicker.active {
            return Err("Autoclicker is not running".into());
        }

        if let Some(flag) = autoclicker.stop_flag.take() {
            flag.store(true, Ordering::Relaxed);
        }

        autoclicker.active = false;
        autoclicker.handle.take()
    };

    if let Some(handle) = handle {
        let _ = handle.join();
    }

    Ok(())
}

fn parse_mouse_button(button: &str) -> EnigoMouseButton {
    match button {
        "right" => EnigoMouseButton::Right,
        "middle" => EnigoMouseButton::Middle,
        _ => EnigoMouseButton::Left,
    }
}
