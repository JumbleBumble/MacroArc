import { useMemo } from 'react'
import { AppShell } from './components/layout/AppShell'
import { ThemeToggle } from './components/layout/ThemeToggle'
import { AboutButton } from './components/layout/AboutButton'
import { HeroBanner } from './components/panels/HeroBanner'
import { MacroRecorderPanel } from './components/panels/MacroRecorderPanel'
import { AutoClickerPanel } from './components/panels/AutoClickerPanel'
import { MacroLibraryPanel } from './components/panels/MacroLibraryPanel'
import { ActivityFeedPanel } from './components/panels/ActivityFeedPanel'
import { InsightGrid } from './components/panels/InsightGrid'
import { OverlayToggle } from './components/layout/OverlayToggle'
import { OverlayCanvas } from './components/overlay/OverlayCanvas'
import { OverlayPanelWindow } from './components/overlay/OverlayPanelWindow'
import { ThemeProvider } from './hooks/useTheme'
import { useMacroEngine } from './hooks/useMacroEngine'
import { useAutoClicker } from './hooks/useAutoClicker'
import {
	DEFAULT_OVERLAY_BUBBLES,
	useOverlayMode,
	type OverlayBubbleId,
} from './hooks/useOverlayMode'

const buildPanelContent = (
	macro: ReturnType<typeof useMacroEngine>,
	auto: ReturnType<typeof useAutoClicker>
) => ({
	hero: (
		<HeroBanner
			stats={macro.stats}
			autoclickerRunning={auto.running}
			autoclickerSummary={auto.configSummary}
		/>
	),
	recorder: (
		<MacroRecorderPanel
			recording={macro.recording}
			recentEvents={macro.recentEvents}
			captureName={macro.captureName}
			statusText={macro.statusText}
			setCaptureName={macro.setCaptureName}
			onStart={macro.startRecording}
			onStop={macro.stopRecording}
			hasPendingCapture={macro.hasPendingCapture}
			pendingCaptureMetrics={macro.pendingCaptureMetrics}
			onSaveCapture={macro.savePendingCapture}
			onPlayPending={macro.playPendingCapture}
			onDiscardCapture={macro.discardPendingCapture}
			recorderHotkey={macro.recorderHotkey}
			onUpdateRecorderHotkey={macro.updateRecorderHotkey}
		/>
	),
	autoclicker: (
		<AutoClickerPanel
			config={auto.config}
			metrics={auto.metrics}
			running={auto.running}
			updateConfig={auto.updateConfig}
			onStart={auto.start}
			onStop={auto.stop}
			configSummary={auto.configSummary}
		/>
	),
	library: (
		<MacroLibraryPanel
			macros={macro.macros}
			selectedMacroId={macro.selectedMacroId}
			setSelectedMacroId={macro.setSelectedMacroId}
			onPlay={macro.playMacro}
			onQueue={macro.queueMacro}
			onDelete={macro.deleteMacro}
			isPlaying={macro.isPlaying}
			queuedMacros={macro.queuedMacros}
			onPlayQueue={macro.playQueuedMacros}
			onClearQueue={macro.clearQueue}
			onUpdateHotkey={macro.updateMacroHotkey}
			onUpdateLoopSettings={macro.updateMacroLoopSettings}
			onUpdateSpeed={macro.updateMacroPlaybackSpeed}
			onUpdateMacroEvents={macro.updateMacroEvents}
			queueLoopEnabled={macro.queueLoopEnabled}
			queueLoopDelayMs={macro.queueLoopDelayMs}
			onUpdateQueueLoop={macro.updateQueueLoopSettings}
			queueHotkey={macro.queueHotkey}
			onUpdateQueueHotkey={macro.updateQueueHotkey}
			queueRunning={macro.queueRunning}
		/>
	),
	activity: <ActivityFeedPanel entries={macro.activity} />,
	insights: (
		<InsightGrid macroStats={macro.stats} autoMetrics={auto.metrics} />
	),
	about: (
		<div className="flex h-full w-full items-center justify-center">
			<AboutButton />
		</div>
	),
})

const Dashboard = () => {
	const macro = useMacroEngine()
	const auto = useAutoClicker()
	const overlay = useOverlayMode()
	const panels = buildPanelContent(macro, auto)
	const heroPanel = panels.hero
	const recorderPanel = panels.recorder
	const autoPanel = panels.autoclicker
	const libraryPanel = panels.library
	const activityPanel = panels.activity
	const insightsPanel = panels.insights
	const aboutPanelContent = panels.about
	const overlayContent = panels
	const shouldDimGrid = overlay.enabled && !overlay.supportsNativeOverlay

	return (
		<AppShell>
			<div className="flex flex-col gap-8">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<h1 className="text-4xl font-semibold text-white">
							MacroArc
						</h1>
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<OverlayToggle
							active={overlay.enabled}
							onToggle={overlay.toggleOverlay}
						/>
						<ThemeToggle />
					</div>
				</div>

				<div
					className={`transition-all duration-500 ease-out ${
						shouldDimGrid
							? 'pointer-events-none opacity-0 -translate-y-4 scale-[0.98] blur-sm'
							: 'opacity-100 translate-y-0'
					}`}
				>
					{heroPanel}
					<div className="mt-8 grid gap-6 lg:grid-cols-3">
						<div className="order-1 lg:order-1 lg:col-span-2">
							{recorderPanel}
						</div>
						<div className="order-2 lg:order-2 lg:col-span-1">
							{autoPanel}
						</div>
						<div className="order-3 lg:order-3 lg:col-span-2">
							{libraryPanel}
						</div>
						<div className="order-5 lg:order-4 lg:col-span-1 lg:col-start-3">
							{activityPanel}
						</div>
						<div className="order-4 lg:order-5 lg:col-span-2 lg:col-start-1">
							{insightsPanel}
						</div>
						<div className="order-6 lg:order-5 lg:col-span-2 lg:col-start-1">
							{aboutPanelContent}
						</div>
					</div>
				</div>

				{overlay.enabled && overlay.supportsNativeOverlay && (
					<div className="overlay-native-callout glass-panel">
						<p className="text-sm text-white/80">
							Floating overlay bubbles are active. Drag, resize,
							or close them from their independent windows.
						</p>
					</div>
				)}

				{overlay.enabled && !overlay.supportsNativeOverlay && (
					<OverlayCanvas
						bubbles={overlay.bubbles}
						content={overlayContent}
						updateBubble={overlay.updateBubble}
						onExit={overlay.toggleOverlay}
						onResetLayout={overlay.resetLayout}
					/>
				)}
			</div>
		</AppShell>
	)
}

const resolveOverlayPanelId = (): OverlayBubbleId | null => {
	if (typeof window === 'undefined') {
		return null
	}
	const params = new URLSearchParams(window.location.search)
	const value = params.get('overlayPanel')
	if (!value) {
		return null
	}
	return DEFAULT_OVERLAY_BUBBLES.some((bubble) => bubble.id === value)
		? (value as OverlayBubbleId)
		: null
}

const OverlayPanelApp = ({ panelId }: { panelId: OverlayBubbleId }) => {
	const macro = useMacroEngine()
	const auto = useAutoClicker()
	const panels = buildPanelContent(macro, auto)
	const content = panels[panelId]

	if (!content) {
		return null
	}

	return (
		<div className="overlay-panel-window__stage">
			<OverlayPanelWindow id={panelId}>{content}</OverlayPanelWindow>
		</div>
	)
}

function App() {
	const overlayPanelId = useMemo(() => resolveOverlayPanelId(), [])

	return (
		<ThemeProvider>
			{overlayPanelId ? (
				<OverlayPanelApp panelId={overlayPanelId} />
			) : (
				<Dashboard />
			)}
		</ThemeProvider>
	)
}

export default App
