import { motion } from 'framer-motion'
import { MacroStats, AutoClickerMetrics } from '../../utils/macroTypes'
import { formatMilliseconds, formatNumber } from '../../utils/format'
import { PanelSurface } from '../shared/PanelSurface'
import { SectionHeader } from '../shared/SectionHeader'

interface InsightGridProps {
	macroStats: MacroStats
	autoMetrics: AutoClickerMetrics
}

export const InsightGrid: React.FC<InsightGridProps> = ({
	macroStats,
	autoMetrics,
}) => {
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
	]

	return (
		<PanelSurface delay={0.12}>
			<SectionHeader
				eyebrow="Insights"
				title="Live telemetry"
				subtitle="Macro and autoclicker health"
			/>
			<motion.div
				className="mt-4 grid gap-4 md:grid-cols-3"
				initial="hidden"
				animate="visible"
				variants={{
					hidden: {},
					visible: {
						transition: {
							staggerChildren: 0.07,
							delayChildren: 0.1,
						},
					},
				}}
			>
				{cards.map((card) => {
					const valueText = String(card.value ?? '')

					return (
						<motion.div
							key={card.label}
							variants={{
								hidden: { opacity: 0, y: 12 },
								visible: { opacity: 1, y: 0 },
							}}
							whileHover={{
								translateY: -4,
								borderColor: 'rgba(142,103,255,0.45)',
							}}
							className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white"
						>
							<p className="text-xs uppercase tracking-[0.3em] text-white/50">
								{card.label}
							</p>
							<p
								className="mt-2 text-3xl font-semibold leading-tight wrap-break-word"
								title={valueText}
							>
								{valueText}
							</p>
							<p className="text-sm text-white/60">
								{card.meta}
							</p>
						</motion.div>
					)
				})}
			</motion.div>
		</PanelSurface>
	)
}
