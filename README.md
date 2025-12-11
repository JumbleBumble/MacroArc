# MacroArc

MacroArc is a Tauri desktop application for recording, editing, and replaying deterministic mouse and keyboard sequences. The UI (React 19 + Vite + TypeScript) exposes the native recorder, macro queue, and auto clicker through a single dashboard that runs with or without the Tauri runtime.

## Capabilities

- **Macro capture** – Arm the recorder with `Cmd/Ctrl+Shift+M` (configurable) to log raw mouse/keyboard events. Events stream into the dashboard in real time so you can verify offsets and inputs before saving.
- **Macro editor** – The `MacroEditModal` surfaces every captured step with editable timing, coordinates, button selection, key labels, and scroll deltas. Changes are sanitized and persisted back to `macroarc.macros.json`.
- **Playback library** – Each saved macro exposes global shortcut binding, adjustable playback speed (0.25–3x), optional loop toggle/delay, and last-run tracking.
- **Queue automation** – Macros can be enqueued for sequential execution with automatic padding, a dedicated queue hotkey to start/stop runs, and per-loop delay controls. Loop timers ensure repeated queues stay synchronized.
- **Macro looping safety** – Background timers and loop state refs guard each macro’s personal loop. Stopping or editing a macro automatically clears timers to prevent orphaned playback.
- **Auto clicker** – Users select button, interval, jitter, and optional burst limit, then toggle execution with `Cmd/Ctrl+Shift+A` or a custom hotkey. Metrics such as total clicks and burst count.
- **Activity telemetry & insights** – The dashboard keeps a bounded activity log describing recordings, saves, queue actions, warning states, and hotkey updates. Insight cards summarize macro counts, durations, and auto clicker metrics.
- **Dual runtime + persistence** – Everything runs in the browser with mock events, while Tauri builds add native recording/playback, filesystem persistence (`macroarc.macros.json`, `macroarc.hotkeys.json`, `macroarc.autoclicker.json`), and global shortcuts via `@tauri-apps/plugin-global-shortcut`.
- **Overlay mode** – Switch the dashboard into an overlay layout that launches always-on-top windows for every panel, each with drag, resize, and close controls matching the main view.