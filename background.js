// Background script for UserSite extension (simplified, no ES modules)
// Manages extension state and handles file/config loading

// Load shared libraries
import './js/helper.js';
import './js/browser.js';
import { ConfigManager } from './lib/config-manager.js';
import { CacheManager } from './lib/cache-manager.js';
import { UserScripts } from './lib/api-adapter.js';

const configManager = new ConfigManager();
const cacheManager = new CacheManager();
const userScriptsRegistry = new Map();
const pendingRegistrations = new Set();

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

	if (isChrome && browser.userScripts && browser.userScripts.getScripts) {
		const scripts = await browser.userScripts.getScripts();
		const idsToUnregister = scripts
			.map(s => s.id)
			.filter(id => id.startsWith(prefix));

		if (idsToUnregister.length > 0) {
			await browser.userScripts.unregister({ ids: idsToUnregister });
		}
	} else if (typeof UserScripts !== 'undefined' && UserScripts.unregister) {
		// Fallback to adapter for Firefox or other cases
		const config = configManager.getConfig(configId);
		const ids = [];
		if (config && config.js) {
			config.js.forEach(item => ids.push(makeItemIden(configId, item)));
		}
		if (ids.length > 0) {
			await UserScripts.unregister(ids);
		}
	}
}

async function registerScriptsForConfig(configId) {
	const config = configManager.getConfig(configId);
	if (!config || !config.enabled || !config.js || !Array.isArray(config.js)) return;

	// Get file storage for this config
	const storageKey = `usersite_files_${configId}`;
	const storageResult = await browser.storage.local.get([storageKey]);
	const fileStorage = storageResult[storageKey] || {};

	const scriptsToRegister = [];
	config.js.forEach((item, index) => {
		const scriptKey = `${configId}:${index}`;
		const scriptId = makeItemIden(configId, item);

		let jsConfig = [];
		if (item.file) {
			// If it's a file, try to get code from local storage
			const code = fileStorage[item.file];
			if (code) {
				// DataURL to code
				const base64 = code.split(',')[1];
				jsConfig = [{ code: atob(base64) }];
			} else {
				// Fallback or warning if file not found in storage
				console.warn(`File ${item.file} not found in storage for config ${configId}`);
				return; // Skip this script
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
	});

	if (scriptsToRegister.length > 0) {
		try {
			await UserScripts.register(scriptsToRegister);
		} catch (e) {
			console.error(`Failed to register scripts for ${configId}:`, e);
		}
	}
}

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
			} catch (_) { }
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
	console.error('Error loading configs on startup:', err);
});

// Initialize extension
browser.runtime.onInstalled.addListener(async () => {
	console.log('UserSite extension installed');
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

// Handle messages from content scripts and dashboard
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === 'GET_CONFIGS') {
		configManager.getAllConfigs()
			.then(configs => {
				sendResponse({ success: true, configs });
			})
			.catch(error => {
				console.error('Error getting configs:', error);
				sendResponse({ success: false, error: error.message });
			});
		return true;
	}

	if (message.type === 'TOGGLE_CONFIG') {
		(async () => {
			try {
				await configManager.toggleConfig(message.configId, message.enabled);
				if (message.enabled === false) {
					// 1. Unregister from Chrome/FF engine
					await unregisterScriptsForConfig(message.configId);

					// 2. Notify tabs to cleanup
					const config = configManager.getConfig(message.configId);
					if (config && config.matches) {
						const tabs = await browser.tabs.query({ url: config.matches });
						for (const tab of tabs) {
							if (tab.id) {
								browser.tabs.sendMessage(tab.id, { type: 'CLEANUP', configId: message.configId }).catch(() => { });
							}
						}
					}
				} else {
					await registerScriptsForConfig(message.configId);
					await injectConfigIntoMatchingTabs(message.configId);
				}
				sendResponse({ success: true });
			} catch (error) {
				console.error('Error toggling config:', error);
				sendResponse({ success: false, error: error.message });
			}
		})();
		return true;
	}

	if (message.type === 'DELETE_CONFIG') {
		(async () => {
			try {
				// 1. Get the config before deleting it so we know its matches for cleanup
				const config = configManager.getConfig(message.configId);

				// 2. Unregister from Chrome/FF engine
				await unregisterScriptsForConfig(message.configId);

				// 3. Notify matching tabs to remove injected CSS/DOM elements
				if (config && config.matches) {
					const tabs = await browser.tabs.query({ url: config.matches });
					for (const tab of tabs) {
						if (tab.id) {
							browser.tabs.sendMessage(tab.id, { type: 'CLEANUP', configId: message.configId }).catch(() => { });
						}
					}
				}

				// 4. Finally remove from storage
				await configManager.deleteConfig(message.configId);
				sendResponse({ success: true });
			} catch (error) {
				console.error('Error deleting config:', error);
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
				console.error('Error in ADD_CONFIG:', error);
				sendResponse({ success: false, error: error.message || String(error) });
			}
		})();
		return true;
	}

	if (message.type === 'RELOAD_CONFIGS') {
		(async () => {
			try {
				await configManager.loadAllConfigs();
				const ids = Array.from(userScriptsRegistry.values());
				if (ids.length) {
					await UserScripts.unregister(ids);
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
				console.error('Error reloading configs:', error);
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
});
