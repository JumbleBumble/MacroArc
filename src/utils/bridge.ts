type TauriWindow = Window & {
	__TAURI_IPC__?: unknown;
	__TAURI_INTERNALS__?: unknown;
	__TAURI__?: unknown;
};

export const isTauri = () => {
	if (typeof window === 'undefined') return false;
	const candidate = window as TauriWindow;

	return (
		typeof candidate.__TAURI_IPC__ !== 'undefined' ||
		typeof candidate.__TAURI_INTERNALS__ !== 'undefined' ||
		typeof candidate.__TAURI__ !== 'undefined'
	);
};

export const getOverlayPanelId = () => {
	if (typeof window === 'undefined') {
		return null
	}
	try {
		const params = new URLSearchParams(window.location.search)
		const value = params.get('overlayPanel')
		return value && value.trim().length ? value : null
	} catch (error) {
		console.warn('overlay panel detection failed', error)
		return null
	}
}

export const isOverlayPanelWindow = () => Boolean(getOverlayPanelId())
