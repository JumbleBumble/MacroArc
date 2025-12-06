import { motion } from 'framer-motion';
import { Activity, Circle, PauseCircle, PlayCircle } from 'lucide-react';
import { MacroEvent } from '../../utils/macroTypes';
import { formatMilliseconds } from '../../utils/format';
import { HotkeyField } from '../shared/HotkeyField'

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
		<section className="glass-panel flex h-full flex-col rounded-3xl p-6">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-xs uppercase tracking-[0.4em] text-white/50">
						Recorder
					</p>
					<h2 className="text-2xl font-semibold text-white">
						Macro capture
					</h2>
				</div>
				<Activity
					size={22}
					className={
						recording
							? 'text-brand-accent animate-pulse'
							: 'text-white/50'
					}
				/>
			</div>

			<div className="mt-6 flex flex-col gap-3">
				<label className="text-xs uppercase tracking-[0.4em] text-white/50">
					Session label
				</label>
				<input
					value={captureName}
					onChange={(event) => setCaptureName(event.target.value)}
					placeholder="Name this capture"
					className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40"
				/>
			</div>

			<div className="mt-6 flex flex-col rounded-2xl border border-white/10 bg-white/5 p-4">
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
			</div>

			<div className="mt-6">
				<HotkeyField
					label="Recorder hotkey"
					value={recorderHotkey}
					onChange={onUpdateRecorderHotkey}
					helper="Toggle recording anywhere. Leave empty to disable the shortcut."
					placeholder="CommandOrControl+Shift+M"
				/>
			</div>

			{hasPendingCapture && (
				<div className="mt-6 rounded-2xl border border-brand-primary/40 bg-brand-primary/10 p-4">
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
							<button
								onClick={() => onSaveCapture(captureName)}
								className="rounded-2xl bg-brand-primary/80 px-4 py-2 text-sm font-semibold text-white"
							>
								Save to library
							</button>
							<button
								onClick={onPlayPending}
								className="rounded-2xl border border-white/20 px-4 py-2 text-sm text-white/80"
							>
								Play once
							</button>
							<button
								onClick={onDiscardCapture}
								className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white/60"
							>
								Discard
							</button>
						</div>
					</div>
				</div>
			)}

			<motion.button
				whileTap={{ scale: 0.97 }}
				onClick={handleToggle}
				className={`mt-6 flex items-center justify-center gap-3 rounded-2xl px-6 py-4 text-lg font-semibold text-white ${
					recording
						? 'bg-red-500/80 shadow-[0_0_25px_rgba(244,63,94,0.45)]'
						: 'bg-brand-primary/70'
				}`}
			>
				{recording ? (
					<PauseCircle size={22} />
				) : (
					<PlayCircle size={22} />
				)}
				{recording ? 'Stop recording' : 'Start recording'}
			</motion.button>

			<div className="mt-6 flex flex-col gap-3">
				<div className="flex items-center justify-between text-xs uppercase tracking-[0.4em] text-white/50">
					<span>Live event stream</span>
					<span>{recentEvents.length} events</span>
				</div>
				<div className="flex flex-col gap-2">
					{recentEvents.slice(0, 6).map((event) => (
						<div
							key={event.id}
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
								{formatMilliseconds(event.offsetMs)}
							</span>
						</div>
					))}
					{!recentEvents.length && (
						<p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/50">
							Events will populate as soon as recording starts.
						</p>
					)}
				</div>
			</div>
		</section>
	)
}
