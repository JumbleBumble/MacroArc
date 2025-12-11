use parking_lot::Mutex;

use crate::{
    autoclicker::AutoClickerState,
    macro_player::MacroPlaybackState,
    overlay::OverlayRuntimeState,
    recorder::RecorderState,
};

#[derive(Default)]
pub struct AppState {
    pub recorder: Mutex<RecorderState>,
    pub autoclicker: Mutex<AutoClickerState>,
    pub macro_player: Mutex<MacroPlaybackState>,
    pub overlay: Mutex<OverlayRuntimeState>,
}
