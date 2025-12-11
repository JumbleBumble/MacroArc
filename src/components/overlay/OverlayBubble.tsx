import { ReactNode, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical, Maximize2, Minimize2 } from 'lucide-react';
import { COLLAPSED_OVERLAY_HEIGHT, COLLAPSED_OVERLAY_WIDTH, OverlayBubbleState } from '../../hooks/useOverlayMode';

interface OverlayBubbleProps {
  state: OverlayBubbleState;
  children: ReactNode;
  onMove: (position: { x: number; y: number }) => void;
  onToggleExpand: () => void;
  onFocus: () => void;
  active: boolean;
  zIndex: number;
}

const clampValue = (value: number, min: number, max: number) => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

export const OverlayBubble: React.FC<OverlayBubbleProps> = ({
  state,
  children,
  onMove,
  onToggleExpand,
  onFocus,
  active,
  zIndex,
}) => {
  const handleDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      if (typeof window === 'undefined') {
        return;
      }

      event.preventDefault();
      onFocus();

      const startX = event.clientX;
      const startY = event.clientY;
      const originX = state.x;
      const originY = state.y;
      const margin = 24;

      const currentWidth = state.expanded ? state.width : COLLAPSED_OVERLAY_WIDTH;
      const currentHeight = state.expanded ? state.height : COLLAPSED_OVERLAY_HEIGHT;

      const handleMove = (moveEvent: PointerEvent) => {
        const rawX = originX + (moveEvent.clientX - startX);
        const rawY = originY + (moveEvent.clientY - startY);
        const maxX = Math.max(margin, window.innerWidth - currentWidth - margin);
        const maxY = Math.max(margin, window.innerHeight - currentHeight - margin);
        const next = {
          x: clampValue(Math.round(rawX), margin, maxX),
          y: clampValue(Math.round(rawY), margin, maxY),
        };
        onMove(next);
      };

      const previousUserSelect = document.body.style.userSelect;

      const stopDragging = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', stopDragging);
        document.body.style.userSelect = previousUserSelect;
      };

      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', stopDragging);
    },
    [onFocus, onMove, state.expanded, state.height, state.width, state.x, state.y]
  );

  const bodyContent = state.expanded ? (
    children
  ) : (
    <div className="flex h-full w-full items-center justify-center text-center text-xs uppercase tracking-[0.3em] text-white/50">
      Tap to expand
    </div>
  );

  return (
    <div
      className={`overlay-bubble glass-panel ${active ? 'overlay-bubble--active' : ''}`}
      style={{
        width: state.expanded ? state.width : COLLAPSED_OVERLAY_WIDTH,
        height: state.expanded ? state.height : COLLAPSED_OVERLAY_HEIGHT,
        transform: `translate3d(${state.x}px, ${state.y}px, 0)`,
        zIndex,
      }}
    >
      <div
        className="overlay-bubble__header"
        onPointerDown={handleDragStart}
        onDoubleClick={onToggleExpand}
        role="toolbar"
      >
        <div className="flex items-center gap-2 text-white/70">
          <GripVertical size={14} className="opacity-60" />
          <span className="text-sm font-semibold text-white/90">{state.title}</span>
        </div>
        <button
          type="button"
          className="overlay-bubble__icon"
          onClick={onToggleExpand}
          aria-label={state.expanded ? 'Collapse bubble' : 'Expand bubble'}
        >
          {state.expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
      <div className="overlay-bubble__body" onMouseDown={onFocus}>
        {bodyContent}
      </div>
    </div>
  );
};
