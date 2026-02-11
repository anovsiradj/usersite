
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
		if (isFirefox && typeof browser !== 'undefined' && browser.userScripts) {
			// Firefox Implementation
			const promises = scripts.map(async (script) => {
				// If ID exists, unregister first
				if (firefoxScriptsMap.has(script.id)) {
					try {
						const oldScript = firefoxScriptsMap.get(script.id);
						if (oldScript && typeof oldScript.unregister === 'function') {
							oldScript.unregister();
						}
					} catch (e) {
						console.debug("Error unregistering old script in FF:", e);
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

		} else if (browser.userScripts) {
			// Chrome Implementation (using browser namespace)
			try {
				// Proactively unregister to avoid "Duplicate script ID" errors
				const ids = scripts.map(s => s.id).filter(id => !!id);
				if (ids.length > 0) {
					try {
						await browser.userScripts.unregister({ ids });
					} catch (e) {
						// Ignore error if scripts weren't registered
					}
				}
				await browser.userScripts.register(scripts);
			} catch (e) {
				console.error("Chrome UserScript registration failed:", e);
				throw e;
			}
		} else {
			console.warn("userScripts API not found");
		}
	},

	/**
	 * Unregister scripts by ID
	 * @param {Array<string>} scriptIds 
	 */
	async unregister(scriptIds) {
		if (!scriptIds || !Array.isArray(scriptIds) || scriptIds.length === 0) return;

		if (isFirefox && typeof browser !== 'undefined' && browser.userScripts) {
			// Firefox
			for (const id of scriptIds) {
				const script = firefoxScriptsMap.get(id);
				if (script) {
					try {
						if (typeof script.unregister === 'function') {
							await script.unregister();
						}
					} catch (e) {
						console.debug("Error unregistering script in FF:", e);
					}
					firefoxScriptsMap.delete(id);
				}
			}
		} else if (browser.userScripts) {
			// Chrome
			try {
				const validIds = scriptIds.filter(id => typeof id === 'string' && id.length > 0);
				if (validIds.length > 0) {
					await browser.userScripts.unregister({ ids: validIds });
				}
			} catch (e) {
				// "Nonexistent script" error is common and can be ignored
				const msg = e.message || "";
				if (!msg.includes("nonexistent")) {
					console.warn("Error unregistering in Chrome:", e);
				}
			}
		}
	}
};
