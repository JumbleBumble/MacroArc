use serde::{Deserialize, Serialize};

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

#[derive(Debug, Deserialize, Clone)]
pub struct OverlayWindowDescriptor {
    pub id: String,
    pub title: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub expanded: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct OverlayGeometryPayload {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub expanded: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct MacroPlaybackStatus {
    pub context_id: Option<String>,
    pub state: String,
}

#[derive(Debug, Serialize)]
pub struct FrontendStatus {
    pub recording: bool,
    pub buffered_events: usize,
    pub autoclicker_running: bool,
}

pub fn default_speed() -> f32 {
    1.0
}

pub fn default_loops() -> u32 {
    1
}
