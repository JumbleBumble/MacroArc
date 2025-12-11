import { ReactNode, useState } from 'react';
import { motion } from 'framer-motion';
import { PanelsTopLeft, RefreshCcw, X } from 'lucide-react';
import { OverlayBubbleState, OverlayBubbleId } from '../../hooks/useOverlayMode';
import { OverlayBubble } from './OverlayBubble';

interface OverlayCanvasProps {
  bubbles: OverlayBubbleState[];
  content: Record<OverlayBubbleId, ReactNode>;
  updateBubble: (id: OverlayBubbleId, patch: Partial<OverlayBubbleState>) => void;
  onExit: () => void;
  onResetLayout: () => void;
}

export const OverlayCanvas: React.FC<OverlayCanvasProps> = ({
  bubbles,
  content,
  updateBubble,
  onExit,
  onResetLayout,
}) => {
  const [activeId, setActiveId] = useState<OverlayBubbleId | null>(null);

  return (
    <div className="overlay-canvas">
      <motion.div
        className="overlay-canvas__backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="overlay-canvas__toolbar glass-panel"
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white/10 p-2 text-white">
            <PanelsTopLeft size={16} />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">Overlay Mode</p>
            <p className="text-sm font-semibold text-white">Panels float independently</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="overlay-toolbar__button" onClick={onResetLayout}>
            <RefreshCcw size={14} />
            Reset Layout
          </button>
          <button type="button" className="overlay-toolbar__button overlay-toolbar__button--accent" onClick={onExit}>
            <X size={14} />
            Exit Overlay
          </button>
        </div>
      </motion.div>

      {bubbles.map((bubble, index) => (
        <OverlayBubble
          key={bubble.id}
          state={bubble}
          active={activeId === bubble.id}
          zIndex={activeId === bubble.id ? 80 : 60 + index}
          onFocus={() => setActiveId(bubble.id)}
          onMove={(position) => updateBubble(bubble.id, position)}
          onToggleExpand={() => updateBubble(bubble.id, { expanded: !bubble.expanded })}
        >
          {content[bubble.id]}
        </OverlayBubble>
      ))}
    </div>
  );
};
