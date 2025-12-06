import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(async () => ({
	plugins: [react()],
	clearScreen: false,
	server: {
		port: 2360,
		strictPort: true,
		host: false,
		hmr: undefined,
		watch: {
			ignored: ['**/src-tauri/**'],
		},
	},
}))
