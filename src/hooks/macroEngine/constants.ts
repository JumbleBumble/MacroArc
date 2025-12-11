import { MacroSequence, MouseButton } from '../../utils/macroTypes'

export const STORAGE_FILENAME = 'macroarc.macros.json'
export const HOTKEYS_FILENAME = 'macroarc.hotkeys.json'
export const LEGACY_QUEUE_HOTKEY_FILENAME = 'macroarc.queue.hotkey.json'
export const LEGACY_RECORDER_HOTKEY_FILENAME = 'macroarc.recorder.hotkey.json'
export const MACRO_RECORD_SHORTCUT = 'CommandOrControl+Shift+M'
export const DEFAULT_QUEUE_HOTKEY = 'CommandOrControl+Shift+Q'
export const DEFAULT_LOOP_DELAY_MS = 1000
export const DEFAULT_QUEUE_LOOP_DELAY_MS = 1500
export const MIN_LOOP_DELAY_MS = 0
export const RECORDER_HOTKEY_HEAD_WINDOW_MS = 200
export const RECORDER_HOTKEY_TAIL_WINDOW_MS = 300
export const RECENT_EVENT_LIMIT = 12
export const CAPTURE_READY_CHANNEL = 'macro://capture-ready'
export const MACRO_SYNC_CHANNEL = 'macro://macro-sync'
export const QUEUE_STATE_CHANNEL = 'macro://queue-state'
export const QUEUE_HOTKEY_CHANNEL = 'macro://queue-hotkey'
export const QUEUE_STATE_REQUEST_CHANNEL = 'macro://queue-state-request'
export const VALID_MOUSE_BUTTONS: MouseButton[] = [
	'left',
	'right',
	'middle',
	'unknown',
]
export const SCROLL_DELTA_MODE_NATIVE: MacroSequence['scrollDeltaMode'] = 'native'
