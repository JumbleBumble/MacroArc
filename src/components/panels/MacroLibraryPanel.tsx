import { useEffect, useState } from 'react';
import type {
	KeyboardEvent as ReactKeyboardEvent,
	MouseEvent as ReactMouseEvent,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Edit3, Play, PlusCircle, Trash2 } from 'lucide-react'
import {
	MacroEvent,
	MacroSequence,
	DEFAULT_MACRO_SPEED,
	MIN_MACRO_SPEED,
	MAX_MACRO_SPEED,
} from '../../utils/macroTypes'
import { formatTimestamp } from '../../utils/format'
import { HotkeyField } from '../shared/HotkeyField'
import { PanelSurface } from '../shared/PanelSurface'
import { SectionHeader } from '../shared/SectionHeader'
import { NumericInputField } from '../shared/NumericInputField'
import { MacroEditModal } from './MacroEditModal'

interface MacroLibraryPanelProps {
	macros: MacroSequence[]
	selectedMacroId: string | null
	setSelectedMacroId: (id: string | null) => void
	onPlay: (id: string) => Promise<void>
	onQueue: (id: string) => void
	onDelete: (id: string) => void
	isPlaying: boolean
	onUpdateHotkey: (id: string, hotkey: string | null) => void
	queuedMacros: MacroSequence[]
	onPlayQueue: () => Promise<void>
	onClearQueue: () => void
	onUpdateLoopSettings: (
		id: string,
		settings: { enabled?: boolean; delayMs?: number }
	) => void
	onUpdateSpeed: (id: string, speed: number) => void
	onUpdateMacroEvents: (
		id: string,
		events: MacroEvent[]
	) => Promise<void> | void
	queueLoopEnabled: boolean
	queueLoopDelayMs: number
	onUpdateQueueLoop: (settings: {
		enabled?: boolean
		delayMs?: number
	}) => void
	queueHotkey: string | null
	onUpdateQueueHotkey: (value: string | null) => void
	queueRunning: boolean
}

const interactiveElementsSelector =
	'button, input, select, textarea, a, [role="button"], [data-prevent-card-select]'

const shouldIgnoreCardSelect = (
	target: EventTarget | null,
	cardElement: HTMLElement | null
) => {
	if (!(target instanceof HTMLElement)) {
		return false
	}
	const interactiveAncestor = target.closest(interactiveElementsSelector)
	if (!interactiveAncestor) {
		return false
	}
	return cardElement ? interactiveAncestor !== cardElement : true
}

export const MacroLibraryPanel = ({
	macros,
	selectedMacroId,
	setSelectedMacroId,
	onPlay,
	onQueue,
	onDelete,
	isPlaying,
	onUpdateHotkey,
	queuedMacros,
	onPlayQueue,
	onClearQueue,
	onUpdateLoopSettings,
	onUpdateSpeed,
	onUpdateMacroEvents,
	queueLoopEnabled,
	queueLoopDelayMs,
	onUpdateQueueLoop,
	queueHotkey,
	onUpdateQueueHotkey,
	queueRunning,
}: MacroLibraryPanelProps) => {
	const [editingMacro, setEditingMacro] = useState<MacroSequence | null>(
		null
	)

	const handleCardClick = (
		event: ReactMouseEvent<HTMLDivElement>,
		macroId: string
	) => {
		if (shouldIgnoreCardSelect(event.target, event.currentTarget)) {
			return
		}
		setSelectedMacroId(macroId)
	}

	const handleCardKeyDown = (
		event: ReactKeyboardEvent<HTMLDivElement>,
		macroId: string
	) => {
		if (event.key !== 'Enter' && event.key !== ' ') {
			return
		}
		event.preventDefault()
		if (shouldIgnoreCardSelect(event.target, event.currentTarget)) {
			return
		}
		setSelectedMacroId(macroId)
	}

	useEffect(() => {
		if (!editingMacro) return
		const next =
			macros.find((macro) => macro.id === editingMacro.id) ?? null
		if (next === editingMacro) {
			return
		}
		setEditingMacro(next)
	}, [editingMacro, macros])

	const handleSaveEdits = async (events: MacroEvent[]) => {
		if (!editingMacro) return
		await onUpdateMacroEvents(editingMacro.id, events)
		setEditingMacro(null)
	}

	const describeSpeed = (value: number) => {
		const rounded = Number(value.toFixed(2))
		return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded}x`
	}

	const macroCardVariants = {
		hidden: { opacity: 0, y: 20 },
		visible: { opacity: 1, y: 0 },
		exit: { opacity: 0, y: -10 },
	}

	const queueItemVariants = {
		hidden: { opacity: 0, y: 12 },
		visible: { opacity: 1, y: 0 },
		exit: { opacity: 0, y: -12 },
	}

	return (
		<>
			<PanelSurface className="space-y-6" delay={0.15}>
				<SectionHeader
					eyebrow="Macro library"
					title="Saved macros"
					trailing={
						<motion.button
							whileTap={{ scale: 0.95 }}
							onClick={() => setSelectedMacroId(null)}
							className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70"
						>
							Clear selection
						</motion.button>
					}
				/>

				<motion.div layout className="space-y-4">
					<AnimatePresence initial={false}>
						{macros.map((macro) => {
							const isActive = macro.id === selectedMacroId
							const speedValue =
								macro.playbackSpeed ?? DEFAULT_MACRO_SPEED
							return (
								<motion.div
									layout
									key={macro.id}
									variants={macroCardVariants}
									initial="hidden"
									animate="visible"
									exit="exit"
									whileHover={{
										translateY: -4,
										borderColor: 'rgba(91,124,250,0.45)',
									}}
									className={`rounded-2xl border px-4 py-4 transition-colors focus-visible:outline-2 focus-visible:outline-brand-primary/60 focus-visible:outline-offset-2 cursor-pointer ${
										isActive
											? 'border-brand-primary/60 bg-brand-primary/10'
											: 'border-white/10 bg-white/5'
									}`}
									role="button"
									tabIndex={0}
									aria-pressed={isActive}
									onClick={(event) =>
										handleCardClick(event, macro.id)
									}
									onKeyDown={(event) =>
										handleCardKeyDown(event, macro.id)
									}
								>
									<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
										<div>
											<button
												onClick={() =>
													setSelectedMacroId(
														macro.id
													)
												}
												className="text-left text-lg font-semibold text-white"
											>
												{macro.name}
											</button>
											<p className="text-sm text-white/60">
												Last run ·{' '}
												{formatTimestamp(
													macro.lastRun
												)}
											</p>
										</div>
										<div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/50">
											{macro.tags.map((tag) => (
												<span
													key={tag}
													className="rounded-full bg-white/10 px-3 py-1"
												>
													{tag}
												</span>
											))}
										</div>
									</div>
									<div className="mt-4 flex flex-wrap gap-2">
										<motion.button
											whileTap={{ scale: 0.97 }}
											whileHover={{ scale: 1.03 }}
											onClick={() => onPlay(macro.id)}
											className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-black"
										>
											<Play size={16} />
											Play macro
										</motion.button>
										<motion.button
											whileTap={{ scale: 0.97 }}
											whileHover={{ scale: 1.03 }}
											onClick={() => onQueue(macro.id)}
											className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/70"
										>
											<PlusCircle size={16} />
											Queue macro
										</motion.button>
										<motion.button
											whileTap={{ scale: 0.97 }}
											whileHover={{ scale: 1.03 }}
											onClick={() =>
												setEditingMacro(macro)
											}
											className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition-colors hover:border-brand-primary/60 hover:text-white"
										>
											<Edit3 size={16} />
											Edit macro
										</motion.button>
										<motion.button
											whileTap={{ scale: 0.97 }}
											whileHover={{ scale: 1.03 }}
											onClick={() => onDelete(macro.id)}
											className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/60"
										>
											<Trash2 size={16} />
											Delete
										</motion.button>
									</div>
									<div className="mt-4">
										<HotkeyField
											label="Macro hotkey"
											value={macro.hotkey ?? null}
											onChange={(value) =>
												onUpdateHotkey(macro.id, value)
											}
											helper="Assign a global shortcut to instantly trigger this macro."
											placeholder="CommandOrControl+Alt+M"
										/>
									</div>
									<div className="loop-surface mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
										<div className="flex flex-wrap items-center justify-between gap-3">
											<div>
												<p className="text-sm font-semibold text-white">
													Playback speed
												</p>
												<p className="text-xs uppercase tracking-[0.3em] text-white/60">
													{describeSpeed(speedValue)}
												</p>
											</div>
											<span className="text-xs text-white/50">
												Scale entire macro timing
											</span>
										</div>
										<div className="mt-3">
											<input
												type="range"
												min={MIN_MACRO_SPEED}
												max={MAX_MACRO_SPEED}
												step={0.05}
												value={speedValue}
												onChange={(event) =>
													onUpdateSpeed(
														macro.id,
														Number(
															event.target.value
														)
													)
												}
												className="w-full accent-brand-primary"
											/>
										</div>
										<div className="mt-1 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.3em] text-white/40">
											<span>
												{describeSpeed(
													MIN_MACRO_SPEED
												)}
											</span>
											<span>
												{describeSpeed(
													MAX_MACRO_SPEED
												)}
											</span>
										</div>
									</div>
									<div className="loop-surface mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
										<div className="flex flex-wrap items-center justify-between gap-3">
											<p className="text-sm font-semibold text-white">
												Loop playback
											</p>
											<label className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/60">
												<input
													type="checkbox"
													className="h-4 w-4 rounded border-white/30 bg-transparent text-brand-primary"
													checked={
														macro.loopEnabled ??
														false
													}
													onChange={(event) =>
														onUpdateLoopSettings(
															macro.id,
															{
																enabled:
																	event
																		.target
																		.checked,
															}
														)
													}
												/>
												Loop
											</label>
										</div>
										{macro.loopEnabled && (
											<div className="mt-3">
												<NumericInputField
													id={`macro-loop-delay-${macro.id}`}
													label="Delay (ms)"
													value={
														macro.loopDelayMs ??
														1000
													}
													onChange={(value) =>
														onUpdateLoopSettings(
															macro.id,
															{
																delayMs:
																	value ?? 0,
															}
														)
													}
													helper="Pause between runs"
													min={0}
												/>
											</div>
										)}
									</div>
								</motion.div>
							)
						})}
					</AnimatePresence>
					{!macros.length && (
						<p className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/60">
							Once you record macros they will live here for
							replay.
						</p>
					)}
				</motion.div>

				{isPlaying && (
					<p className="text-xs uppercase tracking-[0.4em] text-brand-secondary">
						Playing…
					</p>
				)}

				<motion.div
					className="rounded-2xl border border-white/10 bg-white/5 p-4"
					layout
				>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p className="text-xs uppercase tracking-[0.4em] text-white/50">
								Queued macros
							</p>
							<p className="text-sm text-white/70">
								{queuedMacros.length} ready
							</p>
							<p className="text-xs text-white/50">
								Shortcut · {queueHotkey ?? 'Not assigned'}
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<motion.button
								whileTap={{ scale: 0.97 }}
								onClick={() => void onPlayQueue()}
								disabled={!queuedMacros.length || queueRunning}
								className={`rounded-full px-4 py-2 text-sm font-semibold ${
									queuedMacros.length
										? queueRunning
											? 'bg-white/10 text-white/40 cursor-not-allowed'
											: 'bg-brand-primary/80 text-white'
										: 'bg-white/10 text-white/40 cursor-not-allowed'
								}`}
							>
								{queueRunning
									? 'Queue running…'
									: 'Play queued macros'}
							</motion.button>
							<motion.button
								whileTap={{ scale: 0.97 }}
								onClick={onClearQueue}
								disabled={!queuedMacros.length}
								className={`rounded-full border px-4 py-2 text-sm ${
									queuedMacros.length
										? 'border-white/20 text-white/70'
										: 'border-white/10 text-white/40 cursor-not-allowed'
								}`}
							>
								Clear queue
							</motion.button>
						</div>
					</div>
					{queueRunning && (
						<p className="mt-2 text-xs text-brand-secondary">
							Queue active — press{' '}
							{queueHotkey ?? 'queue hotkey'} to stop instantly.
						</p>
					)}
					<div className="loop-surface mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<p className="text-sm font-semibold text-white">
								Loop queue
							</p>
							<label className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/60">
								<input
									type="checkbox"
									className="h-4 w-4 rounded border-white/30 bg-transparent text-brand-primary"
									checked={queueLoopEnabled}
									onChange={(event) =>
										onUpdateQueueLoop({
											enabled: event.target.checked,
										})
									}
								/>
								Loop
							</label>
						</div>
						{queueLoopEnabled && (
							<div className="mt-3">
								<NumericInputField
									id="queue-loop-delay"
									label="Delay (ms)"
									value={queueLoopDelayMs}
									onChange={(value) =>
										onUpdateQueueLoop({
											delayMs: value ?? 0,
										})
									}
									helper="Pause before repeating queue"
									min={0}
								/>
							</div>
						)}
						<div className="mt-4">
							<HotkeyField
								label="Queue hotkey"
								value={queueHotkey}
								onChange={onUpdateQueueHotkey}
								helper="Use shortcut to start/stop queue instantly. Leave empty to disable."
								placeholder="CommandOrControl+Shift+Q"
							/>
						</div>
					</div>
					<div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
						<AnimatePresence initial={false}>
							{queuedMacros.length ? (
								queuedMacros.map((macro) => (
									<motion.div
										layout
										key={`queue-${macro.id}`}
										variants={queueItemVariants}
										initial="hidden"
										animate="visible"
										exit="exit"
										className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2"
									>
										<span className="text-sm font-semibold text-white">
											{macro.name}
										</span>
										<span className="text-xs uppercase tracking-[0.3em] text-white/50">
											{macro.tags.join(' · ')}
										</span>
									</motion.div>
								))
							) : (
								<motion.p
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/50"
								>
									Queue macros to build automated playlists.
								</motion.p>
							)}
						</AnimatePresence>
					</div>
				</motion.div>
			</PanelSurface>
			<MacroEditModal
				macro={editingMacro}
				onClose={() => setEditingMacro(null)}
				onSave={handleSaveEdits}
			/>
		</>
	)
}
