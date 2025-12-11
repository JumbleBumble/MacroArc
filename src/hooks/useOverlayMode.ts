import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Window as TauriWindow } from '@tauri-apps/api/window';
import { isTauri } from '../utils/bridge';

export type OverlayBubbleId =
  | 'recorder'
  | 'autoclicker'
  | 'library'
  | 'activity'
  | 'insights';

export interface OverlayBubbleState {
  id: OverlayBubbleId;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  expanded: boolean;
}

export interface OverlayGeometryPayload {
  id: OverlayBubbleId;
  x: number;
  y: number;
  width: number;
  height: number;
  expanded: boolean;
}

export const COLLAPSED_OVERLAY_WIDTH = 260;
export const COLLAPSED_OVERLAY_HEIGHT = 120;

const LAYOUT_STORAGE_KEY = 'macroarc.overlay.layout.v1';
const GEOMETRY_EVENT = 'overlay://geometry';
const MODE_EVENT = 'overlay://mode';
const supportsNativeOverlay = isTauri();
const isBrowser = typeof window !== 'undefined';

export const DEFAULT_OVERLAY_BUBBLES: OverlayBubbleState[] = [
  {
    id: 'recorder',
    title: 'Macro Recorder',
    x: 520,
    y: 48,
    width: 460,
    height: 520,
    expanded: true,
  },
  {
    id: 'autoclicker',
    title: 'Auto Clicker',
    x: 104,
    y: 330,
    width: 370,
    height: 340,
    expanded: true,
  },
  {
    id: 'library',
    title: 'Macro Library',
    x: 740,
    y: 140,
    width: 520,
    height: 540,
    expanded: true,
  },
  {
    id: 'activity',
    title: 'Activity Feed',
    x: 80,
    y: 720,
    width: 360,
    height: 320,
    expanded: true,
  },
  {
    id: 'insights',
    title: 'Insights',
    x: 480,
    y: 660,
    width: 440,
    height: 320,
    expanded: true,
  },
];

const orderedIds = DEFAULT_OVERLAY_BUBBLES.map((bubble) => bubble.id) as OverlayBubbleId[];

const isOverlayId = (value: string): value is OverlayBubbleId =>
  orderedIds.includes(value as OverlayBubbleId);

const mergeWithDefaults = (layout: OverlayBubbleState[] | null): OverlayBubbleState[] => {
  if (!layout || !Array.isArray(layout)) {
    return DEFAULT_OVERLAY_BUBBLES;
  }

  const map = new Map<OverlayBubbleId, OverlayBubbleState>();
  layout.forEach((bubble) => {
    const template = DEFAULT_OVERLAY_BUBBLES.find((item) => item.id === bubble.id);
    if (!template) {
      return;
    }
    map.set(bubble.id, {
      ...template,
      ...bubble,
      title: template.title,
    });
  });

  return DEFAULT_OVERLAY_BUBBLES.map((bubble) => map.get(bubble.id) ?? bubble);
};

const loadLayout = (): OverlayBubbleState[] => {
  if (!isBrowser) {
    return DEFAULT_OVERLAY_BUBBLES;
  }

  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_OVERLAY_BUBBLES;
    }
    const parsed = JSON.parse(raw) as OverlayBubbleState[];
    return mergeWithDefaults(parsed);
  } catch (error) {
    console.warn('overlay layout restore failed', error);
    return DEFAULT_OVERLAY_BUBBLES;
  }
};

export const getStoredOverlayLayout = () => loadLayout();

export const getOverlayTemplate = (id: OverlayBubbleId) =>
  DEFAULT_OVERLAY_BUBBLES.find((bubble) => bubble.id === id);

const serializeLayout = (layout: OverlayBubbleState[]) =>
  layout.map(({ id, title, x, y, width, height, expanded }) => ({
    id,
    title,
    x,
    y,
    width,
    height,
    expanded,
  }));

export const useOverlayMode = () => {
  const [enabled, setEnabled] = useState(false);
  const [bubbles, setBubbles] = useState<OverlayBubbleState[]>(() => loadLayout());
  const layoutRef = useRef(bubbles);
  const enabledRef = useRef(enabled);
  const mainWindowRef = useRef<TauriWindow | null>(supportsNativeOverlay ? getCurrentWindow() : null);

  useEffect(() => {
    layoutRef.current = bubbles;
  }, [bubbles]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!isBrowser) {
      return;
    }
    document.body.classList.toggle('overlay-mode-active', enabled);
    return () => {
      document.body.classList.remove('overlay-mode-active');
    };
  }, [enabled]);

  const persistLayout = useCallback((next: OverlayBubbleState[]) => {
    if (!isBrowser) {
      return;
    }
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn('overlay layout persist failed', error);
    }
  }, []);

  const syncNativeLayout = useCallback(
    (layout: OverlayBubbleState[]) => {
      if (!supportsNativeOverlay || !enabled || !layout.length) {
        return;
      }
      invoke('sync_overlay_windows', { layout: serializeLayout(layout) }).catch((error: unknown) =>
        console.warn('overlay layout sync failed', error)
      );
    },
    [enabled]
  );

  const applyLayout = useCallback(
    (updater: (prev: OverlayBubbleState[]) => OverlayBubbleState[], options?: { syncNative?: boolean }) => {
      setBubbles((prev) => {
        const next = updater(prev);
        persistLayout(next);
        if (options?.syncNative) {
          syncNativeLayout(next);
        }
        return next;
      });
    },
    [persistLayout, syncNativeLayout]
  );

  const updateBubble = useCallback(
    (id: OverlayBubbleId, patch: Partial<OverlayBubbleState>, options?: { silent?: boolean }) => {
      applyLayout(
        (prev) =>
          prev.map((bubble) =>
            bubble.id === id
              ? {
                  ...bubble,
                  ...patch,
                }
              : bubble
          ),
        { syncNative: !options?.silent }
      );
    },
    [applyLayout]
  );

  const resetLayout = useCallback(() => {
    applyLayout(() => DEFAULT_OVERLAY_BUBBLES, { syncNative: true });
  }, [applyLayout]);

  const enableNative = useCallback((layout: OverlayBubbleState[]) => {
    if (!supportsNativeOverlay) {
      return;
    }
    invoke('enable_overlay_windows', { layout: serializeLayout(layout) }).catch((error: unknown) =>
      console.warn('overlay enable failed', error)
    );
  }, []);

  const disableNative = useCallback(() => {
    if (!supportsNativeOverlay) {
      return;
    }
    invoke('disable_overlay_windows', {}).catch((error: unknown) =>
      console.warn('overlay disable failed', error)
    );
  }, []);

  const hideMainWindow = useCallback(() => {
    if (!supportsNativeOverlay) {
      return;
    }
    const windowHandle = mainWindowRef.current ?? getCurrentWindow();
    mainWindowRef.current = windowHandle;
    windowHandle.hide().catch((error: unknown) => console.warn('main window hide failed', error));
  }, []);

  const showMainWindow = useCallback(() => {
    if (!supportsNativeOverlay) {
      return;
    }
    const windowHandle = mainWindowRef.current ?? getCurrentWindow();
    mainWindowRef.current = windowHandle;
    windowHandle.show().catch((error: unknown) => console.warn('main window show failed', error));
  }, []);

  useEffect(() => {
    return () => {
      if (supportsNativeOverlay && enabledRef.current) {
        disableNative();
      }
    };
  }, [disableNative]);

  const toggleOverlay = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (supportsNativeOverlay) {
        if (next) {
          hideMainWindow();
          enableNative(layoutRef.current);
        } else {
          disableNative();
          showMainWindow();
        }
      }
      return next;
    });
  }, [disableNative, enableNative, hideMainWindow, showMainWindow]);

  useEffect(() => {
    if (!supportsNativeOverlay) {
      return;
    }

    let geometryUnlisten: (() => void) | undefined;
    let modeUnlisten: (() => void) | undefined;

    listen<OverlayGeometryPayload>(GEOMETRY_EVENT, (event) => {
      const payload = event.payload;
      if (!payload || !isOverlayId(payload.id)) {
        return;
      }
      updateBubble(
        payload.id,
        {
          x: payload.x,
          y: payload.y,
          width: payload.width,
          height: payload.height,
          expanded: payload.expanded,
        },
        { silent: true }
      );
    })
      .then((unlisten) => {
        geometryUnlisten = unlisten;
      })
      .catch((error: unknown) => console.warn('overlay geometry listen failed', error));

    listen<boolean>(MODE_EVENT, (event) => {
      if (typeof event.payload === 'boolean') {
        setEnabled(event.payload);
        if (event.payload) {
          hideMainWindow();
        } else {
          showMainWindow();
        }
      }
    })
      .then((unlisten) => {
        modeUnlisten = unlisten;
      })
      .catch((error: unknown) => console.warn('overlay mode listen failed', error));

    return () => {
      geometryUnlisten?.();
      modeUnlisten?.();
      showMainWindow();
    };
  }, [supportsNativeOverlay, updateBubble, hideMainWindow, showMainWindow]);

  return useMemo(
    () => ({
      enabled,
      bubbles,
      toggleOverlay,
      updateBubble,
      resetLayout,
      supportsNativeOverlay,
    }),
    [enabled, bubbles, toggleOverlay, updateBubble, resetLayout, supportsNativeOverlay]
  );
};
