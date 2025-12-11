import { AnimatePresence, motion } from 'framer-motion'
import { Activity, Circle, PauseCircle, PlayCircle } from 'lucide-react'
import { MacroEvent } from '../../utils/macroTypes'
import { formatMilliseconds } from '../../utils/format'
import { HotkeyField } from '../shared/HotkeyField'
import { PanelSurface } from '../shared/PanelSurface'
import { SectionHeader } from '../shared/SectionHeader'

interface MacroRecorderPanelProps {
	recording: boolean
	recentEvents: MacroEvent[]
	captureName: string
	statusText: string
	setCaptureName: (value: string) => void
	onStart: (label?: string) => Promise<void>
	onStop: (label?: string) => Promise<void>
	hasPendingCapture: boolean
	pendingCaptureMetrics: { count: number; duration: number }
	onSaveCapture: (label?: string) => Promise<void>
	onPlayPending: () => Promise<void>
	onDiscardCapture: () => void
	recorderHotkey: string | null
	onUpdateRecorderHotkey: (value: string | null) => void
}

const eventBadge = (event: MacroEvent) => {
	switch (event.kind.type) {
		case 'mouse-move':
			return 'Move'
		case 'mouse-down':
			return `Down ${event.kind.button}`
		case 'mouse-up':
			return `Up ${event.kind.button}`
		case 'key-down':
			return `Key ${event.kind.key}`
		case 'key-up':
			return `Key ${event.kind.key}`
		case 'scroll':
			return 'Scroll'
		default:
			return 'Event'
	}
}

export const MacroRecorderPanel: React.FC<MacroRecorderPanelProps> = ({
	recording,
	recentEvents,
	captureName,
	statusText,
	setCaptureName,
	onStart,
	onStop,
	hasPendingCapture,
	pendingCaptureMetrics,
	onSaveCapture,
	onPlayPending,
	onDiscardCapture,
	recorderHotkey,
	onUpdateRecorderHotkey,
}) => {
	const handleToggle = () =>
		recording ? onStop(captureName) : onStart(captureName)

	return (
		<PanelSurface className="flex h-full flex-col gap-6">
			<SectionHeader
				eyebrow="Recorder"
				title="Macro capture"
				trailing={
					<Activity
						size={22}
						className={
							recording
								? 'text-brand-accent animate-pulse'
								: 'text-white/50'
						}
					/>
				}
			/>

			<div className="flex flex-col gap-3">
				<label className="text-xs uppercase tracking-[0.4em] text-white/50">
					Session label
				</label>
				<motion.input
					value={captureName}
					onChange={(event) => setCaptureName(event.target.value)}
					placeholder="Name this capture"
					className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40"
					whileFocus={{
						borderColor: 'rgba(142,103,255,0.6)',
						boxShadow: '0 0 30px rgba(142,103,255,0.25)',
					}}
				/>
			</div>

			<motion.div
				className="flex flex-col rounded-2xl border border-white/10 bg-white/5 p-4"
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
			>
				<span className="text-sm uppercase tracking-[0.5em] text-white/50">
					Status
				</span>
				<p className="text-lg font-semibold text-white">
					{statusText}
				</p>
				<p className="text-sm text-white/60">
					{recording
						? 'Listening globally'
						: 'Ready to capture input'}
				</p>
			</motion.div>

			<HotkeyField
				label="Recorder hotkey"
				value={recorderHotkey}
				onChange={onUpdateRecorderHotkey}
				helper="Toggle recording anywhere. Leave empty to disable the shortcut."
				placeholder="CommandOrControl+Shift+M"
			/>

			<AnimatePresence initial={false}>
				{hasPendingCapture && (
					<motion.div
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						className="rounded-2xl border border-brand-primary/40 bg-brand-primary/10 p-4"
					>
						<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
							<div>
								<p className="text-xs uppercase tracking-[0.4em] text-brand-secondary">
									Capture ready
								</p>
								<p className="text-sm text-white/80">
									{pendingCaptureMetrics.count} events ·{' '}
									{formatMilliseconds(
										pendingCaptureMetrics.duration
									)}
								</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<motion.button
									whileTap={{ scale: 0.97 }}
									onClick={() => onSaveCapture(captureName)}
									className="rounded-2xl bg-brand-primary/80 px-4 py-2 text-sm font-semibold text-white"
								>
									Save to library
								</motion.button>
								<motion.button
									whileTap={{ scale: 0.97 }}
									onClick={onPlayPending}
									className="rounded-2xl border border-white/20 px-4 py-2 text-sm text-white/80"
								>
									Play once
								</motion.button>
								<motion.button
									whileTap={{ scale: 0.97 }}
									onClick={onDiscardCapture}
									className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white/60"
								>
									Discard
								</motion.button>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			<motion.button
				whileTap={{ scale: 0.97 }}
				whileHover={{ scale: recording ? 1.01 : 1.03 }}
				onClick={handleToggle}
				className={`flex items-center justify-center gap-3 rounded-2xl px-6 py-4 text-lg font-semibold text-white ${
					recording
						? 'bg-red-500/80 shadow-[0_0_25px_rgba(244,63,94,0.45)]'
						: 'bg-brand-primary/70 shadow-[0_15px_35px_rgba(91,124,250,0.15)]'
				}`}
			>
				{recording ? (
					<PauseCircle size={22} />
				) : (
					<PlayCircle size={22} />
				)}
				{recording ? 'Stop recording' : 'Start recording'}
			</motion.button>

			<div className="flex flex-col gap-3">
				<div className="flex items-center justify-between text-xs uppercase tracking-[0.4em] text-white/50">
					<span>Live event stream</span>
					<span>{recentEvents.length} events</span>
				</div>
				<div className="flex max-h-64 flex-col gap-2 overflow-hidden">
					{recording ? (
						<motion.p
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/50"
						>
							Live events will appear once you stop recording.
						</motion.p>
					) : (
						<>
							<AnimatePresence initial={false} mode="popLayout">
								{recentEvents.slice(0, 6).map((event) => (
									<motion.div
										layout="position"
										key={event.id}
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, y: -6 }}
										transition={{
											duration: 0.14,
											ease: 'easeOut',
										}}
										className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2"
									>
										<div className="flex items-center gap-3">
											<Circle
												size={10}
												className="text-brand-secondary"
											/>
											<span className="text-sm text-white/80">
												{eventBadge(event)}
											</span>
										</div>
										<span className="text-xs text-white/50">
											{formatMilliseconds(
												event.offsetMs
											)}
										</span>
									</motion.div>
								))}
							</AnimatePresence>
							{!recentEvents.length && (
								<motion.p
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/50"
								>
									Events will populate after your next
									recording.
								</motion.p>
							)}
						</>
					)}
				</div>
			</div>
		</PanelSurface>
	)
}
