
// Adapter for cross-browser compatibility
// Handles differences between Chrome (MV3) and Firefox (MV2/MV3) userScripts API

const firefoxScriptsMap = new Map();

export const UserScripts = {
	/**
	 * Register scripts safely across browsers
	 * @param {Array} scripts - Array of script objects in Chrome format
	 */
	async register(scripts) {
		// Detect Firefox environment
		if (globalThis.isFirefox && globalThis.browser.userScripts) {
			// Firefox Implementation
			const promises = scripts.map(async (script) => {
				// If ID exists, unregister first
				if (firefoxScriptsMap.has(script.id)) {
					const oldScript = firefoxScriptsMap.get(script.id);
					if (oldScript && typeof oldScript.unregister === 'function') {
						oldScript.unregister();
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
			// Proactively unregister to avoid "Duplicate script ID" errors
			const ids = scripts.map(s => s.id).filter(id => !!id);
			if (ids.length > 0) {
				await browser.userScripts.unregister({ ids });
			}
			await browser.userScripts.register(scripts);
		} else {
			console.warn("userScripts API not found");
		}
	},

	/**
	 * Unregister scripts by ID
	 * @param {Array<string>} scriptIds 
	 */
	async unregister(scriptIds) {
		if (globalThis.isFirefox && globalThis.browser.userScripts) {
			// Firefox
			for (const id of scriptIds) {
				const script = firefoxScriptsMap.get(id);
				if (script) {
					if (script.unregister) {
						await script.unregister();
					}

				}
			}
		} else if (globalThis.browser.userScripts) {
			const validIds = scriptIds.filter(id => typeof id === 'string' && id.length > 0);
			if (validIds.length > 0) {
				await browser.userScripts.unregister({ ids: validIds });
			}
		} else {
			console.warn("userScripts API not found");
		}
	}
};
