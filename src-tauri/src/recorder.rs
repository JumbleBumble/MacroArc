use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

use parking_lot::Mutex;
use rdev::{Button as RdevButton, Event as RdevEvent, EventType, Key as RdevKey};
use tauri::{Emitter, Manager, State, Window};

use crate::{app_state::AppState, types::{MacroEvent, MacroEventKind}};

#[cfg(target_os = "windows")]
use device_query::{DeviceQuery, DeviceState, Keycode};

#[derive(Default)]
pub struct RecorderState {
    pub(crate) events: Arc<Mutex<Vec<MacroEvent>>>,
    pub(crate) capture_flag: Arc<AtomicBool>,
    pub(crate) start_time: Arc<Mutex<Option<Instant>>>,
    pub(crate) window: Arc<Mutex<Option<Window>>>,
    pub(crate) modifier_state: Arc<Mutex<ModifierState>>,
    pub(crate) key_events: Arc<AtomicU64>,
    pub(crate) pointer_events: Arc<AtomicU64>,
    pub(crate) listener_running: bool,
    pub(crate) active: bool,
    #[cfg(target_os = "windows")]
    pub(crate) keyboard_thread_started: bool,
}

#[tauri::command]
pub fn start_recording(state: State<'_, AppState>, window: Window) -> Result<(), String> {
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
    let app_handle = window.app_handle();
    let _ = app_handle.emit("macro://status", "recording-started");
    Ok(())
}

#[tauri::command]
pub fn stop_recording(state: State<'_, AppState>, window: Window) -> Result<Vec<MacroEvent>, String> {
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

    let app_handle = window.app_handle();
    let _ = app_handle.emit("macro://status", "recording-stopped");

    Ok(events)
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
pub struct ModifierState {
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
