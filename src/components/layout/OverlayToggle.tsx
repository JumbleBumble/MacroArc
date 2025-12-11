import { motion } from 'framer-motion';
import { AppWindow, PanelsTopLeft } from 'lucide-react';

interface OverlayToggleProps {
  active: boolean;
  onToggle: () => void;
}

export const OverlayToggle: React.FC<OverlayToggleProps> = ({ active, onToggle }) => {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onToggle}
      className="glass-panel relative flex items-center gap-3 rounded-full px-4 py-2 text-sm font-medium text-white"
    >
      <span
        className={`relative flex h-9 w-9 items-center justify-center rounded-full ${
          active ? 'bg-brand-secondary/40 text-white' : 'bg-white/10 text-white/80'
        }`}
      >
        {active ? <PanelsTopLeft size={18} /> : <AppWindow size={18} />}
      </span>
      <div className="text-left text-xs uppercase tracking-[0.2em] text-white/60">
        Overlay
        <div className="text-base font-semibold tracking-normal text-white">
          {active ? 'Multi Window' : 'Single View'}
        </div>
      </div>
      <span
        className={`ml-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
          active ? 'bg-white/20 text-white' : 'bg-white/5 text-white/70'
        }`}
      >
        {active ? 'On' : 'Off'}
      </span>
    </motion.button>
  );
};
