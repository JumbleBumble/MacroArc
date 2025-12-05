import { motion } from 'framer-motion';
import { formatMilliseconds, formatNumber } from '../../utils/format';
import { MacroStats } from '../../utils/macroTypes';

interface HeroBannerProps {
  stats: MacroStats;
  autoclickerSummary: string;
  autoclickerRunning: boolean;
}

const statItems = (
  stats: MacroStats,
  autoclickerSummary: string,
  autoclickerRunning: boolean,
) => [
  {
    label: 'Macros Ready',
    value: stats.totalMacros,
    meta: `${stats.totalEvents} steps cached`,
  },
  {
    label: 'Avg Duration',
    value: formatMilliseconds(stats.averageDurationMs),
    meta: stats.lastRecordedName,
  },
  {
    label: 'Auto Clicker',
    value: autoclickerRunning ? 'Running' : 'Idle',
    meta: autoclickerSummary,
  },
];

export const HeroBanner: React.FC<HeroBannerProps> = ({
  stats,
  autoclickerRunning,
  autoclickerSummary,
}) => (
  <motion.section
    initial={{ opacity: 0, y: 26 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.7 }}
    className="glass-panel relative overflow-hidden rounded-3xl p-8"
  >
    <div className="absolute inset-0 opacity-60">
    <div className="h-full w-full bg-linear-to-br from-brand-primary/20 via-transparent to-brand-secondary/10" />
    </div>
    <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.6em] text-white/50">MacroArc</p>
        <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
          Precision control for every repetitive macro.
        </h1>
        <p className="mt-3 max-w-2xl text-base text-white/70">
          Record, remix, and deploy complex input patterns across apps in seconds.
        </p>
      </div>
      <div className="grid w-full gap-4 sm:grid-cols-3">
        {statItems(stats, autoclickerSummary, autoclickerRunning).map((item) => (
          <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white">
            <p className="text-xs uppercase tracking-[0.4em] text-white/50">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold">
              {typeof item.value === 'number' ? formatNumber(item.value) : item.value}
            </p>
            <p className="text-sm text-white/60">{item.meta}</p>
          </div>
        ))}
      </div>
    </div>
  </motion.section>
);
