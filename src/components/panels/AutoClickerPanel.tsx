import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { AutoClickerConfig, AutoClickerMetrics } from '../../utils/macroTypes';
import { HotkeyField } from '../shared/HotkeyField';

interface AutoClickerPanelProps {
  config: AutoClickerConfig;
  metrics: AutoClickerMetrics;
  running: boolean;
  configSummary: string;
  updateConfig: (partial: Partial<AutoClickerConfig>) => void;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
}

const buttons: AutoClickerConfig['button'][] = ['left', 'right', 'middle'];

export const AutoClickerPanel: React.FC<AutoClickerPanelProps> = ({
  config,
  metrics,
  running,
  updateConfig,
  onStart,
  onStop,
  configSummary,
}) => {
  const isInfiniteBurst = config.burst === null;

  const controlBoxClasses =
    'flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80';

  return (
    <section className="glass-panel flex h-full flex-col rounded-3xl p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-white/50">Auto clicker</p>
        <h2 className="text-2xl font-semibold text-white">Auto clicker</h2>
      </div>
      <Zap className={running ? 'text-brand-accent animate-pulse' : 'text-white/50'} size={24} />
    </div>

    <div className="mt-5 grid gap-3 text-sm text-white/70">
      <div className="flex items-center justify-between">
        <span>Current profile</span>
        <span className="font-semibold text-white">{configSummary}</span>
      </div>
      <div className="flex items-center justify-between">
        <span>Total clicks</span>
        <span className="font-semibold text-white">{metrics.totalClicks}</span>
      </div>
    </div>

    <div className="mt-6">
      <p className="text-xs uppercase tracking-[0.4em] text-white/50">Button</p>
      <div className="mt-3 flex gap-2">
        {buttons.map((button) => (
          <button
            key={button}
            onClick={() => updateConfig({ button })}
            className={`rounded-2xl border px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] ${
              config.button === button
                ? 'border-white bg-white/80 text-black'
                : 'border-white/10 bg-white/5 text-white/60'
            }`}
          >
            {button}
          </button>
        ))}
      </div>
    </div>

    <div className="mt-6 space-y-6">
      <div>
        <label className="block text-xs uppercase tracking-[0.4em] text-white/50">
          Interval · {config.intervalMs} ms
        </label>
        <div className="mt-3 flex items-center gap-4">
          <input
            type="range"
            min={15}
            max={400}
            value={config.intervalMs}
            onChange={(event) => updateConfig({ intervalMs: Number(event.target.value) })}
            className="w-full accent-brand-primary"
          />
          <input
            type="number"
            min={15}
            max={400}
            value={config.intervalMs}
            onChange={(event) => {
              const value = event.target.value;
              if (value === '') {
                return;
              }
              updateConfig({ intervalMs: Number(value) });
            }}
            className={controlBoxClasses}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-[0.4em] text-white/50">
          Jitter · {config.jitterMs} ms
        </label>
        <div className="mt-3 flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={120}
            value={config.jitterMs}
            onChange={(event) => updateConfig({ jitterMs: Number(event.target.value) })}
            className="w-full accent-brand-secondary"
          />
          <input
            type="number"
            min={0}
            max={120}
            value={config.jitterMs}
            onChange={(event) => {
              const value = event.target.value;
              if (value === '') {
                return;
              }
              updateConfig({ jitterMs: Number(value) });
            }}
            className={controlBoxClasses}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.4em] text-white/50">
          <span>Burst limit</span>
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() =>
              updateConfig({
                burst: isInfiniteBurst ? config.burst ?? 100 : null,
              })
            }
            className={`relative flex items-center rounded-full border border-white/15 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] transition-colors ${
              isInfiniteBurst ? 'bg-brand-secondary/80 text-white' : 'bg-white/10 text-white/60'
            }`}
          >
            {isInfiniteBurst ? 'Infinite' : 'Finite'}
          </motion.button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1">
            <input
              type="number"
              min={1}
              value={config.burst ?? ''}
              onChange={(event) =>
                updateConfig({ burst: event.target.value ? Number(event.target.value) : null })
              }
              placeholder="∞"
              disabled={isInfiniteBurst}
              className={`${controlBoxClasses} w-full disabled:cursor-not-allowed disabled:opacity-40`}
            />
          </div>
          <span className="text-xs uppercase tracking-[0.3em] text-white/50">
            {isInfiniteBurst ? 'Unlimited' : 'Clicks'}
          </span>
        </div>
      </div>
    </div>

    <div className="mt-6">
      <HotkeyField
        label="Autoclicker hotkey"
        value={config.hotkey ?? null}
        onChange={(value) => updateConfig({ hotkey: value ?? null })}
        helper="Press any key combo to toggle the auto clicker globally."
        placeholder="CommandOrControl+Shift+A"
      />
    </div>

    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={running ? onStop : onStart}
      className={`mt-6 flex items-center justify-center gap-3 rounded-2xl px-6 py-4 text-lg font-semibold text-white ${
        running ? 'bg-red-500/80' : 'bg-brand-secondary/80'
      }`}
    >
      {running ? 'Stop auto clicker' : 'Start auto clicker'}
    </motion.button>
  </section>
);
};
