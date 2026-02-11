// Background script for UserSite extension (simplified, no ES modules)
// Manages extension state and handles file/config loading

// Load shared libraries
import './js/browser.js';
import { ConfigManager } from './lib/config-manager.js';
import { normalizeRunAt } from './lib/utils.js';
import { CacheManager } from './lib/cache-manager.js';
import { UserScripts } from './lib/api-adapter.js';

const configManager = new ConfigManager();
const cacheManager = new CacheManager();
const userScriptsRegistry = new Map();
const pendingRegistrations = new Set();

async function unregisterScriptsForConfig(configId) {
  const ids = [];

  // 1. Get IDs from current registry
  const keys = Array.from(userScriptsRegistry.keys());
  for (const key of keys) {
    if (key.startsWith(`${configId}:`)) {
      ids.push(userScriptsRegistry.get(key));
      userScriptsRegistry.delete(key);
    }
  }

  // 2. Proactively try to guess IDs based on the naming convention
  const config = configManager.getConfig(configId);
  if (config && Array.isArray(config.js)) {
    config.js.forEach((item, index) => {
      const name = typeof item === 'string' ? item : (item.file || `inline_${index}`);
      const scriptId = `usersite_${configId}_${name}`.replace(/[^a-zA-Z0-9_]/g, '_');
      if (!ids.includes(scriptId)) ids.push(scriptId);
    });
  }

  if (ids.length) {
    await UserScripts.unregister(ids);
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
      } catch (_) {}
    }
  }
}

// Load configs on startup
configManager.loadAllConfigs().catch(err => {
  console.error('Error loading configs on startup:', err);
});

// Initialize extension
browser.runtime.onInstalled.addListener(async () => {
  console.log('UserSite extension installed');
  await configManager.loadAllConfigs();
});

// Also load on startup (for when extension is already installed)
browser.runtime.onStartup.addListener(async () => {
  console.log('UserSite extension started');
  await configManager.loadAllConfigs();
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
          await unregisterScriptsForConfig(message.configId);
          // Notify tabs to cleanup
          const config = configManager.getConfig(message.configId);
          if (config && config.matches) {
            browser.tabs.query({ url: config.matches }, (tabs) => {
              for (const tab of tabs) {
                if (tab.id) {
                  browser.tabs.sendMessage(tab.id, { type: 'CLEANUP', configId: message.configId });
                }
              }
            });
          }
        } else {
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
        await unregisterScriptsForConfig(message.configId);
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
        await configManager.addConfig(message.configId, message.config);
        await injectConfigIntoMatchingTabs(message.configId);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
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

  if (message.type === 'GET_CONFIG') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID found' });
      return;
    }
    configManager.getConfigForTab(tabId)
      .then(config => {
        sendResponse({ success: true, config });
      })
      .catch(error => {
        console.error('Error getting config for Tab:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'INJECT_JS') {
    injectJS(message.configId, message.jsFileName, message.jsCode, message.runAt || 'document_idle', message.tabId || sender.tab?.id).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
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


async function injectJS(configId, jsFileName, jsCode, runAt, tabId) {
  if (!tabId) {
    throw new Error('Tab ID is required for JS injection');
  }

  let decodedJS = jsCode;

  if (!decodedJS && jsFileName) {
    if (cacheManager.isUrl(jsFileName)) {
      decodedJS = await cacheManager.getCachedContent(configId, jsFileName);
    } else {
      const storageKey = `usersite_files_${configId}`;
      const result = await browser.storage.local.get(storageKey);
      const files = result[storageKey] || {};

      if (!files[jsFileName]) {
        throw new Error(`JS file not found: ${jsFileName}`);
      }

      const jsContent = files[jsFileName].split(',')[1];
      decodedJS = atob(jsContent);
    }
  }

  if (!decodedJS) {
    throw new Error('No JS code provided for injection');
  }

  const normalizedRunAt = normalizeRunAt(runAt);

  let injectImmediately = false;
  if (normalizedRunAt === 'document_start') {
    injectImmediately = true;
  }

  try {

    const config = configManager.getConfig(configId);
    const matches = config ? config.matches : null;
    if (!config || !matches || (Array.isArray(matches) ? !matches.length : !matches)) {
      return; // skip if matches is empty
    }

    let name = jsFileName;
    if (!name && Array.isArray(config.js)) {
      const index = config.js.findIndex(item => typeof item === 'object' && item.code === jsCode);
      if (index !== -1) name = `inline_${index}`;
    }
    if (!name) name = 'inline_unknown';

    const scriptKey = `${configId}:${name}`;
    if (userScriptsRegistry.has(scriptKey) || pendingRegistrations.has(scriptKey)) return;
    pendingRegistrations.add(scriptKey);
    const scriptId = `usersite_${configId}_${name}`.replace(/[^a-zA-Z0-9_]/g, '_');

    // Find original js item and merge with jsDefault
    const jsItem = (config.js || []).find(item => (typeof item === 'string' ? item : (item.file || item.code)) === (jsFileName || jsCode)) || {};
    const mergedItem = Object.assign({ world: 'MAIN' }, config.jsDefault || {}, typeof jsItem === 'object' ? jsItem : { file: jsItem });

    // Strip non-API properties (like path, description) from registration options
    const registrationOptions = {
      id: scriptId,
      matches: matches,
      js: [{ code: decodedJS }],
      runAt: normalizedRunAt,
      world: mergedItem.world || 'MAIN',
    };

    if (mergedItem.allFrames !== undefined) registrationOptions.allFrames = mergedItem.allFrames;
    if (mergedItem.excludeMatches !== undefined) registrationOptions.excludeMatches = mergedItem.excludeMatches;

    await UserScripts.register([registrationOptions]);

    pendingRegistrations.delete(scriptKey);
    userScriptsRegistry.set(scriptKey, scriptId);
  } catch (error) {
    console.error(`Error registering user script:`, error);
    throw error;
  }
}

// Watch for tab updates to inject scripts/styles
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const config = await configManager.getConfigForTab(tabId);
      if (config && config.enabled) {
        await sendInjectToTab(tabId, config);
      }
    } catch (error) {
      console.error('Error injecting scripts:', error);
    }
  }
});
