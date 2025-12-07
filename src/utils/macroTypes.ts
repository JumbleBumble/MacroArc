import { nanoid } from "nanoid";

export type MouseButton = "left" | "right" | "middle" | "unknown";

export type MacroEventKind =
  | { type: "mouse-move"; x: number; y: number }
  | { type: "mouse-down"; button: MouseButton }
  | { type: "mouse-up"; button: MouseButton }
  | { type: "key-down"; key: string }
  | { type: "key-up"; key: string }
  | { type: "scroll"; delta_x: number; delta_y: number };

export interface MacroEvent {
  id: string;
  offsetMs: number;
  kind: MacroEventKind;
  createdAt: number;
}

export interface MacroSequence {
  id: string;
  name: string;
  accent: string;
  tags: string[];
  loopCount: number;
  loopEnabled?: boolean;
  loopDelayMs?: number;
  playbackSpeed?: number;
  events: MacroEvent[];
  lastRun?: number;
  hotkey?: string | null;
}

export interface MacroStats {
  totalMacros: number;
  totalEvents: number;
  averageDurationMs: number;
  lastRecordedName: string;
  activeProfile: string;
}

export interface ActivityEntry {
  id: string;
  label: string;
  tone: "info" | "success" | "warning";
  timestamp: number;
  meta?: string;
}

export interface AutoClickerConfig {
  button: MouseButton;
  intervalMs: number;
  jitterMs: number;
  burst?: number | null;
  hotkey?: string | null;
}

export interface AutoClickerMetrics {
  totalClicks: number;
  burstsCompleted: number;
  lastTick?: number | null;
}

export interface MacroEventWire {
  offset_ms: number;
  kind: MacroEventKind;
}

export const fromWireEvent = (wire: MacroEventWire): MacroEvent => ({
  id: nanoid(),
  offsetMs: wire.offset_ms ?? 0,
  kind: wire.kind,
  createdAt: Date.now(),
});

export const toWireEvent = (event: MacroEvent): MacroEventWire => ({
  offset_ms: event.offsetMs,
  kind: event.kind,
});

export const clampInterval = (value: number) => Math.max(5, Math.min(1000, value));

export const DEFAULT_MACRO_SPEED = 1;
export const MIN_MACRO_SPEED = 0.25;
export const MAX_MACRO_SPEED = 3;
