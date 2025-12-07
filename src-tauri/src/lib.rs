use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

#[cfg(target_os = "windows")]
use std::collections::HashSet;

use enigo::{Enigo, KeyboardControllable, Key, MouseButton as EnigoMouseButton, MouseControllable};
use parking_lot::Mutex;
use rand::{thread_rng, Rng};
use rdev::{Button as RdevButton, Event as RdevEvent, EventType, Key as RdevKey};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State, Window};
use tauri_plugin_global_shortcut::Builder as GlobalShortcutBuilder;

#[cfg(target_os = "windows")]
use device_query::{DeviceQuery, DeviceState, Keycode};

struct RecorderState {
    events: Arc<Mutex<Vec<MacroEvent>>>,
    capture_flag: Arc<AtomicBool>,
    start_time: Arc<Mutex<Option<Instant>>>,
    window: Arc<Mutex<Option<Window>>>,
    modifier_state: Arc<Mutex<ModifierState>>,
    key_events: Arc<AtomicU64>,
    pointer_events: Arc<AtomicU64>,
    listener_running: bool,
    active: bool,
    #[cfg(target_os = "windows")]
    keyboard_thread_started: bool,
}

impl Default for RecorderState {
    fn default() -> Self {
        Self {
            events: Arc::new(Mutex::new(Vec::new())),
            capture_flag: Arc::new(AtomicBool::new(false)),
            start_time: Arc::new(Mutex::new(None)),
            window: Arc::new(Mutex::new(None)),
            modifier_state: Arc::new(Mutex::new(ModifierState::default())),
            key_events: Arc::new(AtomicU64::new(0)),
            pointer_events: Arc::new(AtomicU64::new(0)),
            listener_running: false,
            active: false,
            #[cfg(target_os = "windows")]
            keyboard_thread_started: false,
        }
    }
}

#[derive(Default)]
struct AutoClickerState {
    stop_flag: Option<Arc<AtomicBool>>,
    handle: Option<JoinHandle<()>>,
    active: bool,
}

#[derive(Default)]
struct MacroPlaybackState {
    stop_flag: Option<Arc<AtomicBool>>,
    handle: Option<JoinHandle<()>>,
}

#[derive(Default)]
struct AppState {
    recorder: Mutex<RecorderState>,
    autoclicker: Mutex<AutoClickerState>,
    macro_player: Mutex<MacroPlaybackState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum MacroEventKind {
    MouseMove { x: i32, y: i32 },
    MouseDown { button: String },
    MouseUp { button: String },
    KeyDown { key: String },
    KeyUp { key: String },
    Scroll { delta_x: i64, delta_y: i64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacroEvent {
    pub offset_ms: u64,
    pub kind: MacroEventKind,
}

#[derive(Debug, Deserialize)]
pub struct MacroPlaybackRequest {
    pub events: Vec<MacroEvent>,
    #[serde(default = "default_speed")]
    pub playback_speed: f32,
    #[serde(default = "default_loops")]
    pub loop_count: u32,
    pub context_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AutoClickerRequest {
    pub button: Option<String>,
    pub interval_ms: u64,
    pub jitter_ms: Option<u64>,
    pub burst: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
struct MacroPlaybackStatus {
    context_id: Option<String>,
    state: String,
}

#[derive(Debug, Serialize)]
pub struct FrontendStatus {
    recording: bool,
    buffered_events: usize,
    autoclicker_running: bool,
}

fn default_speed() -> f32 {
    1.0
}

fn default_loops() -> u32 {
    1
}

#[tauri::command]
fn start_recording(state: State<'_, AppState>, window: Window) -> Result<(), String> {
    let mut recorder = state.recorder.lock();

    if recorder.active {
        return Err("Recording already in progress".into());
    }

    recorder.events.lock().clear();
    recorder.capture_flag.store(true, Ordering::Relaxed);
    *recorder.start_time.lock() = Some(Instant::now());
    *recorder.window.lock() = Some(window.clone());
    recorder.modifier_state.lock().reset();
    recorder.key_events.store(0, Ordering::Relaxed);
    recorder.pointer_events.store(0, Ordering::Relaxed);

    #[cfg(target_os = "windows")]
    ensure_keyboard_poller(&mut recorder);

    if !recorder.listener_running {
        let events_arc = recorder.events.clone();
        let capture_flag = recorder.capture_flag.clone();
        let start_time = recorder.start_time.clone();
        let window_handle = recorder.window.clone();
        let modifier_state = recorder.modifier_state.clone();
        let key_counter = recorder.key_events.clone();
        let pointer_counter = recorder.pointer_events.clone();

        thread::spawn(move || {
            let callback_window = window_handle.clone();
            let result = rdev::listen(move |event: RdevEvent| {
                if !capture_flag.load(Ordering::Relaxed) {
                    modifier_state.lock().reset();
                    return;
                }

                #[cfg(target_os = "windows")]
                if matches!(event.event_type, EventType::KeyPress(_) | EventType::KeyRelease(_)) {
                    return;
                }

                if let Some(kind) = translate_event(&event, &modifier_state) {
                    dispatch_macro_event(
                        kind,
                        &start_time,
                        &events_arc,
                        &callback_window,
                        &key_counter,
                        &pointer_counter,
                    );
                }
            });

            if let Err(error) = result {
                if let Some(active_window) = window_handle.lock().clone() {
                    let _ = active_window.emit("macro://error", format!("Recorder error: {error:?}"));
                }
            }
        });

        recorder.listener_running = true;
    }

    recorder.active = true;
    let _ = window.emit("macro://status", "recording-started");
    Ok(())
}

#[tauri::command]
fn stop_recording(state: State<'_, AppState>) -> Result<Vec<MacroEvent>, String> {
    let events = {
        let mut recorder = state.recorder.lock();

        if !recorder.active {
            return Err("No active recording".into());
        }

        recorder.capture_flag.store(false, Ordering::Relaxed);
        recorder.active = false;
        recorder.window.lock().take();
        *recorder.start_time.lock() = None;
        recorder.modifier_state.lock().reset();

        let snapshot = recorder.events.lock().clone();
        snapshot
    };

    Ok(events)
}

#[tauri::command]
fn play_macro(
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
fn start_autoclicker(
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

            click_button(&mut enigo, &button);
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
fn stop_autoclicker(state: State<'_, AppState>) -> Result<(), String> {
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

#[tauri::command]
fn stop_macro_playback(state: State<'_, AppState>) -> Result<(), String> {
    let mut player = state.macro_player.lock();
    stop_macro_player(&mut player);
    Ok(())
}

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

fn translate_event(event: &RdevEvent, modifiers: &Arc<Mutex<ModifierState>>) -> Option<MacroEventKind> {
    match event.event_type {
        EventType::KeyPress(key) => Some(compose_key_event(key, true, modifiers, event.name.as_deref())),
        EventType::KeyRelease(key) => Some(compose_key_event(key, false, modifiers, event.name.as_deref())),
        EventType::ButtonPress(button) => Some(MacroEventKind::MouseDown {
            button: button_to_string(button).to_string(),
        }),
        EventType::ButtonRelease(button) => Some(MacroEventKind::MouseUp {
            button: button_to_string(button).to_string(),
        }),
        EventType::MouseMove { x, y } => Some(MacroEventKind::MouseMove {
            x: x as i32,
            y: y as i32,
        }),
        EventType::Wheel { delta_x, delta_y } => Some(MacroEventKind::Scroll {
            delta_x,
            delta_y,
        }),
    }
}

fn button_to_string(button: RdevButton) -> &'static str {
    match button {
        RdevButton::Left => "left",
        RdevButton::Right => "right",
        RdevButton::Middle => "middle",
        RdevButton::Unknown(_) => "unknown",
    }
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

fn dispatch_macro_event(
    kind: MacroEventKind,
    start_time: &Arc<Mutex<Option<Instant>>>,
    events_arc: &Arc<Mutex<Vec<MacroEvent>>>,
    window_handle: &Arc<Mutex<Option<Window>>>,
    key_counter: &Arc<AtomicU64>,
    pointer_counter: &Arc<AtomicU64>,
) {
    let start_opt = start_time.lock().clone();
    if let Some(start) = start_opt {
        let offset_ms = start.elapsed().as_millis() as u64;
        let entry = MacroEvent {
            offset_ms,
            kind,
        };
        let is_key = matches!(entry.kind, MacroEventKind::KeyDown { .. } | MacroEventKind::KeyUp { .. });

        {
            let mut events = events_arc.lock();
            events.push(entry.clone());
        }
        if let Some(active_window) = window_handle.lock().clone() {
            let _ = active_window.emit("macro://event", &entry);
        }

        if is_key {
            key_counter.fetch_add(1, Ordering::Relaxed);
        } else {
            pointer_counter.fetch_add(1, Ordering::Relaxed);
        }
    }
}

fn compose_key_event(
    key: RdevKey,
    pressed: bool,
    modifiers: &Arc<Mutex<ModifierState>>,
    name_hint: Option<&str>,
) -> MacroEventKind {
    let label = {
        let mut state = modifiers.lock();
        let key_name = key_label_from_hint(key, name_hint);
        if pressed {
            state.update(key, true);
            state.describe_combo(key, &key_name)
        } else {
            let combo = state.describe_combo(key, &key_name);
            state.update(key, false);
            combo
        }
    };

    if pressed {
        MacroEventKind::KeyDown { key: label }
    } else {
        MacroEventKind::KeyUp { key: label }
    }
}

fn key_label_from_hint(key: RdevKey, name_hint: Option<&str>) -> String {
    if let Some(name) = name_hint {
        if !name.trim().is_empty() {
            return name.to_string();
        }
    }

    friendly_key_name(key)
}

fn parse_mouse_button(button: &str) -> EnigoMouseButton {
    match button {
        "right" => EnigoMouseButton::Right,
        "middle" => EnigoMouseButton::Middle,
        _ => EnigoMouseButton::Left,
    }
}

#[cfg(target_os = "windows")]
fn ensure_keyboard_poller(recorder: &mut RecorderState) {
    if recorder.keyboard_thread_started {
        return;
    }

    let events_arc = recorder.events.clone();
    let capture_flag = recorder.capture_flag.clone();
    let start_time = recorder.start_time.clone();
    let window_handle = recorder.window.clone();
    let modifier_state = recorder.modifier_state.clone();
    let key_counter = recorder.key_events.clone();
    let pointer_counter = recorder.pointer_events.clone();

    thread::spawn(move || {
        let device_state = DeviceState::new();
        let mut last_keys: HashSet<Keycode> = HashSet::new();

        loop {
            if !capture_flag.load(Ordering::Relaxed) {
                last_keys.clear();
                thread::sleep(Duration::from_millis(8));
                continue;
            }

            let snapshot = device_state.get_keys();
            let current: HashSet<Keycode> = snapshot.into_iter().collect();
            let pressed: Vec<Keycode> = current.difference(&last_keys).cloned().collect();
            let released: Vec<Keycode> = last_keys.difference(&current).cloned().collect();

            for keycode in pressed {
                emit_poller_event(
                    keycode,
                    true,
                    &modifier_state,
                    &start_time,
                    &events_arc,
                    &window_handle,
                    &key_counter,
                    &pointer_counter,
                );
            }

            for keycode in released {
                emit_poller_event(
                    keycode,
                    false,
                    &modifier_state,
                    &start_time,
                    &events_arc,
                    &window_handle,
                    &key_counter,
                    &pointer_counter,
                );
            }

            last_keys = current;
            thread::sleep(Duration::from_millis(3));
        }
    });

    recorder.keyboard_thread_started = true;
}

#[cfg(target_os = "windows")]
fn emit_poller_event(
    keycode: Keycode,
    pressed: bool,
    modifier_state: &Arc<Mutex<ModifierState>>,
    start_time: &Arc<Mutex<Option<Instant>>>,
    events_arc: &Arc<Mutex<Vec<MacroEvent>>>,
    window_handle: &Arc<Mutex<Option<Window>>>,
    key_counter: &Arc<AtomicU64>,
    pointer_counter: &Arc<AtomicU64>,
) {
    let kind = if let Some(mapped) = keycode_to_rdev(keycode) {
        compose_key_event(mapped, pressed, modifier_state, None)
    } else {
        let label = keycode.to_string();
        if pressed {
            MacroEventKind::KeyDown { key: label }
        } else {
            MacroEventKind::KeyUp { key: label }
        }
    };

    dispatch_macro_event(
        kind,
        start_time,
        events_arc,
        window_handle,
        key_counter,
        pointer_counter,
    );
}

#[cfg(target_os = "windows")]
#[allow(unreachable_patterns)]
fn keycode_to_rdev(key: Keycode) -> Option<RdevKey> {
    use device_query::Keycode::*;

    match key {
        Key0 => Some(RdevKey::Num0),
        Key1 => Some(RdevKey::Num1),
        Key2 => Some(RdevKey::Num2),
        Key3 => Some(RdevKey::Num3),
        Key4 => Some(RdevKey::Num4),
        Key5 => Some(RdevKey::Num5),
        Key6 => Some(RdevKey::Num6),
        Key7 => Some(RdevKey::Num7),
        Key8 => Some(RdevKey::Num8),
        Key9 => Some(RdevKey::Num9),
        A => Some(RdevKey::KeyA),
        B => Some(RdevKey::KeyB),
        C => Some(RdevKey::KeyC),
        D => Some(RdevKey::KeyD),
        E => Some(RdevKey::KeyE),
        F => Some(RdevKey::KeyF),
        G => Some(RdevKey::KeyG),
        H => Some(RdevKey::KeyH),
        I => Some(RdevKey::KeyI),
        J => Some(RdevKey::KeyJ),
        K => Some(RdevKey::KeyK),
        L => Some(RdevKey::KeyL),
        M => Some(RdevKey::KeyM),
        N => Some(RdevKey::KeyN),
        O => Some(RdevKey::KeyO),
        P => Some(RdevKey::KeyP),
        Q => Some(RdevKey::KeyQ),
        R => Some(RdevKey::KeyR),
        S => Some(RdevKey::KeyS),
        T => Some(RdevKey::KeyT),
        U => Some(RdevKey::KeyU),
        V => Some(RdevKey::KeyV),
        W => Some(RdevKey::KeyW),
        X => Some(RdevKey::KeyX),
        Y => Some(RdevKey::KeyY),
        Z => Some(RdevKey::KeyZ),
        F1 => Some(RdevKey::F1),
        F2 => Some(RdevKey::F2),
        F3 => Some(RdevKey::F3),
        F4 => Some(RdevKey::F4),
        F5 => Some(RdevKey::F5),
        F6 => Some(RdevKey::F6),
        F7 => Some(RdevKey::F7),
        F8 => Some(RdevKey::F8),
        F9 => Some(RdevKey::F9),
        F10 => Some(RdevKey::F10),
        F11 => Some(RdevKey::F11),
        F12 => Some(RdevKey::F12),
        Escape => Some(RdevKey::Escape),
        Space => Some(RdevKey::Space),
        LControl => Some(RdevKey::ControlLeft),
        RControl => Some(RdevKey::ControlRight),
        LShift => Some(RdevKey::ShiftLeft),
        RShift => Some(RdevKey::ShiftRight),
        LAlt => Some(RdevKey::Alt),
        RAlt => Some(RdevKey::AltGr),
        Meta => Some(RdevKey::MetaLeft),
        Enter => Some(RdevKey::Return),
        Up => Some(RdevKey::UpArrow),
        Down => Some(RdevKey::DownArrow),
        Left => Some(RdevKey::LeftArrow),
        Right => Some(RdevKey::RightArrow),
        Backspace => Some(RdevKey::Backspace),
        CapsLock => Some(RdevKey::CapsLock),
        Tab => Some(RdevKey::Tab),
        Home => Some(RdevKey::Home),
        End => Some(RdevKey::End),
        PageUp => Some(RdevKey::PageUp),
        PageDown => Some(RdevKey::PageDown),
        Insert => Some(RdevKey::Insert),
        Delete => Some(RdevKey::Delete),
        Numpad0 => Some(RdevKey::Kp0),
        Numpad1 => Some(RdevKey::Kp1),
        Numpad2 => Some(RdevKey::Kp2),
        Numpad3 => Some(RdevKey::Kp3),
        Numpad4 => Some(RdevKey::Kp4),
        Numpad5 => Some(RdevKey::Kp5),
        Numpad6 => Some(RdevKey::Kp6),
        Numpad7 => Some(RdevKey::Kp7),
        Numpad8 => Some(RdevKey::Kp8),
        Numpad9 => Some(RdevKey::Kp9),
        NumpadSubtract => Some(RdevKey::KpMinus),
        NumpadAdd => Some(RdevKey::KpPlus),
        NumpadDivide => Some(RdevKey::KpDivide),
        NumpadMultiply => Some(RdevKey::KpMultiply),
        Grave => Some(RdevKey::BackQuote),
        Minus => Some(RdevKey::Minus),
        Equal => Some(RdevKey::Equal),
        LeftBracket => Some(RdevKey::LeftBracket),
        RightBracket => Some(RdevKey::RightBracket),
        BackSlash => Some(RdevKey::BackSlash),
        Semicolon => Some(RdevKey::SemiColon),
        Apostrophe => Some(RdevKey::Quote),
        Comma => Some(RdevKey::Comma),
        Dot => Some(RdevKey::Dot),
        Slash => Some(RdevKey::Slash),
        _ => None,
    }
}

#[derive(Default)]
struct ModifierState {
    ctrl: bool,
    shift: bool,
    alt: bool,
    meta: bool,
}

impl ModifierState {
    fn update(&mut self, key: RdevKey, pressed: bool) {
        match key {
            RdevKey::ControlLeft | RdevKey::ControlRight => self.ctrl = pressed,
            RdevKey::ShiftLeft | RdevKey::ShiftRight => self.shift = pressed,
            RdevKey::Alt | RdevKey::AltGr => self.alt = pressed,
            RdevKey::MetaLeft | RdevKey::MetaRight => self.meta = pressed,
            _ => {}
        }
    }

    fn describe_combo(&self, key: RdevKey, key_label: &str) -> String {
        let mut parts: Vec<&str> = Vec::new();

        if self.ctrl && !matches!(key, RdevKey::ControlLeft | RdevKey::ControlRight) {
            parts.push("Ctrl");
        }
        if self.shift && !matches!(key, RdevKey::ShiftLeft | RdevKey::ShiftRight) {
            parts.push("Shift");
        }
        if self.alt && !matches!(key, RdevKey::Alt | RdevKey::AltGr) {
            parts.push("Alt");
        }
        if self.meta && !matches!(key, RdevKey::MetaLeft | RdevKey::MetaRight) {
            parts.push("Meta");
        }

        parts.push(key_label);
        parts.join("+")
    }

    fn reset(&mut self) {
        self.ctrl = false;
        self.shift = false;
        self.alt = false;
        self.meta = false;
    }
}

fn friendly_key_name(key: RdevKey) -> String {
    match key {
        RdevKey::Backspace => "Backspace".into(),
        RdevKey::Tab => "Tab".into(),
        RdevKey::Return | RdevKey::KpReturn => "Enter".into(),
        RdevKey::Escape => "Esc".into(),
        RdevKey::Space => "Space".into(),
        RdevKey::ControlLeft | RdevKey::ControlRight => "Ctrl".into(),
        RdevKey::ShiftLeft | RdevKey::ShiftRight => "Shift".into(),
        RdevKey::Alt | RdevKey::AltGr => "Alt".into(),
        RdevKey::MetaLeft | RdevKey::MetaRight => "Meta".into(),
        RdevKey::CapsLock => "CapsLock".into(),
        RdevKey::Home => "Home".into(),
        RdevKey::End => "End".into(),
        RdevKey::PageUp => "PageUp".into(),
        RdevKey::PageDown => "PageDown".into(),
        RdevKey::Insert => "Insert".into(),
        RdevKey::Delete | RdevKey::KpDelete => "Delete".into(),
        RdevKey::LeftArrow => "Left".into(),
        RdevKey::RightArrow => "Right".into(),
        RdevKey::UpArrow => "Up".into(),
        RdevKey::DownArrow => "Down".into(),
        RdevKey::Num0 => "0".into(),
        RdevKey::Num1 => "1".into(),
        RdevKey::Num2 => "2".into(),
        RdevKey::Num3 => "3".into(),
        RdevKey::Num4 => "4".into(),
        RdevKey::Num5 => "5".into(),
        RdevKey::Num6 => "6".into(),
        RdevKey::Num7 => "7".into(),
        RdevKey::Num8 => "8".into(),
        RdevKey::Num9 => "9".into(),
        RdevKey::Kp0 => "NumPad0".into(),
        RdevKey::Kp1 => "NumPad1".into(),
        RdevKey::Kp2 => "NumPad2".into(),
        RdevKey::Kp3 => "NumPad3".into(),
        RdevKey::Kp4 => "NumPad4".into(),
        RdevKey::Kp5 => "NumPad5".into(),
        RdevKey::Kp6 => "NumPad6".into(),
        RdevKey::Kp7 => "NumPad7".into(),
        RdevKey::Kp8 => "NumPad8".into(),
        RdevKey::Kp9 => "NumPad9".into(),
        RdevKey::KpPlus => "NumPad+".into(),
        RdevKey::KpMinus => "NumPad-".into(),
        RdevKey::KpMultiply => "NumPad*".into(),
        RdevKey::KpDivide => "NumPad/".into(),
        RdevKey::Function => "Fn".into(),
        _ => {
            let raw = format!("{:?}", key);
            if let Some(stripped) = raw.strip_prefix("Key") {
                stripped.to_uppercase()
            } else if let Some(stripped) = raw.strip_prefix("Num") {
                stripped.to_string()
            } else if let Some(stripped) = raw.strip_prefix("Kp") {
                format!("NumPad{}", stripped)
            } else {
                raw
            }
        }
    }
}


fn click_button(enigo: &mut Enigo, button: &str) {
    let parsed = parse_mouse_button(button);
    enigo.mouse_click(parsed);
}

fn stop_macro_player(player: &mut MacroPlaybackState) {
    if let Some(flag) = player.stop_flag.take() {
        flag.store(true, Ordering::Relaxed);
    }
    if let Some(handle) = player.handle.take() {
        let _ = handle.join();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(GlobalShortcutBuilder::new().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            play_macro,
            stop_macro_playback,
            start_autoclicker,
            stop_autoclicker,
            app_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
