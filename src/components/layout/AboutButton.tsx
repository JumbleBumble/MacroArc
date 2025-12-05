import { AnimatePresence, motion } from 'framer-motion';
import { Info, X } from 'lucide-react';
import { useState, type FC } from 'react';
import { useTheme } from '../../hooks/useTheme';

export const AboutButton: FC = () => {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const isDark = theme === 'dark';

  const textPrimary = isDark ? 'text-white' : 'text-zinc-900';
  const textSecondary = isDark ? 'text-white/60' : 'text-zinc-600';

  return (
    <>
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(true)}
        className={`glass-panel relative flex items-center gap-3 rounded-full px-4 py-2 text-sm font-medium ${textPrimary}`}
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
          <Info size={18} />
        </span>
        <div className="text-left">
          <div className={`text-xs uppercase tracking-[0.2em] ${textSecondary}`}>About</div>
          <div className="text-base font-semibold tracking-normal">MacroArc</div>
        </div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className={`glass-panel relative w-[min(90vw,420px)] rounded-3xl border border-white/10 p-6 ${textPrimary}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-xs uppercase tracking-[0.3em] ${textSecondary}`}>License</p>
                  <h2 className="text-2xl font-semibold">MacroArc About</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
                  aria-label="Close about dialog"
                >
                  <X size={16} />
                </button>
              </div>

              <div className={`mt-6 space-y-3 text-sm leading-relaxed ${textSecondary}`}>
                <p className={textPrimary}>MacroArc © 2025 Jumble</p>
                <p>
                  This project is released under the GNU General Public License v3.0. You are free to run,
                  study, share, and modify the software so long as derivative works remain under the same
                  license, and the original notices stay intact.
                </p>
                <p>
                  There is no warranty provided. See the accompanying LICENSE file or visit
                  {' '}
                  <a
                    className="text-brand-primary underline-offset-4 hover:underline"
                    href="https://www.gnu.org/licenses/gpl-3.0.en.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    gnu.org/licenses/gpl-3.0
                  </a>
                  {' '}
                  for the full terms.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
