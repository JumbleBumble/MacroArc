import { MacroStats, AutoClickerMetrics } from '../../utils/macroTypes';
import { formatMilliseconds, formatNumber } from '../../utils/format';

interface InsightGridProps {
  macroStats: MacroStats;
  autoMetrics: AutoClickerMetrics;
}

export const InsightGrid: React.FC<InsightGridProps> = ({ macroStats, autoMetrics }) => {
  const cards = [
    {
      label: 'Active macro',
      value: macroStats.activeProfile,
      meta: `${macroStats.totalEvents} steps cached`,
    },
    {
      label: 'Avg duration',
      value: formatMilliseconds(macroStats.averageDurationMs),
      meta: macroStats.lastRecordedName,
    },
    {
      label: 'Auto clicker clicks',
      value: formatNumber(autoMetrics.totalClicks),
      meta: `${autoMetrics.burstsCompleted} bursts`,
    },
  ];

  return (
    <section className="glass-panel rounded-3xl p-6">
      <p className="text-xs uppercase tracking-[0.4em] text-white/50">Insights</p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const valueText = String(card.value ?? '');

          return (
            <div key={card.label} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">{card.label}</p>
              <p className="mt-2 text-3xl font-semibold leading-tight wrap-break-word" title={valueText}>
                {valueText}
              </p>
              <p className="text-sm text-white/60">{card.meta}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
};
