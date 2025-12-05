import { motion } from 'framer-motion';
import { ActivityEntry } from '../../utils/macroTypes';
import { formatTimestamp } from '../../utils/format';

interface ActivityFeedPanelProps {
  entries: ActivityEntry[];
}

const toneToColor: Record<ActivityEntry['tone'], string> = {
  info: 'bg-brand-secondary/20 text-brand-secondary',
  success: 'bg-emerald-400/15 text-emerald-300',
  warning: 'bg-amber-400/20 text-amber-300',
};

export const ActivityFeedPanel: React.FC<ActivityFeedPanelProps> = ({ entries }) => (
  <section className="glass-panel rounded-3xl p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-white/50">Telemetry</p>
        <h2 className="text-2xl font-semibold text-white">Activity feed</h2>
      </div>
    </div>
    <div className="mt-5 space-y-3">
      {entries.slice(0, 8).map((entry) => (
        <motion.div
          key={entry.id}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
        >
          <div>
            <p className="text-base font-semibold text-white">{entry.label}</p>
            {entry.meta && <p className="text-sm text-white/50">{entry.meta}</p>}
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneToColor[entry.tone]}`}>
              {entry.tone}
            </span>
            <span className="text-xs text-white/40">{formatTimestamp(entry.timestamp)}</span>
          </div>
        </motion.div>
      ))}
      {!entries.length && (
        <p className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/60">
          Actions such as recording, playback, and queuing will appear here.
        </p>
      )}
    </div>
  </section>
);
