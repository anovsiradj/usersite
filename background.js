// Load shared libraries
import './js/helper.js';
import './js/browser.js';

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
//   Triggered on: ADD_CONFIG, TOGGLE_ON, RELOAD_CONFIGS, onInstalled, module startup
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

async function unregisterScriptsForConfig(configId) {
	// Query the engine for all scripts matching this config's prefix and unregister them.
	// Querying directly handles SW restarts where in-memory state is lost.
	//
	// Current registered ID format: usersite_config_{configId}_item_{sourceId}
	// Legacy format (pre-usersite_ prefix fix): config_{configId}_item_{sourceId}
	// Both formats are matched to handle configs registered before the prefix was added.
	const configPart = toId(`config_${configId}`);
	const prefixNew = `usersite_${configPart}_item_`;  // current format
	const prefixOld = `${configPart}_item_`;            // legacy format

	if (browser.userScripts.getScripts) {
		const allScripts = await browser.userScripts.getScripts();
		const allIds = allScripts.map(s => s.id);
		const idsToUnregister = allIds.filter(id =>
			id.startsWith(prefixNew) || id.startsWith(prefixOld)
		);

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

	// Init cache manager once before the loop (idempotent but avoids repeated calls)
	try {
		await cacheManager.init();
	} catch (e) {
		logger.error('CacheManager init failed:', e);
	}

	const scriptsToRegister = [];
	for (let index = 0; index < config.js.length; index++) {
		const item = config.js[index];
		const scriptId = sourceToId(config, item);

		let jsConfig = [];
		if (item.file) {
			if (isFileHttp(item.file)) {
				try {
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
				id: `usersite_${scriptId}`,
				matches: config.matches,
				js: jsConfig,
				runAt: item.runAt || 'document_start',
				world: 'MAIN'
			});
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
		// Message fails when content script is not ready or tab is closing — safe to ignore
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
			await sendInjectToTab(tab.id, config);
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

// Initialize extension on install or update
browser.runtime.onInstalled.addListener(async () => {
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
					await unregisterScriptsForConfig(message.configId);

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
				// Get config before deleting so we know its matches for CSS cleanup
				const config = configManager.getConfig(message.configId);

				await unregisterScriptsForConfig(message.configId);

				if (config && config.matches) {
					const tabs = await browser.tabs.query({ url: config.matches });
					for (const tab of tabs) {
						if (tab.id) {
							browser.tabs.sendMessage(tab.id, { type: 'CLEANUP', configId: message.configId }).catch(() => {});
						}
					}
				}

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
				// Unregister all registered scripts — query engine directly to handle SW restarts.
				// Match both current format (usersite_*) and legacy format (config_*_item_*).
				if (browser.userScripts && browser.userScripts.getScripts) {
					const allScripts = await browser.userScripts.getScripts();
					const usersiteIds = allScripts.map(s => s.id).filter(id =>
						id.startsWith('usersite_') || /^config_[^_].*_item_/.test(id)
					);
					if (usersiteIds.length > 0) {
						await browser.userScripts.unregister({ ids: usersiteIds });
					}
				}
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

	if (message.type === 'LOG') {
		const { level, msg, data } = message;
		if (level === 'error') logger.error(msg, data);
		else if (level === 'warn') logger.warn(msg, data);
		else logger.info(msg, data);
		sendResponse({ success: true });
		return true;
	}
});
