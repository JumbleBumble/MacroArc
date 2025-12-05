import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={toggleTheme}
      className="glass-panel relative flex items-center gap-3 rounded-full px-4 py-2 text-sm font-medium text-white"
    >
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
        {isDark ? <Moon size={18} /> : <Sun size={18} className="text-yellow-400" />}
      </span>
      <div className="text-left text-xs uppercase tracking-[0.2em] text-white/60">
        Theme
        <div className="text-base font-semibold tracking-normal text-white">
          {isDark ? 'Night' : 'Day'}
        </div>
      </div>
    </motion.button>
  );
};
