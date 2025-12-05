import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { AutoClickerConfig, AutoClickerMetrics } from '../utils/macroTypes';
import { isTauri } from '../utils/bridge';
import { getAppLocalDataPath } from '../utils/storage';

const AUTOCLICKER_TOGGLE_SHORTCUT = 'CommandOrControl+Shift+A';
const AUTOCLICKER_STORAGE_KEY = 'macroarc.autoclicker.config';
const AUTOCLICKER_STORAGE_FILENAME = 'macroarc.autoclicker.json';

const baseConfig: AutoClickerConfig = {
  button: 'left',
  intervalMs: 70,
  jitterMs: 10,
  burst: null,
  hotkey: AUTOCLICKER_TOGGLE_SHORTCUT,
};

const parseStoredConfig = (raw: string | null): Partial<AutoClickerConfig> | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AutoClickerConfig>;
    return typeof parsed === 'object' && parsed ? parsed : null;
  } catch (error) {
    console.warn('autoclicker config parse failed', error);
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

export const useAutoClicker = () => {
  const [config, setConfig] = useState<AutoClickerConfig>(baseConfig);
  const [running, setRunning] = useState(false);
  const [metrics, setMetrics] = useState<AutoClickerMetrics>({
    totalClicks: 0,
    burstsCompleted: 0,
    lastTick: null,
  });
  const nativeRuntime = isTauri();
  const [configHydrated, setConfigHydrated] = useState(!nativeRuntime);
  const mockInterval = useRef<number | null>(null);
  const registeredShortcutRef = useRef<string | null>(null);
  const hotkeyHeldRef = useRef(false);

  useEffect(() => {
    if (!nativeRuntime) return;
    let unlistenTick: (() => void) | undefined;
    let unlistenDone: (() => void) | undefined;

    (async () => {
      unlistenTick = await listen<number>('autoclicker://tick', ({ payload }) => {
        setMetrics((prev) => ({
          ...prev,
          totalClicks: payload,
          lastTick: Date.now(),
        }));
      });

      unlistenDone = await listen<number>('autoclicker://done', ({ payload }) => {
        setMetrics((prev) => ({
          ...prev,
          totalClicks: payload,
          burstsCompleted: prev.burstsCompleted + 1,
        }));
        setRunning(false);
      });
    })();

    return () => {
      unlistenTick?.();
      unlistenDone?.();
    };
  }, [nativeRuntime]);

  useEffect(() => () => {
    if (mockInterval.current) {
      window.clearInterval(mockInterval.current);
    }
  }, []);

  useEffect(() => {
    if (nativeRuntime || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(AUTOCLICKER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AutoClickerConfig>;
      setConfig((prev) => ({
        ...prev,
        ...parsed,
      }));
    } catch (error) {
      console.warn('autoclicker config load failed', error);
    }
  }, [nativeRuntime]);

  useEffect(() => {
    if (nativeRuntime || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(AUTOCLICKER_STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
      console.warn('autoclicker config persist failed', error);
    }
  }, [config, nativeRuntime]);

  useEffect(() => {
    if (!nativeRuntime) return;
    let cancelled = false;

    (async () => {
      try {
        const path = await getAppLocalDataPath(AUTOCLICKER_STORAGE_FILENAME);
        const raw = await readTextFile(path);
        const parsed = parseStoredConfig(raw);
        if (!cancelled && parsed) {
          setConfig((prev) => ({
            ...prev,
            ...parsed,
          }));
        }
      } catch (error) {
        if (!isMissingFileError(error)) {
          console.warn('autoclicker config file read failed', error);
        }
      } finally {
        if (!cancelled) {
          setConfigHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nativeRuntime]);

  useEffect(() => {
    if (!nativeRuntime || !configHydrated) return;
    const persist = async () => {
      try {
        const path = await getAppLocalDataPath(AUTOCLICKER_STORAGE_FILENAME);
        await writeTextFile(path, JSON.stringify(config));
      } catch (error) {
        console.warn('autoclicker config file write failed', error);
      }
    };

    void persist();
  }, [config, nativeRuntime, configHydrated]);

  const updateConfig = useCallback((partial: Partial<AutoClickerConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  }, []);

  const start = useCallback(async () => {
    if (running) return;
    setMetrics((prev) => ({ ...prev, totalClicks: 0, lastTick: null }));

    if (nativeRuntime) {
      await invoke('start_autoclicker', {
        config: {
          button: config.button,
          interval_ms: config.intervalMs,
          jitter_ms: config.jitterMs,
          burst: config.burst,
        },
      });
    } else {
      mockInterval.current = window.setInterval(() => {
        setMetrics((prev) => ({
          ...prev,
          totalClicks: prev.totalClicks + 1,
          lastTick: Date.now(),
        }));
      }, Math.max(10, config.intervalMs));
    }

    setRunning(true);
  }, [config, nativeRuntime, running]);

  const stop = useCallback(async () => {
    if (!running) return;
    if (nativeRuntime) {
      await invoke('stop_autoclicker');
    }
    if (mockInterval.current) {
      window.clearInterval(mockInterval.current);
      mockInterval.current = null;
    }
    setRunning(false);
  }, [nativeRuntime, running]);

  useEffect(() => {
    if (!nativeRuntime) return;

    const shortcut = config.hotkey || AUTOCLICKER_TOGGLE_SHORTCUT;

    const setupShortcut = async () => {
      try {
        if (registeredShortcutRef.current) {
          await unregister(registeredShortcutRef.current).catch(() => undefined);
        }
        await register(shortcut, async (event) => {
          try {
            if (event.state === 'Released') {
              if (!hotkeyHeldRef.current) {
                return;
              }
              hotkeyHeldRef.current = false;
              if (running) {
                await stop();
              } else {
                await start();
              }
              return;
            }
            if (event.state === 'Pressed') {
              hotkeyHeldRef.current = true;
            }
          } catch (error) {
            console.warn('autoclicker hotkey toggle failed', error);
          }
        });
        registeredShortcutRef.current = shortcut;
      } catch (error) {
        console.warn('autoclicker hotkey registration failed', error);
      }
    };

    void setupShortcut();

    return () => {
      if (registeredShortcutRef.current) {
        void unregister(registeredShortcutRef.current).catch(() => undefined);
        registeredShortcutRef.current = null;
        hotkeyHeldRef.current = false;
      }
    };
  }, [config.hotkey, nativeRuntime, running, start, stop]);

  const configSummary = useMemo(
    () => `${config.button} · ${(60000 / Math.max(config.intervalMs, 1)).toFixed(0)} cpm`,
    [config.button, config.intervalMs],
  );

  return {
    config,
    configSummary,
    updateConfig,
    start,
    stop,
    running,
    metrics,
  };
};
