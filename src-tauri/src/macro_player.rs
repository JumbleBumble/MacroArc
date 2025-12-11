use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use enigo::{Enigo, Key, KeyboardControllable, MouseButton as EnigoMouseButton, MouseControllable};
use tauri::{Emitter, State, Window};

use crate::{
    app_state::AppState,
    types::{MacroEventKind, MacroPlaybackRequest, MacroPlaybackStatus},
};

#[derive(Default)]
pub struct MacroPlaybackState {
    pub(crate) stop_flag: Option<Arc<AtomicBool>>,
    pub(crate) handle: Option<thread::JoinHandle<()>>,
}

#[tauri::command]
pub fn play_macro(
    state: State<'_, AppState>,
    window: Window,
    request: MacroPlaybackRequest,
) -> Result<(), String> {
    if request.events.is_empty() {
        return Err("No macro events supplied".into());
    }

    let playback_speed = request.playback_speed.max(0.1);
    let loop_count = request.loop_count.max(1);
    let events = request.events.clone();
    let context_id = request.context_id.clone();

    let mut player = state.macro_player.lock();
    stop_macro_player(&mut player);
    let stop_flag = Arc::new(AtomicBool::new(false));
    let flag_clone = stop_flag.clone();
    let window_clone = window.clone();

    let handle = thread::spawn(move || {
        let mut enigo = Enigo::new();
        let mut forced_stop = false;

        'outer: for _ in 0..loop_count {
            let mut last_offset = 0u64;
            for event in &events {
                if flag_clone.load(Ordering::Relaxed) {
                    forced_stop = true;
                    break 'outer;
                }

                let delay_ms = event.offset_ms.saturating_sub(last_offset);
                let adjusted_delay = (delay_ms as f32 / playback_speed).round() as u64;

                if adjusted_delay > 0 {
                    let mut waited = 0u64;
                    while waited < adjusted_delay {
                        if flag_clone.load(Ordering::Relaxed) {
                            forced_stop = true;
                            break 'outer;
                        }
                        let slice = std::cmp::min(5u64, adjusted_delay - waited);
                        thread::sleep(Duration::from_millis(slice));
                        waited += slice;
                    }
                }

                if flag_clone.load(Ordering::Relaxed) {
                    forced_stop = true;
                    break 'outer;
                }

                apply_macro_event(&mut enigo, &event.kind);
                last_offset = event.offset_ms;
            }
        }

        let payload = MacroPlaybackStatus {
            context_id,
            state: if forced_stop {
                "stopped".into()
            } else {
                "finished".into()
            },
        };
        let _ = window_clone.emit("macro://playback", payload);
    });

    player.stop_flag = Some(stop_flag);
    player.handle = Some(handle);

    Ok(())
}

#[tauri::command]
pub fn stop_macro_playback(state: State<'_, AppState>) -> Result<(), String> {
    let mut player = state.macro_player.lock();
    stop_macro_player(&mut player);
    Ok(())
}

fn apply_macro_event(enigo: &mut Enigo, kind: &MacroEventKind) {
    match kind {
        MacroEventKind::MouseMove { x, y } => {
            enigo.mouse_move_to(*x, *y);
        }
        MacroEventKind::MouseDown { button } => {
            enigo.mouse_down(parse_mouse_button(button));
        }
        MacroEventKind::MouseUp { button } => {
            enigo.mouse_up(parse_mouse_button(button));
        }
        MacroEventKind::KeyDown { key } => {
            send_key_event(enigo, key, true);
        }
        MacroEventKind::KeyUp { key } => {
            send_key_event(enigo, key, false);
        }
        MacroEventKind::Scroll { delta_x, delta_y } => {
            if *delta_y != 0 {
                enigo.mouse_scroll_y(*delta_y as i32);
            }
            if *delta_x != 0 {
                enigo.mouse_scroll_x(*delta_x as i32);
            }
        }
    }
}

fn send_key_event(enigo: &mut Enigo, label: &str, pressed: bool) {
    if let Some(key) = label_to_enigo_key(label) {
        if pressed {
            enigo.key_down(key);
        } else {
            enigo.key_up(key);
        }
    } else if pressed {
        let fallback = key_label_primary_segment(label);
        if !fallback.is_empty() {
            enigo.key_sequence(fallback);
        }
    }
}

fn key_label_primary_segment(label: &str) -> &str {
    label
        .rsplit('+')
        .next()
        .map(|segment| segment.trim())
        .unwrap_or_else(|| label.trim())
}

fn label_to_enigo_key(label: &str) -> Option<Key> {
    let segment = key_label_primary_segment(label);
    if segment.is_empty() {
        return None;
    }

    let normalized = segment.to_lowercase();
    let key = match normalized.as_str() {
        "enter" | "return" => Some(Key::Return),
        "tab" => Some(Key::Tab),
        "space" => Some(Key::Space),
        "backspace" => Some(Key::Backspace),
        "escape" | "esc" => Some(Key::Escape),
        "capslock" => Some(Key::CapsLock),
        "home" => Some(Key::Home),
        "end" => Some(Key::End),
        "pageup" => Some(Key::PageUp),
        "pagedown" => Some(Key::PageDown),
        #[cfg(not(target_os = "macos"))]
        "insert" => Some(Key::Insert),
        "delete" => Some(Key::Delete),
        "up" | "uparrow" => Some(Key::UpArrow),
        "down" | "downarrow" => Some(Key::DownArrow),
        "left" | "leftarrow" => Some(Key::LeftArrow),
        "right" | "rightarrow" => Some(Key::RightArrow),
        "shift" => Some(Key::Shift),
        "ctrl" | "control" => Some(Key::Control),
        "alt" | "altgr" => Some(Key::Alt),
        "meta" | "command" | "cmd" | "super" => Some(Key::Meta),
        "f1" => Some(Key::F1),
        "f2" => Some(Key::F2),
        "f3" => Some(Key::F3),
        "f4" => Some(Key::F4),
        "f5" => Some(Key::F5),
        "f6" => Some(Key::F6),
        "f7" => Some(Key::F7),
        "f8" => Some(Key::F8),
        "f9" => Some(Key::F9),
        "f10" => Some(Key::F10),
        "f11" => Some(Key::F11),
        "f12" => Some(Key::F12),
        _ => None,
    };

    if key.is_some() {
        return key;
    }

    if let Some(stripped) = normalized.strip_prefix("numpad") {
        if stripped.is_empty() {
            return None;
        }
        let symbol = match stripped {
            "+" => Some('+'),
            "-" => Some('-'),
            "*" => Some('*'),
            "/" => Some('/'),
            _ => stripped.chars().next(),
        };
        if let Some(ch) = symbol {
            let value = if ch.is_ascii_alphabetic() {
                ch.to_ascii_lowercase()
            } else {
                ch
            };
            return Some(Key::Layout(value));
        }
    }

    if segment.chars().count() == 1 {
        let mut ch = segment.chars().next().unwrap();
        if ch.is_ascii_uppercase() {
            ch = ch.to_ascii_lowercase();
        }
        return Some(Key::Layout(ch));
    }

    None
}

fn parse_mouse_button(button: &str) -> EnigoMouseButton {
    match button {
        "right" => EnigoMouseButton::Right,
        "middle" => EnigoMouseButton::Middle,
        _ => EnigoMouseButton::Left,
    }
}

fn stop_macro_player(player: &mut MacroPlaybackState) {
    if let Some(flag) = player.stop_flag.take() {
        flag.store(true, Ordering::Relaxed);
    }
    if let Some(handle) = player.handle.take() {
        let _ = handle.join();
    }
}
