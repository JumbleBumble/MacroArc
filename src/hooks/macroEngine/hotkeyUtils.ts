import { MacroEvent } from '../../utils/macroTypes'
import {
	RECORDER_HOTKEY_HEAD_WINDOW_MS,
	RECORDER_HOTKEY_TAIL_WINDOW_MS,
} from './constants'

type HotkeyMatcher = {
	aliasSet: Set<string>
	canonicalTokens: string[]
}

const HOTKEY_TOKEN_ALIASES: Record<string, string[]> = {
	commandorcontrol: ['command', 'cmd', 'meta', 'control', 'ctrl'],
	command: ['command', 'cmd', 'meta'],
	cmd: ['command', 'cmd', 'meta'],
	control: ['control', 'ctrl'],
	ctrl: ['control', 'ctrl'],
	alt: ['alt'],
	option: ['alt'],
	shift: ['shift'],
	meta: ['meta', 'command', 'cmd'],
	super: ['meta', 'super'],
}

const normalizeHotkeySegment = (value: string) => {
	let normalized = value.trim().toLowerCase()
	if (normalized.length > 4) {
		if (normalized.endsWith('left')) {
			normalized = normalized.slice(0, -4)
		} else if (normalized.endsWith('right')) {
			normalized = normalized.slice(0, -5)
		}
	}
	return normalized
}

export const buildHotkeyMatcher = (combo: string | null): HotkeyMatcher | null => {
	if (!combo?.length) return null
	const canonicalTokens = combo
		.split('+')
		.map(normalizeHotkeySegment)
		.filter(Boolean)
	if (!canonicalTokens.length) return null
	const aliasSet = new Set<string>()
	canonicalTokens.forEach((token) => {
		const aliases = HOTKEY_TOKEN_ALIASES[token] ?? [token]
		aliases.forEach((alias) => aliasSet.add(alias))
	})
	return { aliasSet, canonicalTokens }
}

const getEventHotkeyTokens = (event: MacroEvent) => {
	if (event.kind.type !== 'key-down' && event.kind.type !== 'key-up') {
		return null
	}
	const keyLabel = (event.kind as { key?: string }).key
	if (typeof keyLabel !== 'string') {
		return null
	}
	const tokens = keyLabel
		.split('+')
		.map(normalizeHotkeySegment)
		.filter(Boolean)
	return tokens.length ? tokens : null
}

const isRecorderHotkeyEvent = (event: MacroEvent, matcher: HotkeyMatcher) => {
	const tokens = getEventHotkeyTokens(event)
	if (!tokens?.length) {
		return false
	}
	return tokens.every((token) => matcher.aliasSet.has(token))
}

const isExactRecorderHotkeyEvent = (event: MacroEvent, matcher: HotkeyMatcher) => {
	const tokens = getEventHotkeyTokens(event)
	if (!tokens?.length) {
		return false
	}
	if (tokens.length !== matcher.canonicalTokens.length) {
		return false
	}
	return tokens.every((token) => matcher.aliasSet.has(token))
}

export const stripRecorderHotkeyHead = (
	events: MacroEvent[],
	hotkey: string | null
): MacroEvent[] => {
	const matcher = buildHotkeyMatcher(hotkey)
	if (!matcher || !events.length) return events
	let startIndex = 0
	while (startIndex < events.length) {
		const candidate = events[startIndex]
		if (candidate.offsetMs > RECORDER_HOTKEY_HEAD_WINDOW_MS) {
			break
		}
		if (!isRecorderHotkeyEvent(candidate, matcher)) {
			break
		}
		startIndex += 1
	}
	if (!startIndex) {
		return events
	}
	if (startIndex >= events.length) {
		return []
	}
	const baseline = events[startIndex].offsetMs ?? 0
	return events.slice(startIndex).map((event) => ({
		...event,
		offsetMs: Math.max(0, event.offsetMs - baseline),
	}))
}

export const stripRecorderHotkeyTail = (
	events: MacroEvent[],
	hotkey: string | null
): MacroEvent[] => {
	const matcher = buildHotkeyMatcher(hotkey)
	if (!matcher || !events.length) return events
	const lastOffset = events[events.length - 1]?.offsetMs ?? 0
	let cutoff = events.length
	while (cutoff > 0) {
		const candidate = events[cutoff - 1]
		if (
			lastOffset - candidate.offsetMs > RECORDER_HOTKEY_TAIL_WINDOW_MS ||
			!isRecorderHotkeyEvent(candidate, matcher)
		) {
			break
		}
		cutoff -= 1
	}
	if (cutoff === events.length) {
		return events
	}
	return events.slice(0, cutoff)
}

export const removeRecorderHotkeyCombos = (
	events: MacroEvent[],
	hotkey: string | null
): MacroEvent[] => {
	const matcher = buildHotkeyMatcher(hotkey)
	if (!matcher || !events.length) return events
	return events.filter((event) => !isExactRecorderHotkeyEvent(event, matcher))
}

export type { HotkeyMatcher }
