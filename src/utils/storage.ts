import { mkdir } from '@tauri-apps/plugin-fs'
import { appLocalDataDir, join, BaseDirectory } from '@tauri-apps/api/path'

let cachedAppLocalDataDir: string | null = null
let ensurePromise: Promise<string> | null = null

function isAlreadyExistsError(error: unknown) {
	const message = `${error ?? ''}`.toLowerCase()
	return (
		message.includes('exist') ||
		message.includes('already') ||
		message.includes('eexist') ||
		message.includes('os error 183')
	)
}

async function ensureAppLocalDataDir() {
	if (cachedAppLocalDataDir) {
		return cachedAppLocalDataDir
	}

	if (!ensurePromise) {
		ensurePromise = (async () => {
			const dir = await appLocalDataDir()
			await ensureDirectoryExists(dir)
			cachedAppLocalDataDir = dir
			return dir
		})().finally(() => {
			ensurePromise = null
		})
	}

	return ensurePromise
}

async function ensureDirectoryExists(target: string) {
	try {
		await mkdir('.', {
			baseDir: BaseDirectory.AppLocalData,
			recursive: true,
		})
		return
	} catch (error) {
		if (isAlreadyExistsError(error)) {
			return
		}
	}

	try {
		await mkdir(target, { recursive: true })
	} catch (error) {
		if (!isAlreadyExistsError(error)) {
			throw error
		}
	}
}

export async function getAppLocalDataPath(...segments: string[]) {
	const baseDir = await ensureAppLocalDataDir()
	if (!segments.length) {
		return baseDir
	}
	return join(baseDir, ...segments)
}
