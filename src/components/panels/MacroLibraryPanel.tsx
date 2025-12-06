import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Edit3, Play, PlusCircle, Trash2 } from 'lucide-react';
import { MacroEvent, MacroSequence } from '../../utils/macroTypes';
import { formatTimestamp } from '../../utils/format';
import { HotkeyField } from '../shared/HotkeyField';
import { MacroEditModal } from './MacroEditModal';

interface MacroLibraryPanelProps {
  macros: MacroSequence[];
  selectedMacroId: string | null;
  setSelectedMacroId: (id: string | null) => void;
  onPlay: (id: string) => Promise<void>;
  onQueue: (id: string) => void;
  onDelete: (id: string) => void;
  isPlaying: boolean;
  onUpdateHotkey: (id: string, hotkey: string | null) => void;
  queuedMacros: MacroSequence[];
  onPlayQueue: () => Promise<void>;
  onClearQueue: () => void;
  onUpdateLoopSettings: (id: string, settings: { enabled?: boolean; delayMs?: number }) => void;
  onUpdateMacroEvents: (id: string, events: MacroEvent[]) => Promise<void> | void;
  queueLoopEnabled: boolean;
  queueLoopDelayMs: number;
  onUpdateQueueLoop: (settings: { enabled?: boolean; delayMs?: number }) => void;
  queueHotkey: string | null;
  onUpdateQueueHotkey: (value: string | null) => void;
  queueRunning: boolean;
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
	onUpdateMacroEvents,
	queueLoopEnabled,
	queueLoopDelayMs,
	onUpdateQueueLoop,
	queueHotkey,
	onUpdateQueueHotkey,
	queueRunning,
}: MacroLibraryPanelProps) => {
	const [editingMacro, setEditingMacro] = useState<MacroSequence | null>(null)

	useEffect(() => {
		if (!editingMacro) return
		const next = macros.find((macro) => macro.id === editingMacro.id) ?? null
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

	return (
		<>
			<section className="glass-panel rounded-3xl p-6">
		<div className="flex items-center justify-between">
			<div>
				<p className="text-xs uppercase tracking-[0.4em] text-white/50">
					Macro library
				</p>
				<h2 className="text-2xl font-semibold text-white">
					Saved macros
				</h2>
			</div>
			<button
				onClick={() => setSelectedMacroId(null)}
				className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70"
			>
				Clear selection
			</button>
		</div>

		<div className="mt-5 space-y-4">
			{macros.map((macro) => {
				const isActive = macro.id === selectedMacroId
				return (
					<motion.div
						layout
						key={macro.id}
						className={`rounded-2xl border px-4 py-4 ${
							isActive
								? 'border-brand-primary/60 bg-brand-primary/15'
								: 'border-white/10 bg-white/5'
						}`}
					>
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<button
									onClick={() =>
										setSelectedMacroId(macro.id)
									}
									className="text-left text-lg font-semibold text-white"
								>
									{macro.name}
								</button>
								<p className="text-sm text-white/60">
									Last run · {formatTimestamp(macro.lastRun)}
								</p>
							</div>
							<div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/50">
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
							<button
								onClick={() => onPlay(macro.id)}
								className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-black"
							>
								<Play size={16} />
								Play macro
							</button>
							<button
								onClick={() => onQueue(macro.id)}
								className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/70"
							>
								<PlusCircle size={16} />
								Queue macro
							</button>
							<button
								onClick={() => setEditingMacro(macro)}
								className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition-colors hover:border-brand-primary/60 hover:text-white"
							>
								<Edit3 size={16} />
								Edit macro
							</button>
							<button
								onClick={() => onDelete(macro.id)}
								className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/60"
							>
								<Trash2 size={16} />
								Delete
							</button>
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
								<p className="text-sm font-semibold text-white">
									Loop playback
								</p>
								<label className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/60">
									<input
										type="checkbox"
										className="h-4 w-4 rounded border-white/30 bg-transparent text-brand-primary"
										checked={macro.loopEnabled ?? false}
										onChange={(event) =>
											onUpdateLoopSettings(macro.id, {
												enabled: event.target.checked,
											})
										}
									/>
									Loop
								</label>
							</div>
							{macro.loopEnabled && (
								<div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white/70">
									<label
										htmlFor={`macro-loop-delay-${macro.id}`}
										className="text-xs uppercase tracking-[0.3em] text-white/50"
									>
										Delay (ms)
									</label>
									<input
										id={`macro-loop-delay-${macro.id}`}
										type="number"
										min={0}
										value={macro.loopDelayMs ?? 1000}
										onChange={(event) => {
											const value = Number(
												event.target.value
											)
											onUpdateLoopSettings(macro.id, {
												delayMs: Number.isNaN(value)
													? 0
													: value,
											})
										}}
										className="w-28 rounded-full border border-white/20 bg-black/50 px-3 py-1 text-sm text-white focus:border-brand-primary focus:outline-none"
									/>
									<span className="text-xs text-white/50">
										Pause between runs
									</span>
								</div>
							)}
						</div>
					</motion.div>
				)
			})}
			{!macros.length && (
				<p className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/60">
					Once you record macros they will live here for replay.
				</p>
			)}
		</div>

		{isPlaying && (
			<p className="mt-4 text-xs uppercase tracking-[0.4em] text-brand-secondary">
				Playing…
			</p>
		)}

		<div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
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
					<button
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
					</button>
					<button
						onClick={onClearQueue}
						disabled={!queuedMacros.length}
						className={`rounded-full border px-4 py-2 text-sm ${
							queuedMacros.length
								? 'border-white/20 text-white/70'
								: 'border-white/10 text-white/40 cursor-not-allowed'
						}`}
					>
						Clear queue
					</button>
				</div>
			</div>
			{queueRunning && (
				<p className="mt-2 text-xs text-brand-secondary">
					Queue active — press {queueHotkey ?? 'queue hotkey'} to
					stop instantly.
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
					<div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white/70">
						<label
							htmlFor="queue-loop-delay"
							className="text-xs uppercase tracking-[0.3em] text-white/50"
						>
							Delay (ms)
						</label>
						<input
							id="queue-loop-delay"
							type="number"
							min={0}
							value={queueLoopDelayMs}
							onChange={(event) => {
								const value = Number(event.target.value)
								onUpdateQueueLoop({
									delayMs: Number.isNaN(value) ? 0 : value,
								})
							}}
							className="w-28 rounded-full border border-white/20 bg-black/50 px-3 py-1 text-sm text-white focus:border-brand-primary focus:outline-none"
						/>
						<span className="text-xs text-white/50">
							Pause before repeating queue
						</span>
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
				{queuedMacros.length ? (
					queuedMacros.map((macro) => (
						<div
							key={`queue-${macro.id}`}
							className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2"
						>
							<span className="text-sm font-semibold text-white">
								{macro.name}
							</span>
							<span className="text-xs uppercase tracking-[0.3em] text-white/50">
								{macro.tags.join(' · ')}
							</span>
						</div>
					))
				) : (
					<p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/50">
						Nothing queued yet. Use “Queue macro” to stack multiple
						runs.
					</p>
				)}
			</div>
		</div>
			</section>
			<MacroEditModal
				macro={editingMacro}
				onClose={() => setEditingMacro(null)}
				onSave={handleSaveEdits}
			/>
		</>
	)
}
