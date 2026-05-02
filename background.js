
// Load shared libraries
import './js/helper.js';
import './js/browser.js';
import './js/wrapper.js';

import { ConfigManager } from './lib/config-manager.js';
import { CacheManager } from './lib/cache-manager.js';
import { UserScripts } from './lib/api-adapter.js';
import { logger } from './lib/logger.js';

// === Injection Path Overview ===
//
// JS Path (registerJSResources):
//   registerScriptsForConfig(configId)
//     → browser.userScripts.register()
//     → scripts run at document_start in MAIN world
//   Cleanup: unregisterScriptsForConfig(configId)
//     → browser.userScripts.unregister()
//   Triggered on: ADD_CONFIG, TOGGLE_ON, RELOAD_CONFIGS, onInstalled, onStartup
//   Cleaned up on: TOGGLE_OFF, DELETE_CONFIG, RELOAD_CONFIGS (before re-register)
//
// CSS Path (injectCSSResources):
//   injectConfigIntoMatchingTabs(configId)
//     → browser.tabs.sendMessage({ type: 'INJECT', config })
//     → content.js injectCSS() → DOM <style data-usersite-config="...">
//   Cleanup: browser.tabs.sendMessage({ type: 'CLEANUP', configId })
//     → content.js removes [data-usersite-config=configId] elements
//   Triggered on: ADD_CONFIG, TOGGLE_ON, RELOAD_CONFIGS
//   Cleaned up on: TOGGLE_OFF, DELETE_CONFIG

const configManager = new ConfigManager();
const cacheManager = new CacheManager();
const userScriptsRegistry = new Map();

async function unregisterScriptsForConfig(configId) {
	// 1. Clear in-memory tracking
	const keys = Array.from(userScriptsRegistry.keys());
	for (const key of keys) {
		if (key.startsWith(`${configId}:`)) {
			userScriptsRegistry.delete(key);
		}
	}

	// 2. Explicitly remove from Browser Engine (Chrome/FF)
	// We query the engine for all scripts and filter by our predictable prefix
	const prefix = `usersite_${configId}_`.replace(/[^a-zA-Z0-9_]/g, '_');

	if (browser.userScripts.getScripts) {
		const scripts = await browser.userScripts.getScripts();
		const idsToUnregister = scripts
			.map(s => s.id)
			.filter(id => id.startsWith(prefix));

		if (idsToUnregister.length > 0) {
			await browser.userScripts.unregister({ ids: idsToUnregister });
		}
	}
}

async function registerScriptsForConfig(configId) {
	// Always unregister first to prevent duplicate scripts after SW restart
	await unregisterScriptsForConfig(configId);

	const config = configManager.getConfig(configId);
	if (!config || !config.enabled || !config.js || !Array.isArray(config.js)) return;

	// Get file storage for this config
	const storageKey = `usersite_files_${configId}`;
	const storageResult = await browser.storage.local.get([storageKey]);
	const fileStorage = storageResult[storageKey] || {};

	const scriptsToRegister = [];
	for (let index = 0; index < config.js.length; index++) {
		const item = config.js[index];
		const scriptKey = `${configId}:${index}`;
		const scriptId = sourceToId(config, item);

		let jsConfig = [];
		if (item.file) {
			if (isFileHttp(item.file)) {
				// Try to get from cache manager
				try {
					await cacheManager.init();
					const content = await cacheManager.getCachedContent(configId, item.file);
					if (content) {
						jsConfig = [{ code: content }];
					} else {
						console.warn(`Remote script ${item.file} not found in cache for config ${configId}`);
						continue;
					}
				} catch (e) {
					logger.error(`Error getting cached script ${item.file}:`, e);
					continue;
				}
			} else {
				// Local file from storage
				const code = fileStorage[item.file];
				if (code) {
					const base64 = code.split(',')[1];
					jsConfig = [{ code: atob(base64) }];
				} else {
					console.warn(`File ${item.file} not found in storage for config ${configId}`);
					continue;
				}
			}
		} else if (item.code) {
			jsConfig = [{ code: item.code }];
		}

		if (jsConfig.length > 0) {
			scriptsToRegister.push({
				id: scriptId,
				matches: config.matches,
				js: jsConfig,
				runAt: item.runAt || 'document_start',
				world: 'MAIN'
			});

			userScriptsRegistry.set(scriptKey, scriptId);
		}
	}

	if (scriptsToRegister.length > 0) {
		try {
			await UserScripts.register(scriptsToRegister);
		} catch (e) {
			logger.error(`Failed to register scripts for ${configId}:`, e);
		}
	}
}

// CSS injection only — JS is handled by userScripts API (see registerScriptsForConfig)
async function sendInjectToTab(tabId, config) {
	try {
		await browser.tabs.sendMessage(tabId, { type: 'INJECT', config });
	} catch (_) {
		// If message fails, it usually means content script is not ready or tab is closing.
		// Since content.js is now a content script, we don't need manual injection fallback.
		// We can just log the error or ignore it.
		console.debug(`Could not send inject message to tab ${tabId}`);
	}
}

async function injectConfigIntoMatchingTabs(configId) {
	const config = configManager.getConfig(configId);
	const matches = config ? config.matches : null;
	if (!config || !config.enabled || !matches || (Array.isArray(matches) ? !matches.length : !matches)) return;

	const tabs = await browser.tabs.query({ url: matches });

	for (const tab of tabs) {
		if (tab && tab.id) {
			try {
				await sendInjectToTab(tab.id, config);
			} catch (_) {}
		}
	}
}

// Load configs on startup
configManager.loadAllConfigs().then(async () => {
	const configs = await configManager.getAllConfigs();
	for (const config of configs) {
		if (config.enabled) {
			await registerScriptsForConfig(config.id);
		}
	}
}).catch(err => {
	logger.error('Error loading configs on startup:', err);
});

// Initialize extension
browser.runtime.onInstalled.addListener(async () => {
	console.log('UserSite extension installed');
	console.debug(globalThis)

	await configManager.loadAllConfigs();
	const configs = await configManager.getAllConfigs();
	for (const config of configs) {
		if (config.enabled) {
			await registerScriptsForConfig(config.id);
		}
	}
});

// Also load on startup (for when extension is already installed)
browser.runtime.onStartup.addListener(async () => {
	console.log('UserSite extension started');
	await configManager.loadAllConfigs();
	const configs = await configManager.getAllConfigs();
	for (const config of configs) {
		if (config.enabled) {
			await registerScriptsForConfig(config.id);
		}
	}
});

// Open dashboard (options page) when the extension icon is clicked
browser.action.onClicked.addListener(() => {
	browser.runtime.openOptionsPage();
});

// Handle messages from content scripts and dashboard
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === 'GET_CONFIGS') {
		configManager.getAllConfigs()
			.then(configs => {
				sendResponse({ success: true, configs });
			})
			.catch(error => {
				logger.error('Error getting configs:', error);
				sendResponse({ success: false, error: error.message });
			});
		return true;
	}

	if (message.type === 'TOGGLE_CONFIG') {
		(async () => {
			try {
				await configManager.toggleConfig(message.configId, message.enabled);
				if (message.enabled === false) {
					// JS cleanup: unregisterScriptsForConfig handles userScripts API
					// CSS cleanup: CLEANUP message removes <style> elements in content.js
					// Cleanup parity confirmed: both JS and CSS paths are cleaned up on TOGGLE_OFF

					// 1. Unregister from Chrome/FF engine
					await unregisterScriptsForConfig(message.configId);

					// 2. Notify tabs to cleanup
					const config = configManager.getConfig(message.configId);
					if (config && config.matches) {
						const tabs = await browser.tabs.query({ url: config.matches });
						for (const tab of tabs) {
							if (tab.id) {
								browser.tabs.sendMessage(tab.id, { type: 'CLEANUP', configId: message.configId }).catch(() => {});
							}
						}
					}
				} else {
					await registerScriptsForConfig(message.configId);
					await injectConfigIntoMatchingTabs(message.configId);
				}
				sendResponse({ success: true });
			} catch (error) {
				logger.error('Error toggling config:', error);
				sendResponse({ success: false, error: error.message });
			}
		})();
		return true;
	}

	if (message.type === 'DELETE_CONFIG') {
		(async () => {
			try {
				// JS cleanup: unregisterScriptsForConfig handles userScripts API
				// CSS cleanup: CLEANUP message removes <style> elements in content.js
				// Cleanup parity confirmed: both JS and CSS paths are cleaned up on DELETE_CONFIG

				// 1. Get the config before deleting it so we know its matches for cleanup
				const config = configManager.getConfig(message.configId);

				// 2. Unregister from Chrome/FF engine
				await unregisterScriptsForConfig(message.configId);

				// 3. Notify matching tabs to remove injected CSS/DOM elements
				if (config && config.matches) {
					const tabs = await browser.tabs.query({ url: config.matches });
					for (const tab of tabs) {
						if (tab.id) {
							browser.tabs.sendMessage(tab.id, { type: 'CLEANUP', configId: message.configId }).catch(() => {});
						}
					}
				}

				// 4. Finally remove from storage
				await configManager.deleteConfig(message.configId);
				sendResponse({ success: true });
			} catch (error) {
				logger.error('Error deleting config:', error);
				sendResponse({ success: false, error: error.message });
			}
		})();
		return true;
	}

	if (message.type === 'ADD_CONFIG') {
		(async () => {
			try {
				console.log('ADD_CONFIG request:', message.configId);
				// Unregister existing scripts for this config before adding/updating
				await unregisterScriptsForConfig(message.configId);
				await configManager.addConfig(message.configId, message.config);
				if (message.config && message.config.enabled) {
					await registerScriptsForConfig(message.configId);
				}
				await injectConfigIntoMatchingTabs(message.configId);
				sendResponse({ success: true });
			} catch (error) {
				logger.error('Error in ADD_CONFIG:', error);
				sendResponse({ success: false, error: error.message || String(error) });
			}
		})();
		return true;
	}

	if (message.type === 'RELOAD_CONFIGS') {
		(async () => {
			try {
				await configManager.loadAllConfigs();
				// JS cleanup: Query engine directly instead of relying on in-memory registry (which is lost on SW restart)
				// CSS re-inject: injectConfigIntoMatchingTabs re-injects CSS into matching tabs after reload
				// Cleanup parity confirmed: JS engine scripts are unregistered and CSS is re-injected on RELOAD_CONFIGS
				if (browser.userScripts && browser.userScripts.getScripts) {
					const allScripts = await browser.userScripts.getScripts();
					const usersiteIds = allScripts.map(s => s.id).filter(id => id.startsWith('usersite_'));
					if (usersiteIds.length > 0) {
						await browser.userScripts.unregister({ ids: usersiteIds });
					}
				}
				userScriptsRegistry.clear();
				const configs = await configManager.getAllConfigs();
				for (const cfg of configs) {
					if (cfg && cfg.enabled) {
						await registerScriptsForConfig(cfg.id);
						await injectConfigIntoMatchingTabs(cfg.id);
					}
				}
				sendResponse({ success: true });
			} catch (error) {
				logger.error('Error reloading configs:', error);
				sendResponse({ success: false, error: error.message });
			}
		})();
		return true;
	}

	if (message.type === 'GET_TAB_ID') {
		// Get tab ID from the sender
		const tabId = sender.tab?.id;
		if (tabId) {
			sendResponse({ success: true, tabId: tabId });
		} else {
			// Fallback: try to get active tab
			browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
				if (tabs && tabs[0]) {
					sendResponse({ success: true, tabId: tabs[0].id });
				} else {
					sendResponse({ success: false, error: 'Could not determine tab ID' });
				}
			});
		}
	}

	if (message.type === 'GET_CACHED_CONTENT') {
		cacheManager.init().then(() => cacheManager.getCachedContent(message.configId, message.url))
			.then(content => sendResponse({ success: true, content }))
			.catch(err => sendResponse({ success: false, error: err.message }));
		return true;
	}

	if (message.type === 'GET_LOGS') {
		sendResponse({ success: true, logs: logger.getLogs() });
		return true;
	}

	if (message.type === 'CLEAR_LOGS') {
		logger.clearLogs();
		sendResponse({ success: true });
		return true;
	}
});
