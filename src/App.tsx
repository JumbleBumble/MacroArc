import { AppShell } from './components/layout/AppShell';
import { ThemeToggle } from './components/layout/ThemeToggle';
import { AboutButton } from './components/layout/AboutButton';
import { HeroBanner } from './components/panels/HeroBanner';
import { MacroRecorderPanel } from './components/panels/MacroRecorderPanel';
import { AutoClickerPanel } from './components/panels/AutoClickerPanel';
import { MacroLibraryPanel } from './components/panels/MacroLibraryPanel';
import { ActivityFeedPanel } from './components/panels/ActivityFeedPanel';
import { InsightGrid } from './components/panels/InsightGrid';
import { ThemeProvider } from './hooks/useTheme';
import { useMacroEngine } from './hooks/useMacroEngine';
import { useAutoClicker } from './hooks/useAutoClicker';

const Dashboard = () => {
  const macro = useMacroEngine();
  const auto = useAutoClicker();

  return (
		<AppShell>
			<div className="flex flex-col gap-8">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<h1 className="text-4xl font-semibold text-white">
							MacroArc
						</h1>
					</div>
					<div className="flex flex-col items-end gap-3">
						<ThemeToggle />
					</div>
				</div>

				<HeroBanner
					stats={macro.stats}
					autoclickerRunning={auto.running}
					autoclickerSummary={auto.configSummary}
				/>

				<div className="grid gap-6 lg:grid-cols-3">
					<div className="order-1 lg:order-1 lg:col-span-2">
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
					</div>

					<div className="order-2 lg:order-2 lg:col-span-1">
						<AutoClickerPanel
							config={auto.config}
							metrics={auto.metrics}
							running={auto.running}
							updateConfig={auto.updateConfig}
							onStart={auto.start}
							onStop={auto.stop}
							configSummary={auto.configSummary}
						/>
					</div>

					<div className="order-3 lg:order-3 lg:col-span-2">
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
							onUpdateLoopSettings={
								macro.updateMacroLoopSettings
							}
							onUpdateMacroEvents={macro.updateMacroEvents}
							queueLoopEnabled={macro.queueLoopEnabled}
							queueLoopDelayMs={macro.queueLoopDelayMs}
							onUpdateQueueLoop={macro.updateQueueLoopSettings}
							queueHotkey={macro.queueHotkey}
							onUpdateQueueHotkey={macro.updateQueueHotkey}
							queueRunning={macro.queueRunning}
						/>
					</div>
					<div className="order-5 lg:order-4 lg:col-span-1 lg:col-start-3">
						<ActivityFeedPanel entries={macro.activity} />
					</div>
					<div className="order-4 lg:order-5 lg:col-span-2 lg:col-start-1">
						<InsightGrid
							macroStats={macro.stats}
							autoMetrics={auto.metrics}
						/>
					</div>
					<div className="order-6 lg:order-5 lg:col-span-2 lg:col-start-1">
						<AboutButton />
					</div>
				</div>
			</div>
		</AppShell>
  )
};

function App() {
  return (
    <ThemeProvider>
      <Dashboard />
    </ThemeProvider>
  );
}

export default App;
