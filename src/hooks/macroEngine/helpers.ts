import {
	DEFAULT_MACRO_SPEED,
	MAX_MACRO_SPEED,
	MIN_MACRO_SPEED,
} from '../../utils/macroTypes'
import { MIN_LOOP_DELAY_MS } from './constants'

export const clampLoopDelay = (value: number | undefined, fallback: number) => {
	if (typeof value !== 'number' || Number.isNaN(value)) {
		return fallback
	}
	return Math.max(MIN_LOOP_DELAY_MS, value)
}

export const clampPlaybackSpeed = (value: number | undefined) => {
	if (typeof value !== 'number' || Number.isNaN(value)) {
		return DEFAULT_MACRO_SPEED
	}
	return Math.min(MAX_MACRO_SPEED, Math.max(MIN_MACRO_SPEED, value))
}

export const wait = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms))

export const ensureNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : fallback
}

export const isMissingFileError = (error: unknown) => {
	const message = `${error ?? ''}`.toLowerCase()
	return (
		message.includes('not found') ||
		message.includes('no such file') ||
		message.includes('os error 2') ||
		message.includes('enoent')
	)
}
