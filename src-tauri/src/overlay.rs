use std::collections::{HashMap, HashSet};

use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Size, State, Window, WindowEvent,
    WebviewWindow, WebviewWindowBuilder, WebviewUrl, Wry,
};

use crate::{app_state::AppState, types::{OverlayGeometryPayload, OverlayWindowDescriptor}};

const COLLAPSED_OVERLAY_WIDTH: f64 = 260.0;
const COLLAPSED_OVERLAY_HEIGHT: f64 = 120.0;

#[derive(Default)]
pub struct OverlayRuntimeState {
    enabled: bool,
    windows: HashMap<String, OverlayWindowMeta>,
    primary_window_label: Option<String>,
    listeners_attached: HashSet<String>,
}

struct OverlayWindowMeta {
    label: String,
    expanded: bool,
    width: f64,
    height: f64,
    x: f64,
    y: f64,
    visible: bool,
}

#[tauri::command]
pub fn enable_overlay_windows(
    state: State<'_, AppState>,
    window: Window,
    layout: Vec<OverlayWindowDescriptor>,
) -> Result<(), String> {
    if layout.is_empty() {
        return Ok(());
    }

    let app_handle = window.app_handle();
    let mut overlay_state = state.overlay.lock();

    overlay_state.enabled = true;
    overlay_state.primary_window_label = Some(window.label().to_string());
    let requested: Vec<String> = layout.iter().map(|descriptor| descriptor.id.clone()).collect();
    let stale: Vec<String> = overlay_state
        .windows
        .keys()
        .filter(|current| !requested.iter().any(|target| target == *current))
        .cloned()
        .collect();
    for stale_id in stale {
        close_overlay_window_internal(&app_handle, &mut overlay_state, &stale_id);
    }

    for descriptor in layout.iter() {
        spawn_or_update_overlay_window(&app_handle, &mut overlay_state, descriptor)?;
    }

    if overlay_state.windows.is_empty() {
        overlay_state.enabled = false;
        overlay_state.primary_window_label = None;
        return Err("overlay window spawn failed".into());
    }

    if let Err(error) = window.hide() {
        eprintln!("failed to hide primary window: {error:?}");
    }

    let _ = app_handle.emit("overlay://mode", true);
    Ok(())
}

#[tauri::command]
pub fn disable_overlay_windows(state: State<'_, AppState>, window: Window) -> Result<(), String> {
    let app_handle = window.app_handle();
    let mut overlay_state = state.overlay.lock();

    if overlay_state.windows.is_empty() && !overlay_state.enabled {
        return Ok(());
    }

    hide_all_overlay_windows(&app_handle, &mut overlay_state);
    overlay_state.enabled = false;
    Ok(())
}

#[tauri::command]
pub fn sync_overlay_windows(
    state: State<'_, AppState>,
    window: Window,
    layout: Vec<OverlayWindowDescriptor>,
) -> Result<(), String> {
    if layout.is_empty() {
        return Ok(());
    }

    let app_handle = window.app_handle();
    let mut overlay_state = state.overlay.lock();
    if !overlay_state.enabled {
        return Ok(());
    }

    for descriptor in layout.iter() {
        if let Some(meta) = overlay_state.windows.get_mut(&descriptor.id) {
            if let Some(handle) = app_handle.get_webview_window(&meta.label) {
                let (effective_width, effective_height) =
                    effective_overlay_dimensions(descriptor.expanded, descriptor.width, descriptor.height);
                meta.x = descriptor.x;
                meta.y = descriptor.y;
                meta.width = descriptor.width;
                meta.height = descriptor.height;
                meta.expanded = descriptor.expanded;
                set_overlay_window_geometry(&handle, descriptor.x, descriptor.y, effective_width, effective_height)?;
                set_overlay_topmost(&handle, descriptor.expanded)?;
                emit_overlay_geometry(&app_handle, &descriptor.id, &overlay_state);
                continue;
            }
        }
        spawn_or_update_overlay_window(&app_handle, &mut overlay_state, descriptor)?;
    }

    Ok(())
}

#[tauri::command]
pub fn resize_overlay_window(
    state: State<'_, AppState>,
    window: Window,
    id: String,
    width: f64,
    height: f64,
    expanded: bool,
) -> Result<(), String> {
    let app_handle = window.app_handle();
    let window_label = {
        let overlay_state = state.overlay.lock();
        let meta = overlay_state
            .windows
            .get(&id)
            .ok_or_else(|| format!("Overlay window {id} not found"))?;
        meta.label.clone()
    };

    let handle = app_handle
        .get_webview_window(&window_label)
        .ok_or_else(|| format!("Overlay window handle missing for {id}"))?;

    {
        let mut overlay_state = state.overlay.lock();
        let meta = overlay_state
            .windows
            .get_mut(&id)
            .ok_or_else(|| format!("Overlay window {id} not found"))?;
        if expanded {
            meta.width = width;
            meta.height = height;
        }
        meta.expanded = expanded;
    }

    set_overlay_window_size(&handle, width, height)?;
    set_overlay_topmost(&handle, expanded)?;
    {
        let overlay_state = state.overlay.lock();
        emit_overlay_geometry(&app_handle, &id, &overlay_state);
    }
    Ok(())
}

#[tauri::command]
pub fn close_overlay_window(
    state: State<'_, AppState>,
    window: Window,
    id: String,
) -> Result<(), String> {
    let app_handle = window.app_handle();
    let mut overlay_state = state.overlay.lock();
    if overlay_state.windows.get(&id).is_none() {
        return Ok(());
    }
    hide_overlay_window(&app_handle, &mut overlay_state, &id);
    Ok(())
}

fn spawn_or_update_overlay_window(
    app_handle: &AppHandle<Wry>,
    overlay_state: &mut OverlayRuntimeState,
    descriptor: &OverlayWindowDescriptor,
) -> Result<(), String> {
    let label = overlay_window_label(&descriptor.id);
    let title = descriptor
        .title
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("MacroArc · {}", descriptor.id));

    let window = if let Some(existing) = app_handle.get_webview_window(&label) {
        ensure_overlay_window_listener(app_handle, overlay_state, &existing, &descriptor.id);
        existing
    } else {
        let url = WebviewUrl::App(format!("/?overlayPanel={}", descriptor.id).into());
        let created = WebviewWindowBuilder::new(app_handle, label.clone(), url)
            .title(title)
            .decorations(false)
            .always_on_top(true)
            .transparent(true)
            .shadow(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .build()
            .map_err(|error| format!("failed to launch overlay window: {error}"))?;
        ensure_overlay_window_listener(app_handle, overlay_state, &created, &descriptor.id);
        created
    };

    let (effective_width, effective_height) =
        effective_overlay_dimensions(descriptor.expanded, descriptor.width, descriptor.height);
    set_overlay_window_geometry(&window, descriptor.x, descriptor.y, effective_width, effective_height)?;
    window.show().map_err(|error| error.to_string())?;
    let _ = window.set_focus();
    set_overlay_topmost(&window, descriptor.expanded)?;

    overlay_state.windows.insert(
        descriptor.id.clone(),
        OverlayWindowMeta {
            label,
            expanded: descriptor.expanded,
            width: descriptor.width,
            height: descriptor.height,
            x: descriptor.x,
            y: descriptor.y,
            visible: true,
        },
    );
    emit_overlay_geometry(app_handle, &descriptor.id, overlay_state);
    Ok(())
}

fn hide_all_overlay_windows(app_handle: &AppHandle<Wry>, overlay_state: &mut OverlayRuntimeState) {
    let ids: Vec<String> = overlay_state.windows.keys().cloned().collect();
    for id in ids {
        hide_overlay_window(app_handle, overlay_state, &id);
    }

    if overlay_state.windows.is_empty() && overlay_state.enabled {
        overlay_state.enabled = false;
        restore_primary_window(app_handle, overlay_state);
        let _ = app_handle.emit("overlay://mode", false);
    }
}

fn hide_overlay_window(app_handle: &AppHandle<Wry>, overlay_state: &mut OverlayRuntimeState, id: &str) {
    if let Some(meta) = overlay_state.windows.get_mut(id) {
        if let Some(window) = app_handle.get_webview_window(&meta.label) {
            let _ = window.hide();
        }
        meta.visible = false;
    }

    if overlay_state.windows.values().all(|entry| !entry.visible) {
        overlay_state.enabled = false;
        restore_primary_window(app_handle, overlay_state);
        let _ = app_handle.emit("overlay://mode", false);
    }
}

fn close_overlay_window_internal(
    app_handle: &AppHandle<Wry>,
    overlay_state: &mut OverlayRuntimeState,
    id: &str,
) {
    if let Some(meta) = overlay_state.windows.remove(id) {
        overlay_state.listeners_attached.remove(id);
        if let Some(window) = app_handle.get_webview_window(&meta.label) {
            let _ = window.close();
        }
    }
    if overlay_state.windows.is_empty() && overlay_state.enabled {
        overlay_state.enabled = false;
        restore_primary_window(app_handle, overlay_state);
        let _ = app_handle.emit("overlay://mode", false);
    }
}

fn set_overlay_window_geometry(
    window: &WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let pos = PhysicalPosition::new(x.round() as i32, y.round() as i32);
    let size = PhysicalSize::new(width.max(120.0).round() as u32, height.max(100.0).round() as u32);
    window
        .set_position(tauri::Position::Physical(pos))
        .map_err(|error| error.to_string())?;
    window
        .set_size(Size::Physical(size))
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn set_overlay_window_size(window: &WebviewWindow, width: f64, height: f64) -> Result<(), String> {
    let size = PhysicalSize::new(width.max(120.0).round() as u32, height.max(100.0).round() as u32);
    window
        .set_size(Size::Physical(size))
        .map_err(|error| error.to_string())
}

fn set_overlay_topmost(window: &WebviewWindow, expanded: bool) -> Result<(), String> {
    window
        .set_always_on_top(expanded)
        .map_err(|error| error.to_string())
}

fn effective_overlay_dimensions(expanded: bool, width: f64, height: f64) -> (f64, f64) {
    if expanded {
        (width, height)
    } else {
        (COLLAPSED_OVERLAY_WIDTH, COLLAPSED_OVERLAY_HEIGHT)
    }
}

fn emit_overlay_geometry(app_handle: &AppHandle<Wry>, id: &str, overlay_state: &OverlayRuntimeState) {
    if let Some(meta) = overlay_state.windows.get(id) {
        let payload = OverlayGeometryPayload {
            id: id.to_string(),
            x: meta.x,
            y: meta.y,
            width: meta.width,
            height: meta.height,
            expanded: meta.expanded,
        };
        let _ = app_handle.emit("overlay://geometry", payload);
    }
}

fn restore_primary_window(app_handle: &AppHandle<Wry>, overlay_state: &mut OverlayRuntimeState) {
    if let Some(ref label) = overlay_state.primary_window_label {
        if let Some(main_window) = app_handle.get_webview_window(label) {
            let _ = main_window.show();
            let _ = main_window.set_focus();
        }
    }
}

fn ensure_overlay_window_listener(
    app_handle: &AppHandle<Wry>,
    overlay_state: &mut OverlayRuntimeState,
    window: &WebviewWindow,
    overlay_id: &str,
) {
    if overlay_state
        .listeners_attached
        .insert(overlay_id.to_string())
    {
        attach_overlay_window_listeners(app_handle, window, overlay_id.to_string());
    }
}

fn overlay_window_label(id: &str) -> String {
    format!("overlay-{id}")
}

fn attach_overlay_window_listeners(app_handle: &AppHandle<Wry>, window: &WebviewWindow, overlay_id: String) {
    let app_handle_clone = app_handle.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(position) => {
            handle_overlay_moved(&app_handle_clone, &overlay_id, *position)
        }
        WindowEvent::Resized(size) => {
            handle_overlay_resized(&app_handle_clone, &overlay_id, *size)
        }
        WindowEvent::Destroyed => handle_overlay_destroyed(&app_handle_clone, &overlay_id),
        _ => {}
    });
}

fn handle_overlay_moved(app_handle: &AppHandle<Wry>, id: &str, position: PhysicalPosition<i32>) {
    if let Some(app_state) = app_handle.try_state::<AppState>() {
        let mut overlay = app_state.overlay.lock();
        if let Some(meta) = overlay.windows.get_mut(id) {
            meta.x = position.x as f64;
            meta.y = position.y as f64;
            emit_overlay_geometry(app_handle, id, &overlay);
        }
    }
}

fn handle_overlay_resized(app_handle: &AppHandle<Wry>, id: &str, size: PhysicalSize<u32>) {
    if let Some(app_state) = app_handle.try_state::<AppState>() {
        let mut overlay = app_state.overlay.lock();
        if let Some(meta) = overlay.windows.get_mut(id) {
            if meta.expanded {
                meta.width = size.width as f64;
                meta.height = size.height as f64;
            }
            emit_overlay_geometry(app_handle, id, &overlay);
        }
    }
}

fn handle_overlay_destroyed(app_handle: &AppHandle<Wry>, id: &str) {
    if let Some(app_state) = app_handle.try_state::<AppState>() {
        let mut overlay = app_state.overlay.lock();
        let removed = overlay.windows.remove(id).is_some();

        if !removed {
            return;
        }
        overlay.listeners_attached.remove(id);

        if overlay.windows.is_empty() {
            overlay.enabled = false;
            overlay.primary_window_label = None;
            restore_primary_window(app_handle, &mut overlay);
            let _ = app_handle.emit("overlay://mode", false);
        }
    }
}
