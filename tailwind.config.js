// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
	content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
	theme: {
		extend: {
			fontFamily: {
				display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
				mono: ['"JetBrains Mono"', 'monospace'],
			},
			colors: {
				brand: {
					primary: '#8e67ff',
					secondary: '#5ad7ff',
					accent: '#ff9d4d',
				},
				ink: {
					soft: '#090b12',
					subtle: '#101425',
				},
				paper: {
					soft: '#f5f7fb',
				},
			},
			boxShadow: {
				glass: '0 25px 45px rgba(5, 6, 20, 0.55)',
			},
			backgroundImage: {
				'grid-glow': 'radial-gradient(circle at center, rgba(255,255,255,0.2), transparent 45%)',
			},
			keyframes: {
				'pulse-glow': {
					'0%': { opacity: 0.35 },
					'50%': { opacity: 0.05 },
					'100%': { opacity: 0.35 },
				},
				floaty: {
					'0%, 100%': { transform: 'translateY(0px)' },
					'50%': { transform: 'translateY(-6px)' },
				},
				'wiggle-slow': {
					'0%, 100%': { transform: 'rotate(-1deg)' },
					'50%': { transform: 'rotate(1deg)' },
				},
			},
			animation: {
				'pulse-glow': 'pulse-glow 12s ease-in-out infinite',
				floaty: 'floaty 8s ease-in-out infinite',
				'wiggle-slow': 'wiggle-slow 4s ease-in-out infinite',
			},
		},
	},
	plugins: [],
}
