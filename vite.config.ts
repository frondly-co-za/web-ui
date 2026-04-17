import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { createLogger } from 'vite';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

const isTest = !!process.env.VITEST;

// Suppress SvelteKit SSR module runner teardown noise in browser tests.
// When Playwright closes the browser the transport disconnects; any in-flight
// SSR evaluations log this error before the process exits — tests still pass.
function createFilteredLogger() {
	const logger = createLogger();
	const originalError = logger.error.bind(logger);
	logger.error = (msg, options) => {
		if (msg.includes('transport was disconnected')) return;
		originalError(msg, options);
	};
	return logger;
}

export default defineConfig({
	server: {
		port: 4501
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			injectRegister: 'inline',
			manifest: {
				name: 'Frondly',
				short_name: 'Frondly',
				display: 'standalone',
				background_color: '#edf5f1',
				theme_color: '#3a9e7e',
				icons: [
					{
						src: 'icon-192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: 'icon-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any'
					}
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,webp,woff,woff2}']
			},
			devOptions: {
				enabled: !isTest // service worker disabled during test runs
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				customLogger: createFilteredLogger(),
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['test/**/*.svelte.{test,spec}.{js,ts}']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['test/**/*.{test,spec}.{js,ts}'],
					exclude: ['test/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
