# MacroArc

MacroArc is a Tauri desktop application for recording, editing, and replaying deterministic mouse and keyboard sequences. The UI (React 19 + Vite + TypeScript) exposes the native recorder, macro queue, and auto clicker through a single dashboard that runs with or without the Tauri runtime.

## Capabilities

- **Macro capture** – Arm the recorder with `Cmd/Ctrl+Shift+M` (configurable) to log raw mouse/keyboard events. Events stream into the dashboard in real time so you can verify offsets and inputs before saving.
- **Macro editor** – The `MacroEditModal` surfaces every captured step with editable timing, coordinates, button selection, key labels, and scroll deltas. Changes are sanitized and persisted back to `macroarc.macros.json`.
- **Library and playback queue** – Each stored macro supports its own global shortcut, loop toggle, and loop delay. Macros can be enqueued for sequential execution with automatic inter-macro padding.
- **Queue looping** – Queue settings include enable/disable, per-loop delay, and a dedicated global hotkey for starting or cancelling playback. The hook manages timers (`queueLoopTimerRef`, `queuePlaybackAbortRef`) to prevent orphaned loops.
- **Auto clicker** – Users select button, interval, jitter, and optional burst limit, then toggle execution with `Cmd/Ctrl+Shift+A` or a custom hotkey. Metrics such as total clicks and burst count update via `autoclicker://tick` and `autoclicker://done` events.
- **Activity telemetry** – The dashboard keeps a bounded activity log describing recordings, saves, queue actions, warning states, and hotkey updates. Insight cards summarize macro counts, durations, and clicker metrics.