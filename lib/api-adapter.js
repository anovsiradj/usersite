
// Adapter for cross-browser compatibility
// Handles differences between Chrome (MV3) and Firefox (MV2/MV3) userScripts API

const firefoxScriptsMap = new Map();

export const UserScripts = {
	/**
	 * Register scripts safely across browsers.
	 * Handles Chrome MV3 and Firefox MV3 userScripts API differences.
	 * @param {Array} scripts - Array of script objects in Chrome format
	 */
	async register(scripts) {
		// Detect Firefox environment
		if (globalThis.isFirefox && globalThis.browser.userScripts) {
			// Firefox Implementation
			const promises = scripts.map(async (script) => {
				// Unregister existing script with this ID if tracked in-memory.
				// If the SW restarted, firefoxScriptsMap is empty — skip silently.
				if (firefoxScriptsMap.has(script.id)) {
					const oldScript = firefoxScriptsMap.get(script.id);
					if (oldScript && typeof oldScript.unregister === 'function') {
						try {
							await oldScript.unregister();
						} catch (_) {
							// Script may already be gone after extension reload
						}
					}
					firefoxScriptsMap.delete(script.id);
				}

				// Map Chrome format to Firefox options
				const opts = {
					matches: script.matches,
					js: script.js, // Compatible format [{code: string}]
					runAt: script.runAt || 'document_idle',
					allFrames: script.allFrames || false
				};

				if (script.excludeMatches) opts.excludeMatches = script.excludeMatches;

				// Firefox doesn't support 'world' property in the options object usually, 
				// it handles isolation differently. We'll omit it for FF.

				try {
					const registered = await browser.userScripts.register(opts);
					firefoxScriptsMap.set(script.id, registered);
				} catch (err) {
					console.error("FF UserScript registration failed:", err);
					throw err;
				}
			});
			await Promise.all(promises);

		} else if (globalThis.browser.userScripts) {
			// Unregister existing scripts with these IDs before re-registering.
			// We query the engine first so we only attempt to unregister IDs that
			// actually exist — avoids "Nonexistent script ID" errors after an
			// extension reload in dev mode (Chrome wipes all userScripts on reload).
			const ids = scripts.map(s => s.id).filter(id => !!id);
			if (ids.length > 0) {
				const existing = await browser.userScripts.getScripts({ ids });
				const existingIds = existing.map(s => s.id);
				if (existingIds.length > 0) {
					await browser.userScripts.unregister({ ids: existingIds });
				}
			}
			await browser.userScripts.register(scripts);
		} else {
			console.warn("userScripts API not found");
		}
	},
};
