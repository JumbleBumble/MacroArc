import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Window, getCurrentWindow } from '@tauri-apps/api/window';
import { GripVertical, Maximize2, Minimize2, Minus, X } from 'lucide-react';
import {
  COLLAPSED_OVERLAY_HEIGHT,
  COLLAPSED_OVERLAY_WIDTH,
  OverlayBubbleId,
  OverlayGeometryPayload,
  getOverlayTemplate,
  getStoredOverlayLayout,
} from '../../hooks/useOverlayMode';
import { isTauri } from '../../utils/bridge';

interface OverlayPanelWindowProps {
  id: OverlayBubbleId;
  children: ReactNode;
}

const nativeEnvironment = isTauri();

const getInitialLayout = (id: OverlayBubbleId) => {
  const stored = getStoredOverlayLayout().find((bubble) => bubble.id === id);
  return stored ?? getOverlayTemplate(id);
};

export const OverlayPanelWindow: React.FC<OverlayPanelWindowProps> = ({ id, children }) => {
  const layoutTemplate = useMemo(() => getInitialLayout(id), [id]);
  const [expanded, setExpanded] = useState(layoutTemplate?.expanded ?? true);
  const [panelSize, setPanelSize] = useState({
    width: layoutTemplate?.width ?? 420,
    height: layoutTemplate?.height ?? 320,
  });
  const title = layoutTemplate?.title ?? 'Overlay Panel';
  const windowHandleRef = useRef<Window | null>(null);

  const ensureWindowHandle = useCallback(() => {
    if (!nativeEnvironment) {
      return null;
    }
    if (!windowHandleRef.current) {
      windowHandleRef.current = getCurrentWindow();
    }
    return windowHandleRef.current;
  }, [nativeEnvironment]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.classList.add('overlay-panel-window');
    return () => {
      document.body.classList.remove('overlay-panel-window');
    };
  }, []);

  useEffect(() => {
    if (!nativeEnvironment) {
      return;
    }
    let unlisten: (() => void) | undefined;
    listen<OverlayGeometryPayload>('overlay://geometry', (event) => {
      const payload = event.payload;
      if (!payload || payload.id !== id) {
        return;
      }
      setExpanded(payload.expanded);
      if (payload.expanded) {
        setPanelSize({ width: payload.width, height: payload.height });
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((error) => console.warn('overlay geometry listener failed', error));

    return () => {
      unlisten?.();
    };
  }, [id]);

  useEffect(() => {
    if (!nativeEnvironment) {
      return;
    }
    const handle = ensureWindowHandle();
    handle?.setAlwaysOnTop(expanded).catch((error) => console.warn('overlay topmost toggle failed', error));
  }, [expanded, ensureWindowHandle, nativeEnvironment]);

  const sendResize = useCallback(
    (nextExpanded: boolean) => {
      setExpanded(nextExpanded);
      if (!nativeEnvironment) {
        return;
      }
      const width = nextExpanded ? panelSize.width : COLLAPSED_OVERLAY_WIDTH;
      const height = nextExpanded ? panelSize.height : COLLAPSED_OVERLAY_HEIGHT;
      invoke('resize_overlay_window', {
        id,
        width,
        height,
        expanded: nextExpanded,
      }).catch((error) => console.warn('overlay resize failed', error));
    },
    [id, panelSize.height, panelSize.width]
  );

  const handleToggleSize = useCallback(() => {
    sendResize(!expanded);
  }, [expanded, sendResize]);

  const handleMinimize = useCallback(() => {
    if (!nativeEnvironment) {
      return;
    }
    ensureWindowHandle()
      ?.minimize()
      .catch((error) => console.warn('overlay minimize failed', error));
  }, [ensureWindowHandle, nativeEnvironment]);

  const handleClose = useCallback(() => {
    if (!nativeEnvironment) {
      if (typeof window !== 'undefined') {
        window.close();
      }
      return;
    }
    invoke('close_overlay_window', { id }).catch((error) => console.warn('overlay close failed', error));
  }, [id]);

  return (
		<div
			data-tauri-drag-region
			className="overlay-panel-window__chrome glass-panel-ur"
		>
			<div
				className="overlay-panel-window__header"
				data-tauri-drag-region
			>
				<div
					data-tauri-drag-region
					className="overlay-panel-window__title"
				>
					<GripVertical size={14} className="opacity-70" />
					<span data-tauri-drag-region>{title}</span>
				</div>
				<div
					data-tauri-drag-region
					className="overlay-panel-window__actions"
				>
          {nativeEnvironment && (
            <button
              type="button"
              onClick={handleMinimize}
              aria-label="Minimize window"
            >
              <Minus size={14} />
            </button>
          )}
					<button
						type="button"
						onClick={handleToggleSize}
						aria-label={
							expanded ? 'Collapse panel' : 'Expand panel'
						}
					>
						{expanded ? (
							<Minimize2 size={14} />
						) : (
							<Maximize2 size={14} />
						)}
					</button>
					<button
						type="button"
						onClick={handleClose}
						aria-label="Close panel"
					>
						<X size={14} />
					</button>
				</div>
			</div>
			<div className="overlay-panel-window__body">{children}</div>
		</div>
  )
};
