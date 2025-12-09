import { motion } from 'framer-motion';
import { formatMilliseconds, formatNumber } from '../../utils/format';
import { MacroStats } from '../../utils/macroTypes';
import { PanelSurface } from '../shared/PanelSurface'

interface HeroBannerProps {
	stats: MacroStats
	autoclickerSummary: string
	autoclickerRunning: boolean
}

const statItems = (
	stats: MacroStats,
	autoclickerSummary: string,
	autoclickerRunning: boolean
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
]

const statVariants = {
	hidden: { opacity: 0, y: 18 },
	visible: { opacity: 1, y: 0 },
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
	stats,
	autoclickerRunning,
	autoclickerSummary,
}) => (
	<PanelSurface className="relative overflow-hidden p-8" delay={0.02}>
		<motion.div
			className="absolute inset-0 opacity-70"
			initial={{ scale: 1, rotate: 0 }}
			animate={{ scale: 1.08, rotate: 2 }}
			transition={{
				duration: 22,
				repeat: Infinity,
				repeatType: 'mirror',
				ease: 'easeInOut',
			}}
		>
			<div className="h-full w-full bg-linear-to-br from-brand-primary/20 via-transparent to-brand-secondary/15" />
		</motion.div>
		<div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
			<motion.div
				initial={{ opacity: 0, y: 16 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.05, duration: 0.5 }}
			>
				<p className="text-xs uppercase tracking-[0.6em] text-white/50">
					MacroArc
				</p>
				<motion.h1
					className="mt-3 text-3xl font-semibold text-white sm:text-4xl"
					initial={{ letterSpacing: '-0.04em' }}
					animate={{ letterSpacing: '0em' }}
					transition={{ duration: 0.8, ease: 'easeOut' }}
				>
					Precision control for every repetitive macro.
				</motion.h1>
				<p className="mt-3 max-w-2xl text-base text-white/70">
					Record, remix, and deploy complex input patterns across
					apps in seconds.
				</p>
			</motion.div>
			<motion.div
				className="grid w-full gap-4 sm:grid-cols-3"
				initial="hidden"
				animate="visible"
				variants={{
					hidden: {},
					visible: {
						transition: {
							staggerChildren: 0.08,
							delayChildren: 0.15,
						},
					},
				}}
			>
				{statItems(stats, autoclickerSummary, autoclickerRunning).map(
					(item) => (
						<motion.div
							key={item.label}
							variants={statVariants}
							whileHover={{ y: -6, scale: 1.02 }}
							whileTap={{ scale: 0.99 }}
							className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white shadow-[0_15px_35px_rgba(0,0,0,0.35)]"
						>
							<p className="text-xs uppercase tracking-[0.4em] text-white/50">
								{item.label}
							</p>
							<p className="mt-2 text-2xl font-semibold">
								{typeof item.value === 'number'
									? formatNumber(item.value)
									: item.value}
							</p>
							<p className="text-sm text-white/60">
								{item.meta}
							</p>
						</motion.div>
					)
				)}
			</motion.div>
		</div>
	</PanelSurface>
)
