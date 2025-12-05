import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { nanoid } from 'nanoid';
import {
  ActivityEntry,
  MacroEvent,
  MacroEventWire,
  MacroSequence,
  MacroStats,
  fromWireEvent,
  toWireEvent,
} from '../utils/macroTypes';
import { isTauri } from '../utils/bridge';
import { getAppLocalDataPath } from '../utils/storage';

const mockRecording = (): MacroEvent[] => {
  const now = Date.now();
  return [
    {
      id: nanoid(),
      offsetMs: 40,
      kind: { type: 'mouse-move', x: 420, y: 420 },
      createdAt: now,
    },
    {
      id: nanoid(),
      offsetMs: 125,
      kind: { type: 'mouse-down', button: 'left' },
      createdAt: now,
    },
    {
      id: nanoid(),
      offsetMs: 210,
      kind: { type: 'mouse-up', button: 'left' },
      createdAt: now,
    },
    {
      id: nanoid(),
      offsetMs: 300,
      kind: { type: 'key-down', key: 'Ctrl+V' },
      createdAt: now,
    },
    {
      id: nanoid(),
      offsetMs: 380,
      kind: { type: 'key-up', key: 'Ctrl+V' },
      createdAt: now,
    },
  ];
};

const STORAGE_FILENAME = 'macroarc.macros.json';
const QUEUE_HOTKEY_FILENAME = 'macroarc.queue.hotkey.json';
const MACRO_RECORD_SHORTCUT = 'CommandOrControl+Shift+M';
const DEFAULT_QUEUE_HOTKEY = 'CommandOrControl+Shift+Q';
const DEFAULT_LOOP_DELAY_MS = 1000;
const DEFAULT_QUEUE_LOOP_DELAY_MS = 1500;
const MIN_LOOP_DELAY_MS = 0;

type PlaybackStatusPayload = {
  context_id?: string | null;
  state: 'finished' | 'stopped' | string;
};

const clampLoopDelay = (value: number | undefined, fallback: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(MIN_LOOP_DELAY_MS, value);
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const parseStoredMacros = (raw: string | null): MacroSequence[] | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MacroSequence[];
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.warn('macro cache invalid', error);
    return null;
  }
};

type QueueHotkeyFile = {
  hotkey: string | null;
};

const parseQueueHotkeyFile = (raw: string | null): QueueHotkeyFile | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<QueueHotkeyFile>;
    if (typeof parsed.hotkey === 'string') {
      const trimmed = parsed.hotkey.trim();
      return { hotkey: trimmed.length ? trimmed : null };
    }
    if (parsed.hotkey === null) {
      return { hotkey: null };
    }
    return null;
  } catch (error) {
    console.warn('queue hotkey cache invalid', error);
    return null;
  }
};

const isMissingFileError = (error: unknown) => {
  const message = `${error ?? ''}`.toLowerCase();
  return (
    message.includes('not found') ||
    message.includes('no such file') ||
    message.includes('os error 2') ||
    message.includes('enoent')
  );
};

const pushEntry = (
  updater: Dispatch<SetStateAction<ActivityEntry[]>>,
  entry: ActivityEntry,
) =>
  updater((current) => [entry, ...current].slice(0, 18));

const estimateMacroDurationMs = (
  macro: MacroSequence,
  options?: { speed?: number; loops?: number },
) => {
  const lastOffset = macro.events[macro.events.length - 1]?.offsetMs ?? 0;
  const speed = Math.max(options?.speed ?? 1, 0.1);
  const loops = Math.max(options?.loops ?? macro.loopCount ?? 1, 1);
  return (lastOffset / speed) * loops;
};

export const useMacroEngine = () => {
  const nativeRuntime = isTauri();
  const [macros, setMacros] = useState<MacroSequence[]>([]);
  const [macrosHydrated, setMacrosHydrated] = useState(!nativeRuntime);
  const [recording, setRecording] = useState(false);
  const [recentEvents, setRecentEvents] = useState<MacroEvent[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [selectedMacroId, setSelectedMacroId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Idle');
  const [captureName, setCaptureName] = useState('Live Capture');
  const [isPlaying, setIsPlaying] = useState(false);
  const [pendingCapture, setPendingCapture] = useState<MacroEvent[] | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [queueLoopEnabled, setQueueLoopEnabled] = useState(false);
  const [queueLoopDelayMs, setQueueLoopDelayMs] = useState(DEFAULT_QUEUE_LOOP_DELAY_MS);
  const [queueRunning, setQueueRunning] = useState(false);
  const [queueHotkey, setQueueHotkey] = useState<string | null>(DEFAULT_QUEUE_HOTKEY);
  const [queueHotkeyHydrated, setQueueHotkeyHydrated] = useState(!nativeRuntime);
  const macroHotkeyBindings = useRef<Map<string, string>>(new Map());
  const macroHotkeyPressed = useRef<Map<string, boolean>>(new Map());
  const recorderHotkeyHeldRef = useRef(false);
  const macrosRef = useRef<MacroSequence[]>([]);
  const macroLoopTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const queueLoopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueLoopEnabledRef = useRef(queueLoopEnabled);
  const queueLoopDelayRef = useRef(queueLoopDelayMs);
  const activeLoopMacrosRef = useRef<Set<string>>(new Set());
  const queueRunningRef = useRef(queueRunning);
  const queuePlaybackAbortRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const queueHotkeyHeldRef = useRef(false);
  const playbackResolversRef = useRef<Map<string, (payload: PlaybackStatusPayload) => void>>(new Map());
  const currentPlaybackContextRef = useRef<string | null>(null);
  const currentPlaybackMacroRef = useRef<string | null>(null);
  const clearMacroLoopTimer = useCallback((id: string) => {
    const timer = macroLoopTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      macroLoopTimers.current.delete(id);
    }
  }, []);
  const clearQueueLoopTimer = useCallback(() => {
    if (queueLoopTimerRef.current) {
      clearTimeout(queueLoopTimerRef.current);
      queueLoopTimerRef.current = null;
    }
  }, []);
  const requestStopPlayback = useCallback(async () => {
    currentPlaybackContextRef.current = null;
    currentPlaybackMacroRef.current = null;
    if (!nativeRuntime) {
      setIsPlaying(false);
      return;
    }
    try {
      await invoke('stop_macro_playback');
    } catch (error) {
      console.warn('macro playback stop failed', error);
    } finally {
      setIsPlaying(false);
    }
  }, [nativeRuntime]);
  const stopMacroLoop = useCallback(
    (id: string, options?: { silent?: boolean }) => {
      if (activeLoopMacrosRef.current.has(id) && !options?.silent) {
        const target = macrosRef.current.find((macro) => macro.id === id);
        if (target) {
          pushEntry(setActivity, {
            id: nanoid(),
            label: `${target.name} loop stopped`,
            tone: 'warning',
            timestamp: Date.now(),
          });
        }
      }
      activeLoopMacrosRef.current.delete(id);
      clearMacroLoopTimer(id);
      if (currentPlaybackMacroRef.current === id) {
        void requestStopPlayback();
      }
    },
    [clearMacroLoopTimer, requestStopPlayback],
  );

  useEffect(() => {
    macrosRef.current = macros;
  }, [macros]);

  useEffect(() => {
    queueRunningRef.current = queueRunning;
  }, [queueRunning]);

  useEffect(() => {
    queueLoopEnabledRef.current = queueLoopEnabled;
    if (!queueLoopEnabled) {
      clearQueueLoopTimer();
    }
  }, [queueLoopEnabled, clearQueueLoopTimer]);

  useEffect(() => {
    queueLoopDelayRef.current = queueLoopDelayMs;
  }, [queueLoopDelayMs]);

  useEffect(() => {
    if (!nativeRuntime) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const path = await getAppLocalDataPath(STORAGE_FILENAME);
        const raw = await readTextFile(path);
        const parsed = parseStoredMacros(raw);
        if (!cancelled && parsed) {
          const normalized = parsed.map((macro) => ({
            ...macro,
            hotkey: macro.hotkey ?? null,
            loopEnabled: Boolean(macro.loopEnabled),
            loopDelayMs: clampLoopDelay(macro.loopDelayMs ?? DEFAULT_LOOP_DELAY_MS, DEFAULT_LOOP_DELAY_MS),
          }));
          setMacros(normalized);
          setSelectedMacroId((current) => {
            if (current && normalized.some((macro) => macro.id === current)) {
              return current;
            }
            return normalized[0]?.id ?? null;
          });
        }
      } catch (error) {
        if (!isMissingFileError(error)) {
          console.warn('macro file read failed', error);
        }
      } finally {
        if (!cancelled) {
          setMacrosHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nativeRuntime]);

  useEffect(() => {
    if (!nativeRuntime) return;

    let cancelled = false;

    (async () => {
      try {
        const path = await getAppLocalDataPath(QUEUE_HOTKEY_FILENAME);
        const raw = await readTextFile(path);
        const parsed = parseQueueHotkeyFile(raw);
        if (!cancelled) {
          setQueueHotkey(parsed ? parsed.hotkey : DEFAULT_QUEUE_HOTKEY);
        }
      } catch (error) {
        if (!isMissingFileError(error)) {
          console.warn('queue hotkey file read failed', error);
        }
        if (!cancelled) {
          setQueueHotkey(DEFAULT_QUEUE_HOTKEY);
        }
      } finally {
        if (!cancelled) {
          setQueueHotkeyHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nativeRuntime]);

  useEffect(() => {
    if (!nativeRuntime || !queueHotkeyHydrated) return;

    const persist = async () => {
      try {
        const path = await getAppLocalDataPath(QUEUE_HOTKEY_FILENAME);
        await writeTextFile(path, JSON.stringify({ hotkey: queueHotkey ?? null }));
      } catch (error) {
        console.warn('queue hotkey file write failed', error);
      }
    };

    void persist();
  }, [nativeRuntime, queueHotkey, queueHotkeyHydrated]);

  useEffect(() => {
    if (!nativeRuntime || !macrosHydrated) return;

    const persist = async () => {
      try {
        const path = await getAppLocalDataPath(STORAGE_FILENAME);
        await writeTextFile(path, JSON.stringify(macros));
      } catch (error) {
        console.warn('macro file write failed', error);
      }
    };

    void persist();
  }, [macros, nativeRuntime, macrosHydrated]);

  useEffect(() => {
    setSelectedMacroId((current) => {
      if (current && macros.some((macro) => macro.id === current)) {
        return current;
      }
      return macros[0]?.id ?? null;
    });
  }, [macros]);

  const appendRecentEvent = useCallback((event: MacroEvent) => {
    setRecentEvents((prev) => [event, ...prev].slice(0, 12));
  }, []);

  useEffect(() => {
    if (!nativeRuntime) return;
    let unlistenEvent: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;
    let unlistenPlayback: (() => void) | undefined;

    (async () => {
      unlistenEvent = await listen<MacroEventWire>('macro://event', ({ payload }) => {
        appendRecentEvent(fromWireEvent(payload));
      });
      unlistenStatus = await listen<string>('macro://status', ({ payload }) => {
        setStatusText(payload);
      });
      unlistenError = await listen<string>('macro://error', ({ payload }) => {
        pushEntry(setActivity, {
          id: nanoid(),
          label: 'Recorder error',
          tone: 'warning',
          meta: payload,
          timestamp: Date.now(),
        });
      });
      unlistenPlayback = await listen<PlaybackStatusPayload>('macro://playback', ({ payload }) => {
        setIsPlaying(false);
        if (payload?.context_id) {
          if (currentPlaybackContextRef.current === payload.context_id) {
            currentPlaybackContextRef.current = null;
            currentPlaybackMacroRef.current = null;
          }
          const resolver = playbackResolversRef.current.get(payload.context_id);
          if (resolver) {
            resolver(payload);
            playbackResolversRef.current.delete(payload.context_id);
          }
        } else {
          playbackResolversRef.current.forEach((resolve) => resolve(payload));
          playbackResolversRef.current.clear();
          currentPlaybackContextRef.current = null;
          currentPlaybackMacroRef.current = null;
        }
      });
      try {
        const snapshot = await invoke<{ recording: boolean }>('app_status');
        if (snapshot.recording) {
          setStatusText('Resumed session');
        }
      } catch (error) {
        console.warn('status probe failed', error);
      }
    })();

    return () => {
      unlistenEvent?.();
      unlistenStatus?.();
      unlistenError?.();
      unlistenPlayback?.();
    };
  }, [appendRecentEvent, nativeRuntime]);

  const startRecording = useCallback(
    async (name?: string) => {
      if (recording) return;
      const label = name?.trim() || `Capture ${macros.length + 1}`;
      setCaptureName(label);
      setRecentEvents([]);
      setPendingCapture(null);
      setStatusText('Listening for input...');
      pushEntry(setActivity, {
        id: nanoid(),
        label: `Recording ${label}`,
        tone: 'info',
        timestamp: Date.now(),
      });

      if (nativeRuntime) {
        try {
          await invoke('start_recording');
        } catch (error) {
          pushEntry(setActivity, {
            id: nanoid(),
            label: 'Recorder error',
            tone: 'warning',
            meta: String(error),
            timestamp: Date.now(),
          });
          setRecording(false);
          setStatusText('Error arming recorder');
          return;
        }
      } else {
        mockRecording().forEach((event, index) => {
          setTimeout(() => appendRecentEvent(event), index * 180);
        });
      }

      setRecording(true);
    },
    [appendRecentEvent, macros.length, nativeRuntime, recording],
  );

  const stopRecording = useCallback(
    async (_name?: string) => {
      if (!recording) return;
      try {
        let events: MacroEvent[] = [];
        if (nativeRuntime) {
          const payload = await invoke<MacroEventWire[]>('stop_recording');
          events = payload.map(fromWireEvent);
        } else {
          events = mockRecording();
        }

        const sorted = [...events].sort((a, b) => a.offsetMs - b.offsetMs);
        if (!sorted.length) {
          setStatusText('No events captured');
          pushEntry(setActivity, {
            id: nanoid(),
            label: 'Empty capture discarded',
            tone: 'warning',
            timestamp: Date.now(),
          });
          return;
        }

        setPendingCapture(sorted);
        setStatusText('Capture ready');
        pushEntry(setActivity, {
          id: nanoid(),
          label: 'Capture ready for review',
          tone: 'success',
          meta: `${sorted.length} events`,
          timestamp: Date.now(),
        });
      } catch (error) {
        pushEntry(setActivity, {
          id: nanoid(),
          label: 'Recorder stopped unexpectedly',
          tone: 'warning',
          meta: String(error),
          timestamp: Date.now(),
        });
      } finally {
        setRecording(false);
      }
    },
    [nativeRuntime, recording],
  );

  useEffect(() => {
    if (!nativeRuntime) return;

    const setupShortcut = async () => {
      try {
        await unregister(MACRO_RECORD_SHORTCUT).catch(() => undefined);
        await register(MACRO_RECORD_SHORTCUT, async (event) => {
          try {
            if (event.state === 'Released') {
              if (!recorderHotkeyHeldRef.current) {
                return;
              }
              recorderHotkeyHeldRef.current = false;
              if (recording) {
                await stopRecording();
              } else {
                await startRecording();
              }
              return;
            }
            if (event.state === 'Pressed') {
              recorderHotkeyHeldRef.current = true;
            }
          } catch (error) {
            console.warn('macro recorder hotkey toggle failed', error);
          }
        });
      } catch (error) {
        console.warn('macro recorder hotkey registration failed', error);
      }
    };

    void setupShortcut();

    return () => {
      recorderHotkeyHeldRef.current = false;
      void unregister(MACRO_RECORD_SHORTCUT).catch(() => undefined);
    };
  }, [nativeRuntime, recording, startRecording, stopRecording]);

  const persistMacro = useCallback(
    (events: MacroEvent[], name?: string): MacroSequence => ({
      id: nanoid(),
      name: name?.trim() || captureName,
      accent: '#ff9d4d',
      tags: ['capture'],
      loopCount: 1,
      loopEnabled: false,
      loopDelayMs: DEFAULT_LOOP_DELAY_MS,
      events,
      lastRun: Date.now(),
      hotkey: null,
    }),
    [captureName],
  );

  const savePendingCapture = useCallback(
    async (label?: string) => {
      if (!pendingCapture?.length) return;
      const macro = persistMacro(pendingCapture, label);
      setMacros((prev) => [macro, ...prev]);
      setSelectedMacroId(macro.id);
      setPendingCapture(null);
      pushEntry(setActivity, {
        id: nanoid(),
        label: `Saved ${macro.name}`,
        tone: 'success',
        meta: `${macro.events.length} events`,
        timestamp: Date.now(),
      });
      setStatusText('Idle');
    },
    [pendingCapture, persistMacro],
  );

  const discardPendingCapture = useCallback(() => {
    if (!pendingCapture?.length) return;
    setPendingCapture(null);
    setStatusText('Idle');
    pushEntry(setActivity, {
      id: nanoid(),
      label: 'Capture discarded',
      tone: 'warning',
      timestamp: Date.now(),
    });
  }, [pendingCapture]);

  const executeEvents = useCallback(
    async (
      events: MacroEvent[],
      options?: { speed?: number; loops?: number; contextId?: string },
    ) => {
      if (!events.length) return null;
      const contextId = options?.contextId ?? nanoid();
      setIsPlaying(true);
      if (nativeRuntime) {
        await invoke('play_macro', {
          request: {
            events: events.map(toWireEvent),
            playback_speed: options?.speed ?? 1,
            loop_count: options?.loops ?? 1,
            context_id: contextId,
          },
        });
      } else {
        const baseDuration = events[events.length - 1]?.offsetMs ?? 0;
        const speed = Math.max(options?.speed ?? 1, 0.1);
        const loops = Math.max(options?.loops ?? 1, 1);
        const estimated = (baseDuration / speed) * loops;
        setTimeout(() => setIsPlaying(false), Math.max(estimated + 250, 600));
      }
      return contextId;
    },
    [nativeRuntime],
  );

  const playMacroBase = useCallback(
    async (
      target: MacroSequence,
      options?: { speed?: number; loops?: number; silentActivity?: boolean },
    ) => {
      const contextId = nanoid();
      currentPlaybackContextRef.current = contextId;
      currentPlaybackMacroRef.current = target.id;
      const loops = options?.loops ?? target.loopCount;
      const speed = options?.speed ?? 1;
      const playbackPromise = nativeRuntime
        ? new Promise<PlaybackStatusPayload>((resolve) => {
            playbackResolversRef.current.set(contextId, resolve);
          })
        : wait(Math.max(estimateMacroDurationMs(target, { loops, speed }) + 250, 600)).then(
            () => {
              if (currentPlaybackContextRef.current === contextId) {
                currentPlaybackContextRef.current = null;
                currentPlaybackMacroRef.current = null;
              }
              setIsPlaying(false);
              return { context_id: contextId, state: 'finished' as const };
            },
          );

      if (!options?.silentActivity) {
        pushEntry(setActivity, {
          id: nanoid(),
          label: `Playing ${target.name}`,
          tone: 'info',
          meta: `${target.events.length} steps`,
          timestamp: Date.now(),
        });
      }

      try {
        await executeEvents(target.events, {
          speed,
          loops,
          contextId,
        });
      } catch (error) {
        playbackResolversRef.current.delete(contextId);
        currentPlaybackContextRef.current = null;
        currentPlaybackMacroRef.current = null;
        throw error;
      }

      await playbackPromise;

      setMacros((prev) =>
        prev.map((macro) =>
          macro.id === target.id
            ? {
                ...macro,
                lastRun: Date.now(),
              }
            : macro,
        ),
      );
    },
    [executeEvents, nativeRuntime, setIsPlaying],
  );

  const scheduleMacroLoop = useCallback(
    (macroId: string) => {
      clearMacroLoopTimer(macroId);
      const target = macrosRef.current.find((macro) => macro.id === macroId);
      if (!target?.loopEnabled) {
        activeLoopMacrosRef.current.delete(macroId);
        return;
      }
      const delay = clampLoopDelay(target.loopDelayMs ?? DEFAULT_LOOP_DELAY_MS, DEFAULT_LOOP_DELAY_MS);
      activeLoopMacrosRef.current.add(macroId);
      const timer = setTimeout(async () => {
        macroLoopTimers.current.delete(macroId);
        const latest = macrosRef.current.find((macro) => macro.id === macroId);
        if (!latest?.loopEnabled || !activeLoopMacrosRef.current.has(macroId)) {
          activeLoopMacrosRef.current.delete(macroId);
          return;
        }
        await playMacroBase(latest, { silentActivity: true });
        if (!activeLoopMacrosRef.current.has(macroId)) {
          return;
        }
        scheduleMacroLoop(macroId);
      }, delay);
      macroLoopTimers.current.set(macroId, timer);
    },
    [clearMacroLoopTimer, playMacroBase],
  );

  const playPendingCapture = useCallback(async () => {
    if (!pendingCapture?.length) return;
    pushEntry(setActivity, {
      id: nanoid(),
      label: 'Playing pending capture',
      tone: 'info',
      meta: `${pendingCapture.length} events`,
      timestamp: Date.now(),
    });
    await executeEvents(pendingCapture);
  }, [executeEvents, pendingCapture]);

  const playMacro = useCallback(
    async (
      id: string,
      options?: { speed?: number; loops?: number; suppressLoop?: boolean },
    ) => {
      const target = macros.find((macro) => macro.id === id);
      if (!target) return;
      await playMacroBase(target, options);
      if (target.loopEnabled && !options?.suppressLoop) {
        scheduleMacroLoop(target.id);
      }
    },
    [macros, playMacroBase, scheduleMacroLoop],
  );

  useEffect(() => {
    if (!nativeRuntime || !macrosHydrated) return;

    const refreshHotkeys = async () => {
      const unregisterAll = Array.from(macroHotkeyBindings.current.values()).map((combo) =>
        unregister(combo).catch(() => undefined),
      );
      await Promise.all(unregisterAll);
      macroHotkeyBindings.current.clear();
      macroHotkeyPressed.current.clear();

      await Promise.all(
        macros
          .filter((macro) => Boolean(macro.hotkey))
          .map(async (macro) => {
            if (!macro.hotkey) return;
            try {
              await register(macro.hotkey, async (event) => {
                if (event.state === 'Pressed') {
                  macroHotkeyPressed.current.set(macro.id, true);
                  return;
                }
                if (event.state === 'Released') {
                  if (!macroHotkeyPressed.current.get(macro.id)) {
                    return;
                  }
                  macroHotkeyPressed.current.set(macro.id, false);
                  const isLooping = activeLoopMacrosRef.current.has(macro.id);
                  const isActivePlayback = currentPlaybackMacroRef.current === macro.id;
                  if (isLooping || isActivePlayback) {
                    stopMacroLoop(macro.id);
                    return;
                  }
                  await playMacro(macro.id);
                }
              });
              macroHotkeyBindings.current.set(macro.id, macro.hotkey);
              macroHotkeyPressed.current.set(macro.id, false);
            } catch (error) {
              console.warn(`macro hotkey registration failed for ${macro.name}`, error);
            }
          }),
      );
    };

    void refreshHotkeys();

    return () => {
      const pending = Array.from(macroHotkeyBindings.current.values()).map((combo) =>
        unregister(combo).catch(() => undefined),
      );
      macroHotkeyBindings.current.clear();
      macroHotkeyPressed.current.clear();
      void Promise.all(pending);
    };
  }, [macros, macrosHydrated, nativeRuntime, playMacro, stopMacroLoop]);

  

  const deleteMacro = useCallback((id: string) => {
    const target = macros.find((macro) => macro.id === id);
    stopMacroLoop(id, { silent: true });

    setMacros((prev) => prev.filter((macro) => macro.id !== id));

    if (target) {
      pushEntry(setActivity, {
        id: nanoid(),
        label: 'Macro removed',
        tone: 'warning',
        meta: target.name,
        timestamp: Date.now(),
      });
    }

    if (selectedMacroId === id) {
      setSelectedMacroId(null);
    }
  }, [macros, selectedMacroId, stopMacroLoop]);

  const stats: MacroStats = useMemo(() => {
    const totalEvents = macros.reduce((sum, macro) => sum + macro.events.length, 0);
    const averageDuration =
      macros.reduce(
        (sum, macro) =>
          sum + (macro.events.length ? macro.events[macro.events.length - 1].offsetMs : 0),
        0,
      ) / Math.max(macros.length, 1);

    return {
      totalMacros: macros.length,
      totalEvents,
      averageDurationMs: averageDuration,
      lastRecordedName: captureName,
      activeProfile: selectedMacroId ? macros.find((m) => m.id === selectedMacroId)?.name ?? 'Untitled' : 'Untitled',
    };
  }, [captureName, macros, selectedMacroId]);

  const queueMacro = useCallback((id: string) => {
    const macro = macros.find((item) => item.id === id);
    if (!macro) return;
    setQueue((current) => [...current, id]);
    pushEntry(setActivity, {
      id: nanoid(),
      label: `${macro.name} queued`,
      tone: 'info',
      timestamp: Date.now(),
    });
  }, [macros]);

  const queuedMacros = useMemo(
    () =>
      queue
        .map((id) => macros.find((macro) => macro.id === id))
        .filter((macro): macro is MacroSequence => Boolean(macro)),
    [queue, macros],
  );

  const stopQueuePlayback = useCallback(
    (options?: { disableLoop?: boolean; silent?: boolean; reason?: string }) => {
      const isRunning = queueRunningRef.current || Boolean(queueLoopTimerRef.current);
      if (!isRunning) {
        if (options?.disableLoop) {
          setQueueLoopEnabled(false);
        }
        return;
      }
      queuePlaybackAbortRef.current.cancelled = true;
      clearQueueLoopTimer();
      setQueueRunning(false);
      if (options?.disableLoop) {
        setQueueLoopEnabled(false);
      }
      void requestStopPlayback();
      if (!options?.silent) {
        pushEntry(setActivity, {
          id: nanoid(),
          label: 'Queue playback stopped',
          tone: 'warning',
          meta: options?.reason,
          timestamp: Date.now(),
        });
      }
    },
    [clearQueueLoopTimer, requestStopPlayback, setQueueLoopEnabled, setQueueRunning],
  );

  const runQueueSequence = useCallback(
    async (macroIds: string[], controller: { cancelled: boolean }) => {
      for (const id of macroIds) {
        if (controller.cancelled) {
          break;
        }
        await playMacro(id, { suppressLoop: true });
        if (controller.cancelled) {
          break;
        }
      }
    },
    [playMacro],
  );

  const scheduleQueueLoop = useCallback(
    (macroIds: string[]) => {
      clearQueueLoopTimer();
      if (!queueLoopEnabledRef.current || !macroIds.length) {
        return;
      }

      const delay = clampLoopDelay(queueLoopDelayRef.current, DEFAULT_QUEUE_LOOP_DELAY_MS);
      queueLoopTimerRef.current = setTimeout(async () => {
        queueLoopTimerRef.current = null;
        if (!queueLoopEnabledRef.current) {
          return;
        }
        setQueue(macroIds);
        pushEntry(setActivity, {
          id: nanoid(),
          label: 'Repeating queue',
          tone: 'info',
          meta: `${macroIds.length} items`,
          timestamp: Date.now(),
        });
        const controller = { cancelled: false };
        queuePlaybackAbortRef.current = controller;
        setQueueRunning(true);
        try {
          await runQueueSequence(macroIds, controller);
        } finally {
          setQueueRunning(false);
        }
        if (!controller.cancelled && queueLoopEnabledRef.current) {
          scheduleQueueLoop(macroIds);
        }
      }, delay);
    },
    [clearQueueLoopTimer, runQueueSequence, setQueueRunning],
  );

  const clearQueue = useCallback(() => {
    if (!queue.length && !queueRunningRef.current) return;
    setQueue([]);
    stopQueuePlayback({ disableLoop: true, silent: true, reason: 'Queue cleared' });
    pushEntry(setActivity, {
      id: nanoid(),
      label: 'Queue cleared',
      tone: 'warning',
      timestamp: Date.now(),
    });
  }, [queue, stopQueuePlayback]);

  const updateMacroLoopSettings = useCallback(
    (id: string, settings: { enabled?: boolean; delayMs?: number }) => {
      const baseline = macrosRef.current.find((macro) => macro.id === id);
      if (!baseline) return;
      const nextEnabled = settings.enabled ?? baseline.loopEnabled ?? false;
      const nextDelay = clampLoopDelay(
        settings.delayMs ?? baseline.loopDelayMs ?? DEFAULT_LOOP_DELAY_MS,
        DEFAULT_LOOP_DELAY_MS,
      );

      setMacros((prev) =>
        prev.map((macro) =>
          macro.id === id
            ? {
                ...macro,
                loopEnabled: nextEnabled,
                loopDelayMs: nextDelay,
              }
            : macro,
        ),
      );

      if (nextEnabled) {
        if (macroLoopTimers.current.has(id)) {
          scheduleMacroLoop(id);
        }
      } else {
        stopMacroLoop(id, { silent: true });
      }
    },
    [scheduleMacroLoop, setMacros, stopMacroLoop],
  );

  const playQueuedMacros = useCallback(async () => {
    if (!queuedMacros.length || queueRunningRef.current) return;
    const itemsToPlay = [...queuedMacros];
    const macroIds = itemsToPlay.map((macro) => macro.id);
    if (queueLoopEnabledRef.current) {
      setQueue(macroIds);
    } else {
      setQueue([]);
    }
    pushEntry(setActivity, {
      id: nanoid(),
      label: 'Playing queued macros',
      tone: 'info',
      meta: `${itemsToPlay.length} items`,
      timestamp: Date.now(),
    });
    const controller = { cancelled: false };
    queuePlaybackAbortRef.current = controller;
    setQueueRunning(true);
    try {
      await runQueueSequence(macroIds, controller);
    } finally {
      setQueueRunning(false);
    }
    if (queueLoopEnabledRef.current && !controller.cancelled) {
      scheduleQueueLoop(macroIds);
    }
  }, [queuedMacros, runQueueSequence, scheduleQueueLoop]);

  useEffect(() => {
    if (!nativeRuntime) return;

    const setup = async () => {
      try {
        if (!queueHotkey) {
          return;
        }
        await register(queueHotkey, async (event) => {
          if (event.state === 'Pressed') {
            queueHotkeyHeldRef.current = true;
            return;
          }
          if (event.state === 'Released') {
            if (!queueHotkeyHeldRef.current) {
              return;
            }
            queueHotkeyHeldRef.current = false;
            if (queueRunningRef.current || queueLoopTimerRef.current) {
              stopQueuePlayback({ disableLoop: true, reason: 'Shortcut' });
            } else {
              await playQueuedMacros();
            }
          }
        });
      } catch (error) {
        console.warn('queue toggle hotkey registration failed', error);
      }
    };

    void setup();

    return () => {
      queueHotkeyHeldRef.current = false;
      if (queueHotkey) {
        void unregister(queueHotkey).catch(() => undefined);
      }
    };
  }, [nativeRuntime, playQueuedMacros, queueHotkey, stopQueuePlayback]);

  const updateQueueLoopSettings = useCallback((settings: { enabled?: boolean; delayMs?: number }) => {
    if (typeof settings.delayMs === 'number' && !Number.isNaN(settings.delayMs)) {
      setQueueLoopDelayMs(
        clampLoopDelay(settings.delayMs, DEFAULT_QUEUE_LOOP_DELAY_MS),
      );
    }
    if (typeof settings.enabled === 'boolean') {
      setQueueLoopEnabled(settings.enabled);
    }
  }, []);

  const updateQueueHotkey = useCallback(
    (value: string | null) => {
      const next = value?.trim() ? value.trim() : null;
      setQueueHotkey(next);
      pushEntry(setActivity, {
        id: nanoid(),
        label: next ? 'Queue hotkey updated' : 'Queue hotkey cleared',
        tone: next ? 'success' : 'warning',
        meta: next ?? undefined,
        timestamp: Date.now(),
      });
    },
    [],
  );

  const updateMacroHotkey = useCallback((id: string, hotkey: string | null) => {
    const target = macros.find((macro) => macro.id === id);
    setMacros((prev) =>
      prev.map((macro) =>
        macro.id === id
          ? {
              ...macro,
              hotkey,
            }
          : macro,
      ),
    );

    if (target) {
      pushEntry(setActivity, {
        id: nanoid(),
        label: hotkey ? `Hotkey bound to ${target.name}` : `Hotkey cleared for ${target.name}`,
        tone: hotkey ? 'success' : 'warning',
        meta: hotkey ?? undefined,
        timestamp: Date.now(),
      });
    }
  }, [macros]);

  const pendingCaptureMetrics = useMemo(() => {
    if (!pendingCapture?.length) {
      return { count: 0, duration: 0 };
    }
    const duration = pendingCapture[pendingCapture.length - 1]?.offsetMs ?? 0;
    return { count: pendingCapture.length, duration };
  }, [pendingCapture]);

  useEffect(() => {
    return () => {
      Array.from(activeLoopMacrosRef.current).forEach((id) => {
        stopMacroLoop(id, { silent: true });
      });
      queuePlaybackAbortRef.current.cancelled = true;
      clearQueueLoopTimer();
      void requestStopPlayback();
    };
  }, [clearQueueLoopTimer, requestStopPlayback, stopMacroLoop]);

  return {
    macros,
    stats,
    recording,
    recentEvents,
    activity,
    selectedMacroId,
    setSelectedMacroId,
    captureName,
    setCaptureName,
    statusText,
    startRecording,
    stopRecording,
    savePendingCapture,
    playPendingCapture,
    discardPendingCapture,
    playMacro,
    deleteMacro,
    queueMacro,
    queue,
    queuedMacros,
    playQueuedMacros,
    clearQueue,
    queueRunning,
    queueHotkey,
    updateQueueHotkey,
    updateMacroLoopSettings,
    updateMacroHotkey,
    queueLoopEnabled,
    queueLoopDelayMs,
    updateQueueLoopSettings,
    isPlaying,
    pendingCaptureMetrics,
    hasPendingCapture: Boolean(pendingCapture?.length),
  };
};
