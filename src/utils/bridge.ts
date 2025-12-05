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
