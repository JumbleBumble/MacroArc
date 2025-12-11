import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emit, listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { nanoid } from 'nanoid'
import {
	ActivityEntry,
	MacroEvent,
	MacroEventWire,
	MacroSequence,
	MacroStats,
	DEFAULT_MACRO_SPEED,
	fromWireEvent,
	toWireEvent,
} from '../utils/macroTypes'
import { isOverlayPanelWindow, isTauri } from '../utils/bridge'
import {
	CAPTURE_READY_CHANNEL,
	DEFAULT_LOOP_DELAY_MS,
	DEFAULT_QUEUE_HOTKEY,
	DEFAULT_QUEUE_LOOP_DELAY_MS,
	MACRO_RECORD_SHORTCUT,
	MACRO_SYNC_CHANNEL,
	QUEUE_HOTKEY_CHANNEL,
	QUEUE_STATE_CHANNEL,
	QUEUE_STATE_REQUEST_CHANNEL,
	RECENT_EVENT_LIMIT,
	SCROLL_DELTA_MODE_NATIVE,
} from './macroEngine/constants'
import {
	clampLoopDelay,
	clampPlaybackSpeed,
	wait,
} from './macroEngine/helpers'
import {
	normalizeScrollEvents,
	sanitizeMacroEventList,
} from './macroEngine/eventTransforms'
import {
	removeRecorderHotkeyCombos,
	stripRecorderHotkeyHead,
	stripRecorderHotkeyTail,
} from './macroEngine/hotkeyUtils'
import {
	hydrateStoredMacros,
	loadHotkeySettings,
	loadStoredMacros,
	persistHotkeySettings,
	persistStoredMacros,
} from './macroEngine/storage'

const mockRecording = (): MacroEvent[] => {
	const now = Date.now()
	return [
		{
			id: nanoid(),
			offsetMs: 40,
			kind: { type: 'mouse-move', x: 420, y: 420 },
			createdAt: now,
		},
		{
			id: nanoid(),
			offsetMs: 125,
			kind: { type: 'mouse-down', button: 'left' },
			createdAt: now,
		},
		{
			id: nanoid(),
			offsetMs: 210,
			kind: { type: 'mouse-up', button: 'left' },
			createdAt: now,
		},
		{
			id: nanoid(),
			offsetMs: 300,
			kind: { type: 'key-down', key: 'Ctrl+V' },
			createdAt: now,
		},
		{
			id: nanoid(),
			offsetMs: 380,
			kind: { type: 'key-up', key: 'Ctrl+V' },
			createdAt: now,
		},
	]
}

type PlaybackStatusPayload = {
	context_id?: string | null
	state: 'finished' | 'stopped' | string
}

type CaptureBroadcastPayload = {
	source: string
	events: MacroEvent[]
	preview?: MacroEvent[]
	captureName?: string | null
	eventCount?: number
}

type MacroSyncPayload = {
	source?: string
	macros?: MacroSequence[]
}

type QueueStateBroadcastPayload = {
	source?: string
	queue?: string[]
	loopEnabled?: boolean
	loopDelayMs?: number
	running?: boolean
}

type QueueHotkeyBroadcastPayload = {
	source?: string
	hotkey?: string | null
}

type QueueStateRequestPayload = {
	source?: string
}

const pushEntry = (
	updater: Dispatch<SetStateAction<ActivityEntry[]>>,
	entry: ActivityEntry
) => updater((current) => [entry, ...current].slice(0, 18))

const estimateMacroDurationMs = (
	macro: MacroSequence,
	options?: { speed?: number; loops?: number }
) => {
	const lastOffset = macro.events[macro.events.length - 1]?.offsetMs ?? 0
	const speed = Math.max(options?.speed ?? 1, 0.1)
	const loops = Math.max(options?.loops ?? macro.loopCount ?? 1, 1)
	return (lastOffset / speed) * loops
}

export const useMacroEngine = () => {
	const nativeRuntime = isTauri()
	const [windowLabel, setWindowLabel] = useState<string | null>(
		nativeRuntime ? null : 'browser'
	)
	const [macros, setMacros] = useState<MacroSequence[]>([])
	const [macrosHydrated, setMacrosHydrated] = useState(!nativeRuntime)
	const [recording, setRecording] = useState(false)
	const [recentEvents, setRecentEvents] = useState<MacroEvent[]>([])
	const [activity, setActivity] = useState<ActivityEntry[]>([])
	const [selectedMacroId, setSelectedMacroId] = useState<string | null>(null)
	const [statusText, setStatusText] = useState('Idle')
	const [captureName, setCaptureName] = useState('Live Capture')
	const [isPlaying, setIsPlaying] = useState(false)
	const [pendingCapture, setPendingCapture] = useState<MacroEvent[] | null>(
		null
	)
	const [queue, setQueue] = useState<string[]>([])
	const [queueLoopEnabled, setQueueLoopEnabled] = useState(false)
	const [queueLoopDelayMs, setQueueLoopDelayMs] = useState(
		DEFAULT_QUEUE_LOOP_DELAY_MS
	)
	const [queueRunning, setQueueRunning] = useState(false)
	const [queueHotkey, setQueueHotkey] = useState<string | null>(
		DEFAULT_QUEUE_HOTKEY
	)
	const [queueHotkeyHydrated, setQueueHotkeyHydrated] = useState(
		!nativeRuntime
	)
	const [recorderHotkey, setRecorderHotkey] = useState<string | null>(
		MACRO_RECORD_SHORTCUT
	)
	const [recorderHotkeyHydrated, setRecorderHotkeyHydrated] = useState(
		!nativeRuntime
	)
	const [documentVisible, setDocumentVisible] = useState(() => {
		if (typeof document === 'undefined') {
			return true
		}
		return document.visibilityState === 'visible'
	})

	useEffect(() => {
		if (!nativeRuntime) {
			return
		}
		try {
			const current = getCurrentWindow()
			setWindowLabel(current.label)
		} catch (error) {
			console.warn('window label lookup failed', error)
			setWindowLabel('main')
		}
	}, [nativeRuntime])

	useEffect(() => {
		if (typeof document === 'undefined') {
			return
		}
		const handleVisibility = () => {
			setDocumentVisible(document.visibilityState === 'visible')
		}
		document.addEventListener('visibilitychange', handleVisibility)
		return () => {
			document.removeEventListener('visibilitychange', handleVisibility)
		}
	}, [])

	const overlayPanelRuntime = useMemo(() => {
		if (nativeRuntime) {
			if (windowLabel === null) {
				return null
			}
			return windowLabel !== 'main'
		}
		return isOverlayPanelWindow()
	}, [nativeRuntime, windowLabel])

	useEffect(() => {
		if (overlayPanelRuntime === false) {
			queueBroadcastReadyRef.current = true
		}
	}, [overlayPanelRuntime])

	const shouldAttachRealtimeStreams =
		overlayPanelRuntime === false || documentVisible
	const macroHotkeyBindings = useRef<Map<string, string>>(new Map())
	const macroHotkeyPressed = useRef<Map<string, boolean>>(new Map())
	const recorderHotkeyHeldRef = useRef(false)
	const recorderHotkeyResetTimerRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null)
	const recorderHotkeyIntentRef = useRef<'start' | 'stop' | null>(null)
	const recordingOriginRef = useRef<'hotkey' | 'ui' | null>(null)
	const recorderActiveRef = useRef(false)
	const macrosRef = useRef<MacroSequence[]>([])
	const macrosSyncSuppressedRef = useRef(false)
	const macroLoopTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
		new Map()
	)
	const queueLoopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null
	)
	const queueLoopEnabledRef = useRef(queueLoopEnabled)
	const queueLoopDelayRef = useRef(queueLoopDelayMs)
	const activeLoopMacrosRef = useRef<Set<string>>(new Set())
	const queueRunningRef = useRef(queueRunning)
	const queuePlaybackAbortRef = useRef<{ cancelled: boolean }>({
		cancelled: false,
	})
	const queueHotkeyHeldRef = useRef(false)
	const queueRef = useRef<string[]>([])
	const queueHotkeyResetTimerRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null)
	const queueStateSyncSuppressedRef = useRef(false)
	const queueHotkeySyncSuppressedRef = useRef(false)
	const queueBroadcastReadyRef = useRef(!nativeRuntime)
	const lastQueueSnapshotRef = useRef<{
		queue: string[]
		loopEnabled: boolean
		loopDelayMs: number
		running: boolean
	} | null>(null)
	const stopInFlightRef = useRef(false)
	const instanceIdRef = useRef(nanoid())
	const playbackResolversRef = useRef<
		Map<string, (payload: PlaybackStatusPayload) => void>
	>(new Map())
	const currentPlaybackContextRef = useRef<string | null>(null)
	const currentPlaybackMacroRef = useRef<string | null>(null)
	const clearMacroLoopTimer = useCallback((id: string) => {
		const timer = macroLoopTimers.current.get(id)
		if (timer) {
			clearTimeout(timer)
			macroLoopTimers.current.delete(id)
		}
	}, [])
	const clearQueueLoopTimer = useCallback(() => {
		if (queueLoopTimerRef.current) {
			clearTimeout(queueLoopTimerRef.current)
			queueLoopTimerRef.current = null
		}
	}, [])
	const requestStopPlayback = useCallback(async () => {
		currentPlaybackContextRef.current = null
		currentPlaybackMacroRef.current = null
		if (!nativeRuntime) {
			setIsPlaying(false)
			return
		}
		try {
			await invoke('stop_macro_playback')
		} catch (error) {
			console.warn('macro playback stop failed', error)
		} finally {
			setIsPlaying(false)
		}
	}, [nativeRuntime])
	const stopMacroLoop = useCallback(
		(id: string, options?: { silent?: boolean }) => {
			if (activeLoopMacrosRef.current.has(id) && !options?.silent) {
				const target = macrosRef.current.find(
					(macro) => macro.id === id
				)
				if (target) {
					pushEntry(setActivity, {
						id: nanoid(),
						label: `${target.name} loop stopped`,
						tone: 'warning',
						timestamp: Date.now(),
					})
				}
			}
			activeLoopMacrosRef.current.delete(id)
			clearMacroLoopTimer(id)
			if (currentPlaybackMacroRef.current === id) {
				void requestStopPlayback()
			}
		},
		[clearMacroLoopTimer, requestStopPlayback]
	)

	const broadcastCaptureReady = useCallback(
		async (payload: {
			events: MacroEvent[]
			preview: MacroEvent[]
			captureName?: string | null
			count?: number
		}) => {
			if (!nativeRuntime) {
				return
			}
			try {
				await emit<CaptureBroadcastPayload>(CAPTURE_READY_CHANNEL, {
					source: instanceIdRef.current,
					events: payload.events,
					preview: payload.preview,
					captureName: payload.captureName,
					eventCount: payload.count ?? payload.events.length,
				})
			} catch (error) {
				console.warn('capture broadcast failed', error)
			}
		},
		[nativeRuntime]
	)

	useEffect(() => {
		macrosRef.current = macros
	}, [macros])

	useEffect(() => {
		queueRunningRef.current = queueRunning
	}, [queueRunning])

	useEffect(() => {
		queueRef.current = queue
	}, [queue])

	useEffect(() => {
		queueLoopEnabledRef.current = queueLoopEnabled
		if (!queueLoopEnabled) {
			clearQueueLoopTimer()
		}
	}, [queueLoopEnabled, clearQueueLoopTimer])

	useEffect(() => {
		queueLoopDelayRef.current = queueLoopDelayMs
	}, [queueLoopDelayMs])

	const emitMacroSync = useCallback(
		async (snapshot: MacroSequence[]) => {
			if (!nativeRuntime) {
				return
			}
			try {
				await emit<MacroSyncPayload>(MACRO_SYNC_CHANNEL, {
					source: instanceIdRef.current,
					macros: snapshot,
				})
			} catch (error) {
				console.warn('macro sync broadcast failed', error)
			}
		},
		[nativeRuntime]
	)

	const emitQueueState = useCallback(
		async (snapshot: QueueStateBroadcastPayload) => {
			if (!nativeRuntime) {
				return
			}
			try {
				await emit<QueueStateBroadcastPayload>(QUEUE_STATE_CHANNEL, {
					source: instanceIdRef.current,
					queue: snapshot.queue ?? [],
					loopEnabled: snapshot.loopEnabled,
					loopDelayMs: snapshot.loopDelayMs,
					running: snapshot.running,
				})
			} catch (error) {
				console.warn('queue state broadcast failed', error)
			}
		},
		[nativeRuntime]
	)

	const emitQueueHotkey = useCallback(
		async (hotkey: string | null) => {
			if (!nativeRuntime) {
				return
			}
			try {
				await emit<QueueHotkeyBroadcastPayload>(QUEUE_HOTKEY_CHANNEL, {
					source: instanceIdRef.current,
					hotkey,
				})
			} catch (error) {
				console.warn('queue hotkey broadcast failed', error)
			}
		},
		[nativeRuntime]
	)

	useEffect(() => {
		if (!nativeRuntime) {
			return
		}
		const snapshot = {
			queue: [...queue],
			loopEnabled: queueLoopEnabled,
			loopDelayMs: queueLoopDelayMs,
			running: queueRunning,
		}
		const previous = lastQueueSnapshotRef.current
		if (queueStateSyncSuppressedRef.current) {
			queueStateSyncSuppressedRef.current = false
			lastQueueSnapshotRef.current = snapshot
			return
		}
		if (!queueBroadcastReadyRef.current) {
			lastQueueSnapshotRef.current = snapshot
			return
		}
		let matchesPrevious = false
		if (previous) {
			matchesPrevious =
				previous.queue.length === snapshot.queue.length &&
				previous.queue.every(
					(id, index) => id === snapshot.queue[index]
				) &&
				previous.loopEnabled === snapshot.loopEnabled &&
				previous.loopDelayMs === snapshot.loopDelayMs &&
				previous.running === snapshot.running
		}
		if (matchesPrevious) {
			return
		}
		lastQueueSnapshotRef.current = snapshot
		void emitQueueState(snapshot)
	}, [
		emitQueueState,
		nativeRuntime,
		queue,
		queueLoopDelayMs,
		queueLoopEnabled,
		queueRunning,
	])

	useEffect(() => {
		if (!nativeRuntime || !queueHotkeyHydrated) {
			return
		}
		if (queueHotkeySyncSuppressedRef.current) {
			queueHotkeySyncSuppressedRef.current = false
			return
		}
		void emitQueueHotkey(queueHotkey)
	}, [emitQueueHotkey, nativeRuntime, queueHotkey, queueHotkeyHydrated])

	const applyMacrosUpdate = useCallback(
		(updater: (prev: MacroSequence[]) => MacroSequence[]) => {
			setMacros((prev) => {
				const next = updater(prev)
				if (!macrosSyncSuppressedRef.current) {
					void emitMacroSync(next)
				}
				return next
			})
		},
		[emitMacroSync]
	)

	const replaceMacros = useCallback(
		(next: MacroSequence[], options?: { suppressSync?: boolean }) => {
			const suppress = Boolean(options?.suppressSync)
			if (suppress) {
				macrosSyncSuppressedRef.current = true
			}
			setMacros(next)
			if (suppress) {
				macrosSyncSuppressedRef.current = false
			} else if (!macrosSyncSuppressedRef.current) {
				void emitMacroSync(next)
			}
		},
		[emitMacroSync]
	)

	useEffect(() => {
		if (!nativeRuntime) {
			return
		}

		let cancelled = false

		;(async () => {
			try {
				const stored = await loadStoredMacros()
				if (!cancelled && stored) {
					const normalized = hydrateStoredMacros(stored)
					replaceMacros(normalized, { suppressSync: true })
					setSelectedMacroId((current) => {
						if (
							current &&
							normalized.some((macro) => macro.id === current)
						) {
							return current
						}
						return normalized[0]?.id ?? null
					})
				}
			} finally {
				if (!cancelled) {
					setMacrosHydrated(true)
				}
			}
		})()

		return () => {
			cancelled = true
		}
	}, [nativeRuntime, replaceMacros])

	useEffect(() => {
		if (!nativeRuntime) return

		let cancelled = false

		;(async () => {
			const next = await loadHotkeySettings()
			if (!cancelled) {
				setQueueHotkey(next.queueHotkey)
				setRecorderHotkey(next.recorderHotkey)
				setQueueHotkeyHydrated(true)
				setRecorderHotkeyHydrated(true)
			}
		})()

		return () => {
			cancelled = true
		}
	}, [nativeRuntime])

	useEffect(() => {
		if (!nativeRuntime || !queueHotkeyHydrated || !recorderHotkeyHydrated)
			return

		void persistHotkeySettings({
			queueHotkey: queueHotkey ?? null,
			recorderHotkey: recorderHotkey ?? null,
		})
	}, [
		nativeRuntime,
		queueHotkeyHydrated,
		recorderHotkeyHydrated,
		queueHotkey,
		recorderHotkey,
	])

	useEffect(() => {
		if (!nativeRuntime || !macrosHydrated) return

		void persistStoredMacros(macros)
	}, [macros, nativeRuntime, macrosHydrated])

	useEffect(() => {
		setSelectedMacroId((current) => {
			if (current && macros.some((macro) => macro.id === current)) {
				return current
			}
			return macros[0]?.id ?? null
		})
	}, [macros])

	useEffect(() => {
		if (!nativeRuntime || !shouldAttachRealtimeStreams) return
		let unlistenStatus: (() => void) | undefined
		let unlistenError: (() => void) | undefined
		let unlistenPlayback: (() => void) | undefined
		let unlistenCapture: (() => void) | undefined
		;(async () => {
			unlistenStatus = await listen<string>(
				'macro://status',
				({ payload }) => {
					if (payload === 'recording-started') {
						recorderActiveRef.current = true
						setRecording(true)
						stopInFlightRef.current = false
						setStatusText('Listening for input...')
						setPendingCapture(null)
						setRecentEvents([])
						return
					}
					if (payload === 'recording-stopped') {
						recorderActiveRef.current = false
						setRecording(false)
						stopInFlightRef.current = false
						setStatusText('Idle')
						return
					}
					setStatusText(payload)
				}
			)
			unlistenError = await listen<string>(
				'macro://error',
				({ payload }) => {
					pushEntry(setActivity, {
						id: nanoid(),
						label: 'Recorder error',
						tone: 'warning',
						meta: payload,
						timestamp: Date.now(),
					})
				}
			)
			unlistenPlayback = await listen<PlaybackStatusPayload>(
				'macro://playback',
				({ payload }) => {
					setIsPlaying(false)
					if (payload?.context_id) {
						if (
							currentPlaybackContextRef.current ===
							payload.context_id
						) {
							currentPlaybackContextRef.current = null
							currentPlaybackMacroRef.current = null
						}
						const resolver = playbackResolversRef.current.get(
							payload.context_id
						)
						if (resolver) {
							resolver(payload)
							playbackResolversRef.current.delete(
								payload.context_id
							)
						}
					} else {
						playbackResolversRef.current.forEach((resolve) =>
							resolve(payload)
						)
						playbackResolversRef.current.clear()
						currentPlaybackContextRef.current = null
						currentPlaybackMacroRef.current = null
					}
				}
			)
			unlistenCapture = await listen<CaptureBroadcastPayload>(
				CAPTURE_READY_CHANNEL,
				({ payload }) => {
					if (!payload || payload.source === instanceIdRef.current) {
						return
					}
					const events = Array.isArray(payload.events)
						? payload.events
						: []
					if (!events.length) {
						return
					}
					const preview =
						Array.isArray(payload.preview) &&
						payload.preview.length
							? payload.preview
							: events.slice(-RECENT_EVENT_LIMIT).reverse()
					setPendingCapture(events)
					setRecentEvents(preview)
					if (payload.captureName) {
						setCaptureName(payload.captureName)
					}
					setStatusText('Capture ready')
					pushEntry(setActivity, {
						id: nanoid(),
						label: 'Capture ready for review',
						tone: 'success',
						meta: `${payload.eventCount ?? events.length} events`,
						timestamp: Date.now(),
					})
				}
			)
			try {
				const snapshot = await invoke<{ recording: boolean }>(
					'app_status'
				)
				setRecording(snapshot.recording)
				recorderActiveRef.current = snapshot.recording
				if (snapshot.recording) {
					setStatusText('Resumed session')
				} else {
					setStatusText('Idle')
				}
			} catch (error) {
				console.warn('status probe failed', error)
			}
		})()

		return () => {
			unlistenStatus?.()
			unlistenError?.()
			unlistenPlayback?.()
			unlistenCapture?.()
		}
	}, [nativeRuntime, shouldAttachRealtimeStreams])

	useEffect(() => {
		if (!nativeRuntime || !shouldAttachRealtimeStreams) {
			return
		}
		let unlistenSync: (() => void) | undefined
		;(async () => {
			unlistenSync = await listen<MacroSyncPayload>(
				MACRO_SYNC_CHANNEL,
				({ payload }) => {
					if (
						!payload ||
						payload.source === instanceIdRef.current ||
						!Array.isArray(payload.macros)
					) {
						return
					}
					replaceMacros(payload.macros, { suppressSync: true })
				}
			)
		})()

		return () => {
			unlistenSync?.()
		}
	}, [nativeRuntime, replaceMacros, shouldAttachRealtimeStreams])

	useEffect(() => {
		if (!nativeRuntime || !shouldAttachRealtimeStreams) {
			return
		}
		let unlistenQueueState: (() => void) | undefined
		let unlistenQueueHotkey: (() => void) | undefined
		let unlistenQueueRequest: (() => void) | undefined
		;(async () => {
			try {
				unlistenQueueState = await listen<QueueStateBroadcastPayload>(
					QUEUE_STATE_CHANNEL,
					({ payload }) => {
						if (
							!payload ||
							payload.source === instanceIdRef.current
						) {
							return
						}
						queueStateSyncSuppressedRef.current = true
						queueBroadcastReadyRef.current = true
						if (Array.isArray(payload.queue)) {
							setQueue([...payload.queue])
						}
						if (typeof payload.loopEnabled === 'boolean') {
							setQueueLoopEnabled(payload.loopEnabled)
						}
						if (typeof payload.loopDelayMs === 'number') {
							setQueueLoopDelayMs(
								clampLoopDelay(
									payload.loopDelayMs,
									DEFAULT_QUEUE_LOOP_DELAY_MS
								)
							)
						}
						if (typeof payload.running === 'boolean') {
							setQueueRunning(payload.running)
						}
					}
				)

				unlistenQueueHotkey =
					await listen<QueueHotkeyBroadcastPayload>(
						QUEUE_HOTKEY_CHANNEL,
						({ payload }) => {
							if (
								!payload ||
								payload.source === instanceIdRef.current
							) {
								return
							}
							queueHotkeySyncSuppressedRef.current = true
							setQueueHotkey(payload.hotkey ?? null)
							setQueueHotkeyHydrated(true)
						}
					)

				unlistenQueueRequest = await listen<QueueStateRequestPayload>(
					QUEUE_STATE_REQUEST_CHANNEL,
					({ payload }) => {
						if (
							!payload ||
							payload.source === instanceIdRef.current ||
							!queueBroadcastReadyRef.current
						) {
							return
						}
						void emitQueueState({
							queue: [...queueRef.current],
							loopEnabled: queueLoopEnabledRef.current,
							loopDelayMs: queueLoopDelayRef.current,
							running: queueRunningRef.current,
						})
					}
				)
			} catch (error) {
				console.warn('queue sync listener failed', error)
			}
		})()

		return () => {
			unlistenQueueState?.()
			unlistenQueueHotkey?.()
			unlistenQueueRequest?.()
		}
	}, [emitQueueState, nativeRuntime, shouldAttachRealtimeStreams])

	useEffect(() => {
		if (!nativeRuntime || !shouldAttachRealtimeStreams) {
			return
		}
		if (queueBroadcastReadyRef.current) {
			return
		}
		void emit<QueueStateRequestPayload>(QUEUE_STATE_REQUEST_CHANNEL, {
			source: instanceIdRef.current,
		}).catch((error) => {
			console.warn('queue state request failed', error)
		})
	}, [nativeRuntime, shouldAttachRealtimeStreams])

	const startRecording = useCallback(
		async (name?: string) => {
			const invokedViaHotkey =
				recorderHotkeyIntentRef.current === 'start'
			recorderHotkeyIntentRef.current = null
			if (stopInFlightRef.current) {
				return
			}
			if (recording || recorderActiveRef.current) {
				if (!recording && recorderActiveRef.current) {
					setRecording(true)
					setStatusText('Recorder already running')
				}
				return
			}
			stopInFlightRef.current = false
			const label = name?.trim() || `Capture ${macros.length + 1}`
			setCaptureName(label)
			setRecentEvents([])
			setPendingCapture(null)
			setStatusText('Listening for input...')
			recordingOriginRef.current = invokedViaHotkey ? 'hotkey' : 'ui'
			pushEntry(setActivity, {
				id: nanoid(),
				label: `Recording ${label}`,
				tone: 'info',
				timestamp: Date.now(),
			})

			if (nativeRuntime) {
				try {
					await invoke('start_recording')
					recorderActiveRef.current = true
				} catch (error) {
					recorderActiveRef.current = false
					recordingOriginRef.current = null
					pushEntry(setActivity, {
						id: nanoid(),
						label: 'Recorder error',
						tone: 'warning',
						meta: String(error),
						timestamp: Date.now(),
					})
					setRecording(false)
					setStatusText('Error arming recorder')
					return
				}
			} else {
				recorderActiveRef.current = true
			}

			setRecording(true)
		},
		[macros.length, nativeRuntime, recording]
	)

	const stopRecording = useCallback(
		async (_name?: string) => {
			const stopViaHotkey = recorderHotkeyIntentRef.current === 'stop'
			recorderHotkeyIntentRef.current = null
			if (stopInFlightRef.current) {
				return
			}
			let shouldStop = recording || recorderActiveRef.current
			if (!shouldStop && nativeRuntime) {
				try {
					const snapshot = await invoke<{ recording: boolean }>(
						'app_status'
					)
					if (snapshot.recording) {
						shouldStop = true
						recorderActiveRef.current = true
						setRecording(true)
						setStatusText('Resumed session')
					}
				} catch (error) {
					console.warn('recorder status probe failed', error)
				}
			}
			if (!shouldStop) {
				return
			}
			stopInFlightRef.current = true
			const startedViaHotkey = recordingOriginRef.current === 'hotkey'
			const captureLabel = captureName
			let stopError: unknown = null
			try {
				let events: MacroEvent[] = []
				if (nativeRuntime) {
					const payload = await invoke<MacroEventWire[]>(
						'stop_recording'
					)
					events = payload.map(fromWireEvent)
				} else {
					events = mockRecording()
				}

				events = normalizeScrollEvents(events)

				let sorted = [...events].sort(
					(a, b) => a.offsetMs - b.offsetMs
				)
				if (startedViaHotkey) {
					sorted = stripRecorderHotkeyHead(sorted, recorderHotkey)
				}
				sorted = removeRecorderHotkeyCombos(sorted, recorderHotkey)
				const sanitized = stopViaHotkey
					? stripRecorderHotkeyTail(sorted, recorderHotkey)
					: sorted
				if (!sanitized.length) {
					setStatusText('No events captured')
					pushEntry(setActivity, {
						id: nanoid(),
						label: 'Empty capture discarded',
						tone: 'warning',
						timestamp: Date.now(),
					})
					return
				}

				const preview = sanitized.slice(-RECENT_EVENT_LIMIT).reverse()
				setRecentEvents(preview)

				setPendingCapture(sanitized)
				if (nativeRuntime) {
					void broadcastCaptureReady({
						events: sanitized,
						preview,
						captureName: captureLabel,
						count: sanitized.length,
					})
				}
				setStatusText('Capture ready')
				pushEntry(setActivity, {
					id: nanoid(),
					label: 'Capture ready for review',
					tone: 'success',
					meta: `${sanitized.length} events`,
					timestamp: Date.now(),
				})
			} catch (error) {
				stopError = error
				pushEntry(setActivity, {
					id: nanoid(),
					label: 'Recorder stopped unexpectedly',
					tone: 'warning',
					meta: String(error),
					timestamp: Date.now(),
				})
			} finally {
				if (stopError && nativeRuntime) {
					try {
						const snapshot = await invoke<{ recording: boolean }>(
							'app_status'
						)
						recorderActiveRef.current = snapshot.recording
						setRecording(snapshot.recording)
						if (snapshot.recording) {
							setStatusText('Recorder still running')
						}
					} catch (probeError) {
						console.warn(
							'recorder status probe failed after stop',
							probeError
						)
					}
				} else {
					recorderActiveRef.current = false
					setRecording(false)
				}
				recordingOriginRef.current = null
				stopInFlightRef.current = false
			}
		},
		[
			broadcastCaptureReady,
			captureName,
			nativeRuntime,
			recorderHotkey,
			recording,
		]
	)

	useEffect(() => {
		if (
			!nativeRuntime ||
			!recorderHotkeyHydrated ||
			!recorderHotkey ||
			overlayPanelRuntime !== false
		)
			return

		const scheduleReleaseFallback = () => {
			if (typeof window === 'undefined') {
				return
			}
			if (recorderHotkeyResetTimerRef.current) {
				window.clearTimeout(recorderHotkeyResetTimerRef.current)
			}
			recorderHotkeyResetTimerRef.current = window.setTimeout(() => {
				recorderHotkeyHeldRef.current = false
				recorderHotkeyResetTimerRef.current = null
			}, 1500)
		}

		const clearReleaseFallback = () => {
			if (
				typeof window !== 'undefined' &&
				recorderHotkeyResetTimerRef.current
			) {
				window.clearTimeout(recorderHotkeyResetTimerRef.current)
				recorderHotkeyResetTimerRef.current = null
			}
		}

		const setupShortcut = async () => {
			try {
				await unregister(recorderHotkey).catch(() => undefined)
				await register(recorderHotkey, async (event) => {
					try {
						if (event.state === 'Released') {
							recorderHotkeyHeldRef.current = false
							clearReleaseFallback()
							return
						}
						if (
							event.state !== 'Pressed' ||
							recorderHotkeyHeldRef.current
						) {
							return
						}
						recorderHotkeyHeldRef.current = true
						scheduleReleaseFallback()
						const isRecorderActive =
							recorderActiveRef.current || recording
						recorderHotkeyIntentRef.current = isRecorderActive
							? 'stop'
							: 'start'
						if (isRecorderActive) {
							await stopRecording()
						} else {
							await startRecording()
						}
					} catch (error) {
						console.warn(
							'macro recorder hotkey toggle failed',
							error
						)
					}
				})
			} catch (error) {
				console.warn(
					'macro recorder hotkey registration failed',
					error
				)
			}
		}

		void setupShortcut()

		return () => {
			recorderHotkeyHeldRef.current = false
			clearReleaseFallback()
			if (recorderHotkey) {
				void unregister(recorderHotkey).catch(() => undefined)
			}
		}
	}, [
		nativeRuntime,
		overlayPanelRuntime,
		recorderHotkeyHydrated,
		recorderHotkey,
		recording,
		startRecording,
		stopRecording,
	])

	const persistMacro = useCallback(
		(events: MacroEvent[], name?: string): MacroSequence => ({
			id: nanoid(),
			name: name?.trim() || captureName,
			accent: '#ff9d4d',
			tags: ['capture'],
			loopCount: 1,
			loopEnabled: false,
			loopDelayMs: DEFAULT_LOOP_DELAY_MS,
			playbackSpeed: DEFAULT_MACRO_SPEED,
			events,
			lastRun: Date.now(),
			hotkey: null,
			scrollDeltaMode: SCROLL_DELTA_MODE_NATIVE,
		}),
		[captureName]
	)

	const savePendingCapture = useCallback(
		async (label?: string) => {
			if (!pendingCapture?.length) return
			const macro = persistMacro(pendingCapture, label)
			applyMacrosUpdate((prev) => [macro, ...prev])
			setSelectedMacroId(macro.id)
			setPendingCapture(null)
			pushEntry(setActivity, {
				id: nanoid(),
				label: `Saved ${macro.name}`,
				tone: 'success',
				meta: `${macro.events.length} events`,
				timestamp: Date.now(),
			})
			setStatusText('Idle')
		},
		[applyMacrosUpdate, pendingCapture, persistMacro]
	)

	const discardPendingCapture = useCallback(() => {
		if (!pendingCapture?.length) return
		setPendingCapture(null)
		setStatusText('Idle')
		pushEntry(setActivity, {
			id: nanoid(),
			label: 'Capture discarded',
			tone: 'warning',
			timestamp: Date.now(),
		})
	}, [pendingCapture])

	const executeEvents = useCallback(
		async (
			events: MacroEvent[],
			options?: { speed?: number; loops?: number; contextId?: string }
		) => {
			if (!events.length) return null
			const contextId = options?.contextId ?? nanoid()
			setIsPlaying(true)
			if (nativeRuntime) {
				await invoke('play_macro', {
					request: {
						events: events.map(toWireEvent),
						playback_speed: options?.speed ?? 1,
						loop_count: options?.loops ?? 1,
						context_id: contextId,
					},
				})
			} else {
				const baseDuration = events[events.length - 1]?.offsetMs ?? 0
				const speed = Math.max(options?.speed ?? 1, 0.1)
				const loops = Math.max(options?.loops ?? 1, 1)
				const estimated = (baseDuration / speed) * loops
				setTimeout(
					() => setIsPlaying(false),
					Math.max(estimated + 250, 600)
				)
			}
			return contextId
		},
		[nativeRuntime]
	)

	const playMacroBase = useCallback(
		async (
			target: MacroSequence,
			options?: {
				speed?: number
				loops?: number
				silentActivity?: boolean
			}
		) => {
			const contextId = nanoid()
			currentPlaybackContextRef.current = contextId
			currentPlaybackMacroRef.current = target.id
			const loops = options?.loops ?? target.loopCount
			const speed = clampPlaybackSpeed(
				options?.speed ?? target.playbackSpeed ?? DEFAULT_MACRO_SPEED
			)
			const playbackPromise = nativeRuntime
				? new Promise<PlaybackStatusPayload>((resolve) => {
						playbackResolversRef.current.set(contextId, resolve)
				  })
				: wait(
						Math.max(
							estimateMacroDurationMs(target, { loops, speed }) +
								250,
							600
						)
				  ).then(() => {
						if (currentPlaybackContextRef.current === contextId) {
							currentPlaybackContextRef.current = null
							currentPlaybackMacroRef.current = null
						}
						setIsPlaying(false)
						return {
							context_id: contextId,
							state: 'finished' as const,
						}
				  })

			if (!options?.silentActivity) {
				pushEntry(setActivity, {
					id: nanoid(),
					label: `Playing ${target.name}`,
					tone: 'info',
					meta: `${target.events.length} steps`,
					timestamp: Date.now(),
				})
			}

			try {
				await executeEvents(target.events, {
					speed,
					loops,
					contextId,
				})
			} catch (error) {
				playbackResolversRef.current.delete(contextId)
				currentPlaybackContextRef.current = null
				currentPlaybackMacroRef.current = null
				throw error
			}

			await playbackPromise

			applyMacrosUpdate((prev) =>
				prev.map((macro) =>
					macro.id === target.id
						? {
								...macro,
								lastRun: Date.now(),
						  }
						: macro
				)
			)
		},
		[applyMacrosUpdate, executeEvents, nativeRuntime, setIsPlaying]
	)

	const scheduleMacroLoop = useCallback(
		(macroId: string) => {
			clearMacroLoopTimer(macroId)
			const target = macrosRef.current.find(
				(macro) => macro.id === macroId
			)
			if (!target?.loopEnabled) {
				activeLoopMacrosRef.current.delete(macroId)
				return
			}
			const delay = clampLoopDelay(
				target.loopDelayMs ?? DEFAULT_LOOP_DELAY_MS,
				DEFAULT_LOOP_DELAY_MS
			)
			activeLoopMacrosRef.current.add(macroId)
			const timer = setTimeout(async () => {
				macroLoopTimers.current.delete(macroId)
				const latest = macrosRef.current.find(
					(macro) => macro.id === macroId
				)
				if (
					!latest?.loopEnabled ||
					!activeLoopMacrosRef.current.has(macroId)
				) {
					activeLoopMacrosRef.current.delete(macroId)
					return
				}
				await playMacroBase(latest, { silentActivity: true })
				if (!activeLoopMacrosRef.current.has(macroId)) {
					return
				}
				scheduleMacroLoop(macroId)
			}, delay)
			macroLoopTimers.current.set(macroId, timer)
		},
		[clearMacroLoopTimer, playMacroBase]
	)

	const playPendingCapture = useCallback(async () => {
		if (!pendingCapture?.length) return
		pushEntry(setActivity, {
			id: nanoid(),
			label: 'Playing pending capture',
			tone: 'info',
			meta: `${pendingCapture.length} events`,
			timestamp: Date.now(),
		})
		await executeEvents(pendingCapture)
	}, [executeEvents, pendingCapture])

	const playMacro = useCallback(
		async (
			id: string,
			options?: {
				speed?: number
				loops?: number
				suppressLoop?: boolean
			}
		) => {
			const target = macros.find((macro) => macro.id === id)
			if (!target) return
			await playMacroBase(target, options)
			if (target.loopEnabled && !options?.suppressLoop) {
				scheduleMacroLoop(target.id)
			}
		},
		[macros, playMacroBase, scheduleMacroLoop]
	)

	useEffect(() => {
		if (!nativeRuntime || !macrosHydrated || overlayPanelRuntime !== false)
			return

		const refreshHotkeys = async () => {
			const unregisterAll = Array.from(
				macroHotkeyBindings.current.values()
			).map((combo) => unregister(combo).catch(() => undefined))
			await Promise.all(unregisterAll)
			macroHotkeyBindings.current.clear()
			macroHotkeyPressed.current.clear()

			await Promise.all(
				macros
					.filter((macro) => Boolean(macro.hotkey))
					.map(async (macro) => {
						if (!macro.hotkey) return
						try {
							await register(macro.hotkey, async (event) => {
								if (event.state === 'Pressed') {
									macroHotkeyPressed.current.set(
										macro.id,
										true
									)
									return
								}
								if (event.state === 'Released') {
									if (
										!macroHotkeyPressed.current.get(
											macro.id
										)
									) {
										return
									}
									macroHotkeyPressed.current.set(
										macro.id,
										false
									)
									const isLooping =
										activeLoopMacrosRef.current.has(
											macro.id
										)
									const isActivePlayback =
										currentPlaybackMacroRef.current ===
										macro.id
									if (isLooping || isActivePlayback) {
										stopMacroLoop(macro.id)
										return
									}
									await playMacro(macro.id)
								}
							})
							macroHotkeyBindings.current.set(
								macro.id,
								macro.hotkey
							)
							macroHotkeyPressed.current.set(macro.id, false)
						} catch (error) {
							console.warn(
								`macro hotkey registration failed for ${macro.name}`,
								error
							)
						}
					})
			)
		}

		void refreshHotkeys()

		return () => {
			const pending = Array.from(
				macroHotkeyBindings.current.values()
			).map((combo) => unregister(combo).catch(() => undefined))
			macroHotkeyBindings.current.clear()
			macroHotkeyPressed.current.clear()
			void Promise.all(pending)
		}
	}, [
		macros,
		macrosHydrated,
		nativeRuntime,
		overlayPanelRuntime,
		playMacro,
		stopMacroLoop,
	])

	const deleteMacro = useCallback(
		(id: string) => {
			const target = macros.find((macro) => macro.id === id)
			stopMacroLoop(id, { silent: true })

			applyMacrosUpdate((prev) =>
				prev.filter((macro) => macro.id !== id)
			)

			if (target) {
				pushEntry(setActivity, {
					id: nanoid(),
					label: 'Macro removed',
					tone: 'warning',
					meta: target.name,
					timestamp: Date.now(),
				})
			}

			if (selectedMacroId === id) {
				setSelectedMacroId(null)
			}
		},
		[applyMacrosUpdate, macros, selectedMacroId, stopMacroLoop]
	)

	const stats: MacroStats = useMemo(() => {
		const totalEvents = macros.reduce(
			(sum, macro) => sum + macro.events.length,
			0
		)
		const averageDuration =
			macros.reduce(
				(sum, macro) =>
					sum +
					(macro.events.length
						? macro.events[macro.events.length - 1].offsetMs
						: 0),
				0
			) / Math.max(macros.length, 1)

		return {
			totalMacros: macros.length,
			totalEvents,
			averageDurationMs: averageDuration,
			lastRecordedName: captureName,
			activeProfile: selectedMacroId
				? macros.find((m) => m.id === selectedMacroId)?.name ??
				  'Untitled'
				: 'Untitled',
		}
	}, [captureName, macros, selectedMacroId])

	const applyQueueState = useCallback(
		(next: string[] | ((prev: string[]) => string[])) => {
			queueBroadcastReadyRef.current = true
			setQueue((prev) =>
				typeof next === 'function'
					? (next as (value: string[]) => string[])(prev)
					: next
			)
		},
		[]
	)

	const queueMacro = useCallback(
		(id: string) => {
			const macro = macros.find((item) => item.id === id)
			if (!macro) return
			applyQueueState((current) => [...current, id])
			pushEntry(setActivity, {
				id: nanoid(),
				label: `${macro.name} queued`,
				tone: 'info',
				timestamp: Date.now(),
			})
		},
		[applyQueueState, macros]
	)

	const queuedMacros = useMemo(
		() =>
			queue
				.map((id) => macros.find((macro) => macro.id === id))
				.filter((macro): macro is MacroSequence => Boolean(macro)),
		[queue, macros]
	)

	const stopQueuePlayback = useCallback(
		(options?: {
			disableLoop?: boolean
			silent?: boolean
			reason?: string
		}) => {
			const isRunning =
				queueRunningRef.current || Boolean(queueLoopTimerRef.current)
			if (!isRunning) {
				if (options?.disableLoop) {
					setQueueLoopEnabled(false)
				}
				return
			}
			queuePlaybackAbortRef.current.cancelled = true
			clearQueueLoopTimer()
			setQueueRunning(false)
			if (options?.disableLoop) {
				setQueueLoopEnabled(false)
			}
			void requestStopPlayback()
			if (!options?.silent) {
				pushEntry(setActivity, {
					id: nanoid(),
					label: 'Queue playback stopped',
					tone: 'warning',
					meta: options?.reason,
					timestamp: Date.now(),
				})
			}
		},
		[
			clearQueueLoopTimer,
			requestStopPlayback,
			setQueueLoopEnabled,
			setQueueRunning,
		]
	)

	const runQueueSequence = useCallback(
		async (macroIds: string[], controller: { cancelled: boolean }) => {
			for (const id of macroIds) {
				if (controller.cancelled) {
					break
				}
				await playMacro(id, { suppressLoop: true })
				if (controller.cancelled) {
					break
				}
			}
		},
		[playMacro]
	)

	const scheduleQueueLoop = useCallback(
		(macroIds: string[]) => {
			clearQueueLoopTimer()
			if (!queueLoopEnabledRef.current || !macroIds.length) {
				return
			}

			const delay = clampLoopDelay(
				queueLoopDelayRef.current,
				DEFAULT_QUEUE_LOOP_DELAY_MS
			)
			queueLoopTimerRef.current = setTimeout(async () => {
				queueLoopTimerRef.current = null
				if (!queueLoopEnabledRef.current) {
					return
				}
				applyQueueState(macroIds)
				pushEntry(setActivity, {
					id: nanoid(),
					label: 'Repeating queue',
					tone: 'info',
					meta: `${macroIds.length} items`,
					timestamp: Date.now(),
				})
				const controller = { cancelled: false }
				queuePlaybackAbortRef.current = controller
				setQueueRunning(true)
				try {
					await runQueueSequence(macroIds, controller)
				} finally {
					setQueueRunning(false)
				}
				if (!controller.cancelled && queueLoopEnabledRef.current) {
					scheduleQueueLoop(macroIds)
				}
			}, delay)
		},
		[
			applyQueueState,
			clearQueueLoopTimer,
			runQueueSequence,
			setQueueRunning,
		]
	)

	const clearQueue = useCallback(() => {
		if (!queue.length && !queueRunningRef.current) return
		applyQueueState([])
		stopQueuePlayback({
			disableLoop: true,
			silent: true,
			reason: 'Queue cleared',
		})
		pushEntry(setActivity, {
			id: nanoid(),
			label: 'Queue cleared',
			tone: 'warning',
			timestamp: Date.now(),
		})
	}, [applyQueueState, queue, stopQueuePlayback])

	const updateMacroEvents = useCallback(
		(id: string, events: MacroEvent[]) => {
			const baseline = macrosRef.current.find((macro) => macro.id === id)
			if (!baseline) return
			const sanitized = sanitizeMacroEventList(events)
			const wasLooping = activeLoopMacrosRef.current.has(id)
			stopMacroLoop(id, { silent: true })
			applyMacrosUpdate((prev) =>
				prev.map((macro) =>
					macro.id === id
						? {
								...macro,
								events: sanitized,
						  }
						: macro
				)
			)
			pushEntry(setActivity, {
				id: nanoid(),
				label: `${baseline.name} updated`,
				tone: 'success',
				meta: `${sanitized.length} steps`,
				timestamp: Date.now(),
			})
			if (wasLooping && baseline.loopEnabled) {
				scheduleMacroLoop(id)
			}
		},
		[applyMacrosUpdate, scheduleMacroLoop, stopMacroLoop]
	)

	const updateMacroLoopSettings = useCallback(
		(id: string, settings: { enabled?: boolean; delayMs?: number }) => {
			const baseline = macrosRef.current.find((macro) => macro.id === id)
			if (!baseline) return
			const nextEnabled =
				settings.enabled ?? baseline.loopEnabled ?? false
			const nextDelay = clampLoopDelay(
				settings.delayMs ??
					baseline.loopDelayMs ??
					DEFAULT_LOOP_DELAY_MS,
				DEFAULT_LOOP_DELAY_MS
			)

			applyMacrosUpdate((prev) =>
				prev.map((macro) =>
					macro.id === id
						? {
								...macro,
								loopEnabled: nextEnabled,
								loopDelayMs: nextDelay,
						  }
						: macro
				)
			)

			if (nextEnabled) {
				if (macroLoopTimers.current.has(id)) {
					scheduleMacroLoop(id)
				}
			} else {
				stopMacroLoop(id, { silent: true })
			}
		},
		[applyMacrosUpdate, scheduleMacroLoop, stopMacroLoop]
	)

	const updateMacroPlaybackSpeed = useCallback(
		(id: string, speed: number) => {
			const baseline = macrosRef.current.find((macro) => macro.id === id)
			if (!baseline) return
			const nextSpeed = clampPlaybackSpeed(speed)
			if (baseline.playbackSpeed === nextSpeed) {
				return
			}
			applyMacrosUpdate((prev) =>
				prev.map((macro) =>
					macro.id === id
						? {
								...macro,
								playbackSpeed: nextSpeed,
						  }
						: macro
				)
			)
			pushEntry(setActivity, {
				id: nanoid(),
				label: `${baseline.name} speed updated`,
				tone: 'info',
				meta: `${nextSpeed.toFixed(2)}x`,
				timestamp: Date.now(),
			})
		},
		[applyMacrosUpdate]
	)

	const playQueuedMacros = useCallback(async () => {
		if (!queuedMacros.length || queueRunningRef.current) return
		const itemsToPlay = [...queuedMacros]
		const macroIds = itemsToPlay.map((macro) => macro.id)
		if (queueLoopEnabledRef.current) {
			applyQueueState(macroIds)
		} else {
			applyQueueState([])
		}
		pushEntry(setActivity, {
			id: nanoid(),
			label: 'Playing queued macros',
			tone: 'info',
			meta: `${itemsToPlay.length} items`,
			timestamp: Date.now(),
		})
		const controller = { cancelled: false }
		queuePlaybackAbortRef.current = controller
		setQueueRunning(true)
		try {
			await runQueueSequence(macroIds, controller)
		} finally {
			setQueueRunning(false)
		}
		if (queueLoopEnabledRef.current && !controller.cancelled) {
			scheduleQueueLoop(macroIds)
		}
	}, [applyQueueState, queuedMacros, runQueueSequence, scheduleQueueLoop])

	useEffect(() => {
		if (!nativeRuntime || overlayPanelRuntime !== false) return

		const scheduleReleaseFallback = () => {
			if (typeof window === 'undefined') {
				return
			}
			if (queueHotkeyResetTimerRef.current) {
				window.clearTimeout(queueHotkeyResetTimerRef.current)
			}
			queueHotkeyResetTimerRef.current = window.setTimeout(() => {
				queueHotkeyHeldRef.current = false
				queueHotkeyResetTimerRef.current = null
			}, 1500)
		}

		const clearReleaseFallback = () => {
			if (
				typeof window !== 'undefined' &&
				queueHotkeyResetTimerRef.current
			) {
				window.clearTimeout(queueHotkeyResetTimerRef.current)
				queueHotkeyResetTimerRef.current = null
			}
		}

		const setup = async () => {
			try {
				if (!queueHotkey) {
					return
				}
				await register(queueHotkey, async (event) => {
					if (event.state === 'Released') {
						queueHotkeyHeldRef.current = false
						clearReleaseFallback()
						return
					}
					if (
						event.state !== 'Pressed' ||
						queueHotkeyHeldRef.current
					) {
						return
					}
					queueHotkeyHeldRef.current = true
					scheduleReleaseFallback()
					if (queueRunningRef.current || queueLoopTimerRef.current) {
						stopQueuePlayback({
							disableLoop: true,
							reason: 'Shortcut',
						})
					} else {
						await playQueuedMacros()
					}
				})
			} catch (error) {
				console.warn('queue toggle hotkey registration failed', error)
			}
		}

		void setup()

		return () => {
			queueHotkeyHeldRef.current = false
			clearReleaseFallback()
			if (queueHotkey) {
				void unregister(queueHotkey).catch(() => undefined)
			}
		}
	}, [
		nativeRuntime,
		overlayPanelRuntime,
		playQueuedMacros,
		queueHotkey,
		stopQueuePlayback,
	])

	const updateQueueLoopSettings = useCallback(
		(settings: { enabled?: boolean; delayMs?: number }) => {
			if (
				typeof settings.delayMs === 'number' &&
				!Number.isNaN(settings.delayMs)
			) {
				setQueueLoopDelayMs(
					clampLoopDelay(
						settings.delayMs,
						DEFAULT_QUEUE_LOOP_DELAY_MS
					)
				)
			}
			if (typeof settings.enabled === 'boolean') {
				setQueueLoopEnabled(settings.enabled)
			}
		},
		[]
	)

	const updateQueueHotkey = useCallback((value: string | null) => {
		const next = value?.trim() ? value.trim() : null
		setQueueHotkey(next)
		pushEntry(setActivity, {
			id: nanoid(),
			label: next ? 'Queue hotkey updated' : 'Queue hotkey cleared',
			tone: next ? 'success' : 'warning',
			meta: next ?? undefined,
			timestamp: Date.now(),
		})
	}, [])

	const updateRecorderHotkey = useCallback((value: string | null) => {
		const next = value?.trim() ? value.trim() : null
		setRecorderHotkey(next)
		pushEntry(setActivity, {
			id: nanoid(),
			label: next
				? 'Recorder hotkey updated'
				: 'Recorder hotkey cleared',
			tone: next ? 'success' : 'warning',
			meta: next ?? undefined,
			timestamp: Date.now(),
		})
	}, [])

	const updateMacroHotkey = useCallback(
		(id: string, hotkey: string | null) => {
			const target = macros.find((macro) => macro.id === id)
			applyMacrosUpdate((prev) =>
				prev.map((macro) =>
					macro.id === id
						? {
								...macro,
								hotkey,
						  }
						: macro
				)
			)

			if (target) {
				pushEntry(setActivity, {
					id: nanoid(),
					label: hotkey
						? `Hotkey bound to ${target.name}`
						: `Hotkey cleared for ${target.name}`,
					tone: hotkey ? 'success' : 'warning',
					meta: hotkey ?? undefined,
					timestamp: Date.now(),
				})
			}
		},
		[applyMacrosUpdate, macros]
	)

	const pendingCaptureMetrics = useMemo(() => {
		if (!pendingCapture?.length) {
			return { count: 0, duration: 0 }
		}
		const duration =
			pendingCapture[pendingCapture.length - 1]?.offsetMs ?? 0
		return { count: pendingCapture.length, duration }
	}, [pendingCapture])

	useEffect(() => {
		return () => {
			Array.from(activeLoopMacrosRef.current).forEach((id) => {
				stopMacroLoop(id, { silent: true })
			})
			queuePlaybackAbortRef.current.cancelled = true
			clearQueueLoopTimer()
			void requestStopPlayback()
		}
	}, [clearQueueLoopTimer, requestStopPlayback, stopMacroLoop])

	return {
		macros,
		stats,
		recording,
		recentEvents,
		activity,
		selectedMacroId,
		setSelectedMacroId,
		captureName,
		setCaptureName,
		statusText,
		startRecording,
		stopRecording,
		savePendingCapture,
		playPendingCapture,
		discardPendingCapture,
		playMacro,
		deleteMacro,
		updateMacroEvents,
		queueMacro,
		queue,
		queuedMacros,
		playQueuedMacros,
		clearQueue,
		queueRunning,
		queueHotkey,
		updateQueueHotkey,
		recorderHotkey,
		updateRecorderHotkey,
		updateMacroLoopSettings,
		updateMacroPlaybackSpeed,
		updateMacroHotkey,
		queueLoopEnabled,
		queueLoopDelayMs,
		updateQueueLoopSettings,
		isPlaying,
		pendingCaptureMetrics,
		hasPendingCapture: Boolean(pendingCapture?.length),
	}
}
