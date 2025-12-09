import { motion, useSpring } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { Zap } from 'lucide-react'
import { AutoClickerConfig, AutoClickerMetrics } from '../../utils/macroTypes'
import { HotkeyField } from '../shared/HotkeyField'
import { PanelSurface } from '../shared/PanelSurface'
import { SectionHeader } from '../shared/SectionHeader'
import { NumericInputField } from '../shared/NumericInputField'

interface AutoClickerPanelProps {
	config: AutoClickerConfig
	metrics: AutoClickerMetrics
	running: boolean
	configSummary: string
	updateConfig: (partial: Partial<AutoClickerConfig>) => void
	onStart: () => Promise<void>
	onStop: () => Promise<void>
}

const buttons: AutoClickerConfig['button'][] = ['left', 'right', 'middle']

export const AutoClickerPanel: React.FC<AutoClickerPanelProps> = ({
	config,
	metrics,
	running,
	updateConfig,
	onStart,
	onStop,
	configSummary,
}) => {
	const isInfiniteBurst = config.burst === null
	const [animatedClicks, setAnimatedClicks] = useState(metrics.totalClicks)
	const clicksSpring = useSpring(metrics.totalClicks, {
		stiffness: 140,
		damping: 22,
		mass: 0.8,
	})

	useEffect(() => {
		clicksSpring.set(metrics.totalClicks)
	}, [metrics.totalClicks, clicksSpring])

	useEffect(() => {
		const unsubscribe = clicksSpring.on('change', (value) =>
			setAnimatedClicks(Math.round(value))
		)
		return () => unsubscribe()
	}, [clicksSpring])

	const intervalBounds = useMemo(() => ({ min: 15, max: 400 }), [])
	const jitterBounds = useMemo(() => ({ min: 0, max: 120 }), [])

	const updateNumericField =
		(
			field: 'intervalMs' | 'jitterMs',
			bounds: { min: number; max: number }
		) =>
		(value: number | null) => {
			if (value === null) return
			const next = Math.min(bounds.max, Math.max(bounds.min, value))
			updateConfig({ [field]: next } as Partial<AutoClickerConfig>)
		}

	return (
		<PanelSurface className="flex h-full flex-col gap-6" delay={0.1}>
			<SectionHeader
				eyebrow="Auto clicker"
				title="Auto clicker"
				trailing={
					<Zap
						className={
							running
								? 'text-brand-accent animate-pulse'
								: 'text-white/50'
						}
						size={24}
					/>
				}
			/>

			<motion.div
				className="grid gap-3 text-sm text-white/70"
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
			>
				<div className="flex items-center justify-between">
					<span>Current profile</span>
					<motion.span layout className="font-semibold text-white">
						{configSummary}
					</motion.span>
				</div>
				<div className="flex items-center justify-between">
					<span>Total clicks</span>
					<motion.span layout className="font-semibold text-white">
						{animatedClicks.toLocaleString()}
					</motion.span>
				</div>
			</motion.div>

			<div>
				<p className="text-xs uppercase tracking-[0.4em] text-white/50">
					Button
				</p>
				<div className="mt-3 flex gap-2">
					{buttons.map((button) => (
						<motion.button
							key={button}
							whileTap={{ scale: 0.95 }}
							whileHover={{ y: -2 }}
							onClick={() => updateConfig({ button })}
							className={`rounded-2xl border px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] ${
								config.button === button
									? 'border-white bg-white/80 text-black'
									: 'border-white/10 bg-white/5 text-white/60'
							}`}
						>
							{button}
						</motion.button>
					))}
				</div>
			</div>

			<div className="space-y-6">
				<div>
					<label className="block text-xs uppercase tracking-[0.4em] text-white/50">
						Interval · {config.intervalMs} ms
					</label>
					<div className="mt-3 flex items-center gap-4">
						<input
							type="range"
							min={intervalBounds.min}
							max={intervalBounds.max}
							value={config.intervalMs}
							onChange={(event) =>
								updateConfig({
									intervalMs: Number(event.target.value),
								})
							}
							className="w-full accent-brand-primary"
						/>
						<NumericInputField
							value={config.intervalMs}
							onChange={updateNumericField(
								'intervalMs',
								intervalBounds
							)}
							suffix="ms"
							aria-label="Interval in milliseconds"
						/>
					</div>
				</div>

				<div>
					<label className="block text-xs uppercase tracking-[0.4em] text-white/50">
						Jitter · {config.jitterMs} ms
					</label>
					<div className="mt-3 flex items-center gap-4">
						<input
							type="range"
							min={jitterBounds.min}
							max={jitterBounds.max}
							value={config.jitterMs}
							onChange={(event) =>
								updateConfig({
									jitterMs: Number(event.target.value),
								})
							}
							className="w-full accent-brand-secondary"
						/>
						<NumericInputField
							value={config.jitterMs}
							onChange={updateNumericField(
								'jitterMs',
								jitterBounds
							)}
							suffix="ms"
							aria-label="Jitter in milliseconds"
						/>
					</div>
				</div>

				<div>
					<div className="flex items-center justify-between text-xs uppercase tracking-[0.4em] text-white/50">
						<span>Burst limit</span>
						<motion.button
							type="button"
							whileTap={{ scale: 0.95 }}
							onClick={() =>
								updateConfig({
									burst: isInfiniteBurst
										? config.burst ?? 100
										: null,
								})
							}
							className={`relative flex items-center rounded-full border border-white/15 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] transition-colors ${
								isInfiniteBurst
									? 'bg-brand-secondary/80 text-white'
									: 'bg-white/10 text-white/60'
							}`}
						>
							{isInfiniteBurst ? 'Infinite' : 'Finite'}
						</motion.button>
					</div>
					<div className="mt-3 flex items-center gap-3">
						<div className="flex-1">
							<NumericInputField
								value={config.burst ?? null}
								onChange={(value) =>
									updateConfig({ burst: value })
								}
								placeholder="∞"
								disabled={isInfiniteBurst}
								suffix="clicks"
								aria-label="Burst limit"
							/>
						</div>
						<span className="text-xs uppercase tracking-[0.3em] text-white/50">
							{isInfiniteBurst ? 'Unlimited' : 'Clicks'}
						</span>
					</div>
				</div>
			</div>

			<HotkeyField
				label="Autoclicker hotkey"
				value={config.hotkey ?? null}
				onChange={(value) => updateConfig({ hotkey: value ?? null })}
				helper="Press any key combo to toggle the auto clicker globally."
				placeholder="CommandOrControl+Shift+A"
			/>

			<motion.button
				whileTap={{ scale: 0.97 }}
				whileHover={{ scale: 1.01 }}
				onClick={running ? onStop : onStart}
				className={`mt-auto flex items-center justify-center gap-3 rounded-2xl px-6 py-4 text-lg font-semibold text-white ${
					running
						? 'bg-red-500/80 shadow-[0_10px_30px_rgba(239,68,68,0.45)]'
						: 'bg-brand-primary/70 shadow-[0_15px_35px_rgba(91,124,250,0.25)]'
				}`}
			>
				{running ? 'Stop auto clicker' : 'Start auto clicker'}
			</motion.button>
		</PanelSurface>
	)
}
