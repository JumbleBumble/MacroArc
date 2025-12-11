import {
	MacroEvent,
	MacroSequence,
	MouseButton,
} from '../../utils/macroTypes'
import {
	SCROLL_DELTA_MODE_NATIVE,
	VALID_MOUSE_BUTTONS,
} from './constants'
import { ensureNumber } from './helpers'

const coerceButton = (button: MouseButton): MouseButton =>
	VALID_MOUSE_BUTTONS.includes(button) ? button : 'unknown'

export const sanitizeMacroEvent = (event: MacroEvent): MacroEvent => {
	const offset = Math.max(0, Math.round(ensureNumber(event.offsetMs, 0)))
	switch (event.kind.type) {
		case 'mouse-move':
			return {
				...event,
				offsetMs: offset,
				kind: {
					type: 'mouse-move',
					x: Math.round(ensureNumber(event.kind.x, 0)),
					y: Math.round(ensureNumber(event.kind.y, 0)),
				},
			}
		case 'mouse-down':
		case 'mouse-up':
			return {
				...event,
				offsetMs: offset,
				kind: {
					type: event.kind.type,
					button: coerceButton(event.kind.button),
				},
			}
		case 'key-down':
		case 'key-up': {
			const key =
				typeof event.kind.key === 'string' ? event.kind.key.trim() : ''
			return {
				...event,
				offsetMs: offset,
				kind: {
					type: event.kind.type,
					key,
				},
			}
		}
		case 'scroll':
			return {
				...event,
				offsetMs: offset,
				kind: {
					type: 'scroll',
					delta_x: ensureNumber(event.kind.delta_x, 0),
					delta_y: ensureNumber(event.kind.delta_y, 0),
				},
			}
		default:
			return { ...event, offsetMs: offset }
	}
}

export const sanitizeMacroEventList = (events: MacroEvent[]) =>
	[...events].map(sanitizeMacroEvent).sort((a, b) => a.offsetMs - b.offsetMs)

const invertScroll = (value: MacroEvent): MacroEvent => {
	if (value.kind.type !== 'scroll') {
		return value
	}
	return {
		...value,
		kind: {
			...value.kind,
			delta_x: -value.kind.delta_x,
			delta_y: -value.kind.delta_y,
		},
	}
}

export const normalizeScrollEvents = (events: MacroEvent[]) =>
	events.map((event) => (event.kind.type === 'scroll' ? invertScroll(event) : event))

export const shouldNormalizeMacroScrolls = (
	macro: MacroSequence | null | undefined
) => {
	if (!macro || macro.scrollDeltaMode === SCROLL_DELTA_MODE_NATIVE) {
		return false
	}
	if (!Array.isArray(macro.tags) || !macro.tags.includes('capture')) {
		return false
	}
	return macro.events.some((event) => event.kind.type === 'scroll')
}

export const normalizeMacroScrolls = (macro: MacroSequence) =>
	shouldNormalizeMacroScrolls(macro)
		? {
				...macro,
				events: normalizeScrollEvents(macro.events),
				scrollDeltaMode: SCROLL_DELTA_MODE_NATIVE,
		  }
		: macro
