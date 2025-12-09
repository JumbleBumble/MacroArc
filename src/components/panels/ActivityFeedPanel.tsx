import { AnimatePresence, motion } from 'framer-motion'
import { ActivityEntry } from '../../utils/macroTypes'
import { formatTimestamp } from '../../utils/format'
import { PanelSurface } from '../shared/PanelSurface'
import { SectionHeader } from '../shared/SectionHeader'

interface ActivityFeedPanelProps {
	entries: ActivityEntry[]
}

const toneToColor: Record<ActivityEntry['tone'], string> = {
	info: 'bg-brand-secondary/20 text-brand-secondary',
	success: 'bg-emerald-400/15 text-emerald-300',
	warning: 'bg-amber-400/20 text-amber-300',
}

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.08, delayChildren: 0.05 },
	},
}

const itemVariants = {
	hidden: { opacity: 0, y: 12 },
	visible: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -8 },
}

export const ActivityFeedPanel: React.FC<ActivityFeedPanelProps> = ({
	entries,
}) => {
	const visibleEntries = entries.slice(0, 8)

	return (
		<PanelSurface delay={0.08} className="space-y-5">
			<SectionHeader eyebrow="Telemetry" title="Activity feed" />
			<motion.div
				className="space-y-3"
				variants={containerVariants}
				initial="hidden"
				animate="visible"
			>
				<AnimatePresence initial={false}>
					{visibleEntries.map((entry) => (
						<motion.div
							layout
							key={entry.id}
							variants={itemVariants}
							exit="exit"
							className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
							whileHover={{
								borderColor: 'rgba(142, 103, 255, 0.4)',
								translateX: 4,
							}}
						>
							<div>
								<p className="text-base font-semibold text-white">
									{entry.label}
								</p>
								{entry.meta && (
									<p className="text-sm text-white/50">
										{entry.meta}
									</p>
								)}
							</div>
							<div className="flex flex-col items-end gap-1 text-right">
								<motion.span
									layout
									key={`${entry.id}-tone`}
									className={`rounded-full px-3 py-1 text-xs font-semibold ${
										toneToColor[entry.tone]
									}`}
									whileHover={{ scale: 1.05 }}
								>
									{entry.tone}
								</motion.span>
								<span className="text-xs text-white/40">
									{formatTimestamp(entry.timestamp)}
								</span>
							</div>
						</motion.div>
					))}
				</AnimatePresence>
				{!visibleEntries.length && (
					<motion.p
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/60"
					>
						Actions such as recording, playback, and queuing will
						appear here.
					</motion.p>
				)}
			</motion.div>
		</PanelSurface>
	)
}
