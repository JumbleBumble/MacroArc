import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock, Keyboard, MousePointer2, ScrollText, Trash2, X } from 'lucide-react'
import type { MacroEvent, MacroSequence, MouseButton } from '../../utils/macroTypes'
import { describeHotkey, formatHotkeyFromEvent } from '../../utils/hotkeys'

interface MacroEditModalProps {
	macro: MacroSequence | null
	onClose: () => void
	onSave: (events: MacroEvent[]) => Promise<void> | void
}

const buttonOptions: { label: string; value: MouseButton }[] = [
	{ label: 'Left click', value: 'left' },
	{ label: 'Right click', value: 'right' },
	{ label: 'Middle click', value: 'middle' },
	{ label: 'Unknown', value: 'unknown' },
]

const cloneEvent = (event: MacroEvent): MacroEvent => ({
	...event,
	kind: { ...event.kind },
})

export const MacroEditModal = ({ macro, onClose, onSave }: MacroEditModalProps) => {
	const [draftEvents, setDraftEvents] = useState<MacroEvent[]>([])
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		if (macro) {
			setDraftEvents(macro.events.map(cloneEvent))
		} else {
			setDraftEvents([])
		}
		setSaving(false)
	}, [macro])

	useEffect(() => {
		if (!macro || typeof document === 'undefined') return
		const originalOverflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			document.body.style.overflow = originalOverflow
		}
	}, [macro])

	useEffect(() => {
		if (!macro) return
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault()
				onClose()
			}
		}
		document.addEventListener('keydown', handleKey)
		return () => document.removeEventListener('keydown', handleKey)
	}, [macro, onClose])

	const hasChanges = useMemo(() => {
		if (!macro) return false
		const original = JSON.stringify(macro.events)
		const updated = JSON.stringify(draftEvents)
		return original !== updated
	}, [draftEvents, macro])

	const updateEventAt = useCallback((index: number, next: MacroEvent) => {
		setDraftEvents((prev) =>
			prev.map((event, idx) => (idx === index ? { ...next } : event))
		)
	}, [])

	const removeEvent = useCallback((index: number) => {
		setDraftEvents((prev) => prev.filter((_, idx) => idx !== index))
	}, [])

	const updateOffset = useCallback((index: number, value: string) => {
		const parsed = Number(value)
		const current = draftEvents[index]
		if (!current) return
		updateEventAt(index, {
			...current,
			offsetMs: Number.isFinite(parsed) ? parsed : 0,
		})
	}, [draftEvents, updateEventAt])

	const updateMouseMove = useCallback(
		(index: number, axis: 'x' | 'y', value: string) => {
			const parsed = Number(value)
			const current = draftEvents[index]
			if (!current || current.kind.type !== 'mouse-move') return
			updateEventAt(index, {
				...current,
				kind: {
					...current.kind,
					[axis]: Number.isFinite(parsed) ? parsed : 0,
				},
			})
		},
		[draftEvents, updateEventAt]
	)

	const updateMouseButton = useCallback(
		(index: number, value: MouseButton) => {
			const current = draftEvents[index]
			if (!current) return
			if (current.kind.type !== 'mouse-down' && current.kind.type !== 'mouse-up') {
				return
			}
			updateEventAt(index, {
				...current,
				kind: {
					...current.kind,
					button: value,
				},
			})
		},
		[draftEvents, updateEventAt]
	)

	const updateKeyValue = useCallback(
		(index: number, value: string | null) => {
			const current = draftEvents[index]
			if (!current) return
			if (current.kind.type !== 'key-down' && current.kind.type !== 'key-up') {
				return
			}
			updateEventAt(index, {
				...current,
				kind: {
					...current.kind,
					key: value?.trim() ?? '',
				},
			})
		},
		[draftEvents, updateEventAt]
	)

	const updateScroll = useCallback(
		(index: number, axis: 'delta_x' | 'delta_y', value: string) => {
			const current = draftEvents[index]
			if (!current || current.kind.type !== 'scroll') return
			const parsed = Number(value)
			updateEventAt(index, {
				...current,
				kind: {
					...current.kind,
					[axis]: Number.isFinite(parsed) ? parsed : 0,
				},
			})
		},
		[draftEvents, updateEventAt]
	)

	const restoreDefault = useCallback(() => {
		if (!macro) return
		setDraftEvents(macro.events.map(cloneEvent))
	}, [macro])

	const handleSave = useCallback(async () => {
		if (!macro || !hasChanges) {
			return
		}
		setSaving(true)
		try {
			await onSave(draftEvents)
		} finally {
			setSaving(false)
		}
	}, [draftEvents, hasChanges, macro, onSave])

	if (typeof document === 'undefined') {
		return null
	}

	return createPortal(
		<AnimatePresence>
			{macro ? (
				<motion.div
					key={macro.id}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur"
					onClick={onClose}
				>
					<motion.div
						initial={{ y: 24, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: 24, opacity: 0 }}
						transition={{ type: 'spring', stiffness: 170, damping: 24 }}
						className="glass-panel relative max-h-[90vh] w-full max-w-4xl overflow-hidden border border-white/15 p-6 shadow-2xl"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="flex items-start justify-between gap-4">
							<div>
								<p className="text-xs uppercase tracking-[0.4em] text-white/50">
									Editing macro
								</p>
								<h3 className="text-2xl font-semibold text-white">
									{macro.name}
								</h3>
								<p className="text-sm text-white/60">
									Fine-tune timing, keystrokes, and cursor positions.
								</p>
							</div>
							<button
								type="button"
								onClick={onClose}
								className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70"
							>
								<X size={16} />
							</button>
						</div>

						<div className="mt-5 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-white/50">
							<span>{macro.events.length} events</span>
							<span className="text-white/30">•</span>
							<span>Loop {macro.loopEnabled ? 'enabled' : 'disabled'}</span>
						</div>

						<div className="mt-6 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
							{draftEvents.length ? (
								draftEvents.map((event, index) => (
									<motion.div
										layout
										key={event.id}
										className="loop-surface rounded-2xl border border-white/10 bg-black/30 p-4"
									>
										<div className="flex flex-wrap items-center justify-between gap-3">
											<div className="flex items-center gap-2 text-sm font-semibold text-white">
												{renderEventIcon(event)}
												<span>{formatEventLabel(event)}</span>
											</div>
											<div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/50">
												<span>Step {index + 1}</span>
												<button
													type="button"
													onClick={() => removeEvent(index)}
													className="flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60 transition-colors hover:border-brand-secondary/60 hover:text-white"
												>
													<Trash2 size={12} />
													Remove
												</button>
											</div>
										</div>
										<div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:gap-6">
											<label className="flex flex-col text-xs uppercase tracking-[0.3em] text-white/50 md:w-56">
												Timing (ms)
												<input
													type="number"
													className="input-surface mt-2 w-full rounded-2xl border px-4 py-2 text-sm text-white focus:border-brand-primary focus:outline-none"
													min={0}
													value={event.offsetMs}
													onChange={(e) => updateOffset(index, e.target.value)}
												/>
											</label>
											<div className="flex-1">
												{renderEventEditor({
													event,
													index,
													updateMouseMove,
													updateMouseButton,
													updateKeyValue,
													updateScroll,
												})}
											</div>
										</div>
									</motion.div>
								))
							) : (
								<p className="rounded-2xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-white/60">
									No events captured for this macro.
								</p>
							)}
						</div>

						<div className="mt-6 flex flex-wrap items-center justify-between gap-3">
							<div className="text-xs text-white/50">
								{hasChanges ? 'Unsaved edits ready' : 'All changes synced'}
							</div>
							<div className="flex flex-wrap gap-2">
								<button
									type="button"
									onClick={restoreDefault}
									className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 disabled:cursor-not-allowed disabled:opacity-40"
									disabled={!hasChanges}
								>
									Reset changes
								</button>
								<button
									type="button"
									onClick={onClose}
									className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/70"
								>
									Cancel
								</button>
								<button
									type="button"
									onClick={handleSave}
									className="rounded-full bg-brand-primary/80 px-6 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-white/20"
									disabled={!hasChanges || saving || !draftEvents.length}
								>
									{saving ? 'Saving…' : 'Save edits'}
								</button>
							</div>
						</div>
					</motion.div>
				</motion.div>
			) : null}
		</AnimatePresence>,
		document.body
	)
}

const renderEventIcon = (event: MacroEvent) => {
	switch (event.kind.type) {
		case 'mouse-move':
		case 'mouse-down':
		case 'mouse-up':
			return <MousePointer2 size={16} className="text-brand-primary" />
		case 'key-down':
		case 'key-up':
			return <Keyboard size={16} className="text-brand-secondary" />
		case 'scroll':
			return <ScrollText size={16} className="text-brand-secondary" />
		default:
			return <Clock size={16} className="text-white/60" />
	}
}

const formatEventLabel = (event: MacroEvent) => {
	switch (event.kind.type) {
		case 'mouse-move':
			return 'Cursor move'
		case 'mouse-down':
			return 'Mouse down'
		case 'mouse-up':
			return 'Mouse up'
		case 'key-down':
			return 'Key down'
		case 'key-up':
			return 'Key up'
		case 'scroll':
			return 'Scroll'
		default:
			return 'Event'
	}
}

interface EditorProps {
	event: MacroEvent
	index: number
	updateMouseMove: (index: number, axis: 'x' | 'y', value: string) => void
	updateMouseButton: (index: number, value: MouseButton) => void
	updateKeyValue: (index: number, value: string | null) => void
	updateScroll: (index: number, axis: 'delta_x' | 'delta_y', value: string) => void
}

const renderEventEditor = ({
	event,
	index,
	updateMouseMove,
	updateMouseButton,
	updateKeyValue,
	updateScroll,
}: EditorProps) => {
	switch (event.kind.type) {
		case 'mouse-move':
			return (
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="text-xs uppercase tracking-[0.3em] text-white/50">
						X position
						<input
							type="number"
							className="input-surface mt-2 w-full rounded-2xl border px-4 py-2 text-sm text-white focus:border-brand-primary focus:outline-none"
							value={event.kind.x}
							onChange={(e) => updateMouseMove(index, 'x', e.target.value)}
						/>
					</label>
					<label className="text-xs uppercase tracking-[0.3em] text-white/50">
						Y position
						<input
							type="number"
							className="input-surface mt-2 w-full rounded-2xl border px-4 py-2 text-sm text-white focus:border-brand-primary focus:outline-none"
							value={event.kind.y}
							onChange={(e) => updateMouseMove(index, 'y', e.target.value)}
						/>
					</label>
				</div>
			)
		case 'mouse-down':
		case 'mouse-up':
			return (
				<label className="flex flex-col text-xs uppercase tracking-[0.3em] text-white/50">
					Mouse button
					<select
						className="input-surface mt-2 w-full rounded-2xl border px-4 py-2 text-sm text-white focus:border-brand-primary focus:outline-none"
						value={event.kind.button}
						onChange={(e) => updateMouseButton(index, e.target.value as MouseButton)}
					>
						{buttonOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
			)
		case 'key-down':
		case 'key-up':
			return (
				<div className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-white/50">
					<span>Key combo</span>
					<InlineHotkeyCapture
						value={event.kind.key || null}
						onChange={(value) => updateKeyValue(index, value)}
						placeholder="Press shortcut"
					/>
				</div>
			)
		case 'scroll':
			return (
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="text-xs uppercase tracking-[0.3em] text-white/50">
						Horizontal delta
						<input
							type="number"
							className="input-surface mt-2 w-full rounded-2xl border px-4 py-2 text-sm text-white focus:border-brand-primary focus:outline-none"
							value={event.kind.delta_x}
							onChange={(e) => updateScroll(index, 'delta_x', e.target.value)}
						/>
					</label>
					<label className="text-xs uppercase tracking-[0.3em] text-white/50">
						Vertical delta
						<input
							type="number"
							className="input-surface mt-2 w-full rounded-2xl border px-4 py-2 text-sm text-white focus:border-brand-primary focus:outline-none"
							value={event.kind.delta_y}
							onChange={(e) => updateScroll(index, 'delta_y', e.target.value)}
						/>
					</label>
				</div>
			)
		default:
			return (
				<p className="text-sm text-white/60">
					This event type cannot be edited yet.
				</p>
			)
	}
}

interface InlineHotkeyCaptureProps {
	value: string | null
	onChange: (value: string | null) => void
	placeholder?: string
}

const InlineHotkeyCapture = ({ value, onChange, placeholder }: InlineHotkeyCaptureProps) => {
	const [listening, setListening] = useState(false)

	useEffect(() => {
		if (!listening) return
		const handler = (event: KeyboardEvent) => {
			event.preventDefault()
			event.stopPropagation()
			if (event.key === 'Escape') {
				setListening(false)
				return
			}
			const combo = formatHotkeyFromEvent(event)
			if (combo) {
				onChange(combo)
				setListening(false)
			}
		}
		window.addEventListener('keydown', handler, true)
		return () => window.removeEventListener('keydown', handler, true)
	}, [listening, onChange])

	const display = value ? describeHotkey(value) : placeholder ?? 'Press keys'

	return (
		<div className="flex flex-wrap items-center gap-2">
			<button
				type="button"
				onClick={() => setListening((prev) => !prev)}
				className={`input-surface flex flex-1 items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${listening ? 'border-brand-secondary/60 text-white' : 'text-white/80'}`}
			>
				<div className="flex items-center gap-2">
					<Keyboard size={16} />
					<span>{listening ? 'Press any keys…' : display}</span>
				</div>
				<span className="text-xs uppercase tracking-[0.4em] text-white/50">
					{listening ? 'Listening' : 'Set'}
				</span>
			</button>
			{value && (
				<button
					type="button"
					onClick={() => onChange(null)}
					className="flex items-center gap-1 rounded-2xl border border-white/15 px-3 py-2 text-xs uppercase tracking-[0.3em] text-white/60"
				>
					<X size={14} />
					Clear
				</button>
			)}
		</div>
	)
}
