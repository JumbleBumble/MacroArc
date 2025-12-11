import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { MacroSequence } from '../../utils/macroTypes'
import { getAppLocalDataPath } from '../../utils/storage'
import {
	DEFAULT_QUEUE_HOTKEY,
	HOTKEYS_FILENAME,
	LEGACY_QUEUE_HOTKEY_FILENAME,
	LEGACY_RECORDER_HOTKEY_FILENAME,
	MACRO_RECORD_SHORTCUT,
	STORAGE_FILENAME,
} from './constants'
import {
	clampLoopDelay,
	clampPlaybackSpeed,
	isMissingFileError,
} from './helpers'
import { normalizeMacroScrolls } from './eventTransforms'
import { DEFAULT_LOOP_DELAY_MS } from './constants'

type HotkeySettingsFile = {
	queueHotkey?: string | null
	recorderHotkey?: string | null
}

export type HotkeySettings = {
	queueHotkey: string | null
	recorderHotkey: string | null
}

const normalizeHotkeyValue = (value: unknown): string | null | undefined => {
	if (typeof value === 'string') {
		const trimmed = value.trim()
		return trimmed.length ? trimmed : null
	}
	if (value === null) {
		return null
	}
	return undefined
}

export const parseStoredMacros = (raw: string | null): MacroSequence[] | null => {
	if (!raw) return null
	try {
		const parsed = JSON.parse(raw) as MacroSequence[]
		return Array.isArray(parsed) ? parsed : null
	} catch (error) {
		console.warn('macro cache invalid', error)
		return null
	}
}

const parseHotkeysFile = (raw: string | null): HotkeySettingsFile | null => {
	if (!raw) return null
	try {
		const parsed = JSON.parse(raw) as Partial<HotkeySettingsFile>
		const result: HotkeySettingsFile = {}
		const queueValue = normalizeHotkeyValue(parsed.queueHotkey)
		const recorderValue = normalizeHotkeyValue(parsed.recorderHotkey)
		if (queueValue !== undefined) {
			result.queueHotkey = queueValue
		}
		if (recorderValue !== undefined) {
			result.recorderHotkey = recorderValue
		}
		return result
	} catch (error) {
		console.warn('hotkey cache invalid', error)
		return null
	}
}

const readLegacyHotkeyFile = async (
	filename: string
): Promise<string | null | undefined> => {
	try {
		const path = await getAppLocalDataPath(filename)
		const raw = await readTextFile(path)
		const parsed = JSON.parse(raw) as { hotkey?: string | null } | null
		return normalizeHotkeyValue(parsed?.hotkey)
	} catch (error) {
		if (!isMissingFileError(error)) {
			console.warn(`legacy hotkey file read failed (${filename})`, error)
		}
		return undefined
	}
}

export const hydrateStoredMacros = (macros: MacroSequence[]) =>
	macros.map((macro) => {
		const aligned = normalizeMacroScrolls(macro)
		return {
			...aligned,
			hotkey: aligned.hotkey ?? null,
			loopEnabled: Boolean(aligned.loopEnabled),
			loopDelayMs: clampLoopDelay(
				aligned.loopDelayMs ?? DEFAULT_LOOP_DELAY_MS,
				DEFAULT_LOOP_DELAY_MS
			),
			playbackSpeed: clampPlaybackSpeed(aligned.playbackSpeed),
		}
	})

export const loadStoredMacros = async (): Promise<MacroSequence[] | null> => {
	try {
		const path = await getAppLocalDataPath(STORAGE_FILENAME)
		const raw = await readTextFile(path)
		return parseStoredMacros(raw)
	} catch (error) {
		if (!isMissingFileError(error)) {
			console.warn('macro file read failed', error)
		}
		return null
	}
}

export const persistStoredMacros = async (macros: MacroSequence[]) => {
	try {
		const path = await getAppLocalDataPath(STORAGE_FILENAME)
		await writeTextFile(path, JSON.stringify(macros))
	} catch (error) {
		console.warn('macro file write failed', error)
	}
}

export const loadHotkeySettings = async (): Promise<HotkeySettings> => {
	let queueHotkey: string | null = DEFAULT_QUEUE_HOTKEY
	let recorderHotkey: string | null = MACRO_RECORD_SHORTCUT
	let queueFromFile = false
	let recorderFromFile = false

	try {
		const path = await getAppLocalDataPath(HOTKEYS_FILENAME)
		const raw = await readTextFile(path)
		const parsed = parseHotkeysFile(raw)
		if (parsed) {
			if (Object.prototype.hasOwnProperty.call(parsed, 'queueHotkey')) {
				queueHotkey = parsed.queueHotkey ?? null
				queueFromFile = true
			}
			if (Object.prototype.hasOwnProperty.call(parsed, 'recorderHotkey')) {
				recorderHotkey = parsed.recorderHotkey ?? null
				recorderFromFile = true
			}
		}
	} catch (error) {
		if (!isMissingFileError(error)) {
			console.warn('hotkey file read failed', error)
		}
	}

	if (!queueFromFile) {
		const legacyQueue = await readLegacyHotkeyFile(
			LEGACY_QUEUE_HOTKEY_FILENAME
		)
		if (legacyQueue !== undefined) {
			queueHotkey = legacyQueue ?? null
		}
	}

	if (!recorderFromFile) {
		const legacyRecorder = await readLegacyHotkeyFile(
			LEGACY_RECORDER_HOTKEY_FILENAME
		)
		if (legacyRecorder !== undefined) {
			recorderHotkey = legacyRecorder ?? null
		}
	}

	return { queueHotkey, recorderHotkey }
}

export const persistHotkeySettings = async (settings: HotkeySettings) => {
	try {
		const path = await getAppLocalDataPath(HOTKEYS_FILENAME)
		await writeTextFile(
			path,
			JSON.stringify({
				queueHotkey: settings.queueHotkey,
				recorderHotkey: settings.recorderHotkey,
			})
		)
	} catch (error) {
		console.warn('hotkey file write failed', error)
	}
}
