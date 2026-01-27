// Background script for UserWeb extension (simplified, no ES modules)
// Manages extension state and handles file/config loading

// Browser API compatibility (chrome/browser)
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Config Manager (inline for compatibility)
class ConfigManager {
  constructor() {
    this.configs = new Map();
  }

  async loadAllConfigs() {
    try {
      const result = await browserAPI.storage.local.get(['userweb_configs']);
      if (result.userweb_configs) {
        this.configs = new Map(result.userweb_configs);
      }
    } catch (error) {
      console.error('Error loading configs:', error);
    }
  }

  async saveAllConfigs() {
    try {
      const configsArray = Array.from(this.configs.entries());
      await browserAPI.storage.local.set({ userweb_configs: configsArray });
    } catch (error) {
      console.error('Error saving configs:', error);
    }
  }

  async addConfig(configId, config) {
    if (!this.validateConfig(config)) {
      throw new Error('Invalid config format');
    }
    config.id = configId;
    config.enabled = config.enabled !== undefined ? config.enabled : true;
    this.configs.set(configId, config);
    await this.saveAllConfigs();
    return config;
  }

  getConfig(configId) {
    return this.configs.get(configId);
  }

  getAllConfigs() {
    const configsArray = Array.from(this.configs.values());
    return Promise.resolve(configsArray);
  }

  async getConfigForUrl(url) {
    try {
      const urlObj = new URL(url);
      for (const config of this.configs.values()) {
        if (!config.enabled) continue;
        if (this.matchesUrl(config, urlObj)) {
          return config;
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting config for URL:', error);
      return null;
    }
  }

  matchesUrl(config, urlObj) {
    if (!config.matches || !Array.isArray(config.matches)) {
      return false;
    }
    return config.matches.some(pattern => {
      return this.matchPattern(pattern, urlObj);
    });
  }

  matchPattern(pattern, urlObj) {
    try {
      const [scheme, rest] = pattern.split('://');
      if (!rest) return false;
      const schemePattern = scheme === '*' ? '[^:]+' : scheme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const [host, path] = rest.split('/', 2);
      let hostPattern = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\*/g, '.*')
        .replace(/\\\?/g, '.');
      const pathPattern = path ? path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\*/g, '.*')
        .replace(/\\\?/g, '.') : '.*';
      const regex = new RegExp(`^${schemePattern}://${hostPattern}/${pathPattern}$`);
      return regex.test(urlObj.href);
    } catch (error) {
      console.error('Error matching pattern:', pattern, error);
      return false;
    }
  }

  async toggleConfig(configId, enabled) {
    const config = this.configs.get(configId);
    if (config) {
      config.enabled = enabled;
      await this.saveAllConfigs();
    }
  }

  async deleteConfig(configId) {
    this.configs.delete(configId);
    await this.saveAllConfigs();
  }

  validateConfig(config) {
    if (!config || typeof config !== 'object') return false;
    if (!config.name || typeof config.name !== 'string') return false;
    if (!config.matches || !Array.isArray(config.matches) || config.matches.length === 0) return false;
    const hasJS = Array.isArray(config.js) && config.js.length > 0;
    const hasCSS = Array.isArray(config.css) && config.css.length > 0;
    if (!hasJS && !hasCSS) {
      return false;
    }
    return true;
  }
}

const configManager = new ConfigManager();
const userScriptsRegistry = new Map();
const pendingRegistrations = new Set();

async function unregisterScriptsForConfig(configId) {
  if (typeof chrome === 'undefined' || !chrome.userScripts || !chrome.userScripts.unregister) {
    return;
  }
  const config = configManager.getConfig(configId);
  const ids = [];
  const keys = Array.from(userScriptsRegistry.keys());
  for (const key of keys) {
    if (key.startsWith(`${configId}:`)) {
      const id = userScriptsRegistry.get(key);
      if (id) ids.push(id);
      userScriptsRegistry.delete(key);
    }
  }
  if (config) {
    const baseIdSanitize = (s) => String(s).replace(/[^a-zA-Z0-9_]/g, '_');
    if (Array.isArray(config.js)) {
      for (const item of config.js) {
        const name = typeof item === 'string' ? item : item.path;
        const scriptId = `userweb_${configId}_${name}`.replace(/[^a-zA-Z0-9_]/g, '_');
        ids.push(scriptId);
      }
    }
  }
  if (ids.length) {
    await new Promise((resolve) => {
      chrome.userScripts.unregister({ ids }, () => {
        const err = chrome.runtime && chrome.runtime.lastError;
        if (err && /nonexistent script id/i.test(String(err.message))) {
          // Ignore missing IDs to avoid noisy console warnings
        }
        resolve();
      });
    });
  }
}

async function sendInjectToTab(tabId, config) {
  try {
    await new Promise((resolve, reject) => {
      browserAPI.tabs.sendMessage(tabId, { type: 'INJECT', config }, (response) => {
        if (browserAPI.runtime.lastError) {
          reject(new Error(browserAPI.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  } catch (_) {
    if (browserAPI.scripting) {
      await browserAPI.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      await new Promise((resolve) => {
        browserAPI.tabs.sendMessage(tabId, { type: 'INJECT', config }, () => resolve());
      });
    } else if (browserAPI.tabs && browserAPI.tabs.executeScript) {
      await new Promise((resolve) => {
        browserAPI.tabs.executeScript(tabId, { file: 'content.js' }, () => resolve());
      });
      await new Promise((resolve) => {
        browserAPI.tabs.sendMessage(tabId, { type: 'INJECT', config }, () => resolve());
      });
    }
  }
}

async function injectConfigIntoMatchingTabs(configId) {
  const config = configManager.getConfig(configId);
  if (!config || !config.enabled) return;
  const tabs = await new Promise((resolve) => {
    browserAPI.tabs.query({}, (t) => resolve(t || []));
  });
  for (const tab of tabs) {
    if (tab && tab.id && tab.url) {
      try {
        const urlObj = new URL(tab.url);
        if (configManager.matchesUrl(config, urlObj)) {
          await sendInjectToTab(tab.id, config);
        }
      } catch (_) { }
    }
  }
}

// Load configs on startup
configManager.loadAllConfigs().catch(err => {
  console.error('Error loading configs on startup:', err);
});

// Initialize extension
browserAPI.runtime.onInstalled.addListener(async () => {
  console.log('UserWeb extension installed');
  await configManager.loadAllConfigs();
});

// Also load on startup (for when extension is already installed)
browserAPI.runtime.onStartup.addListener(async () => {
  console.log('UserWeb extension started');
  await configManager.loadAllConfigs();
});

// Handle messages from content scripts and dashboard
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
        if (typeof chrome !== 'undefined' && chrome.userScripts && chrome.userScripts.unregister && ids.length) {
          await new Promise((resolve) => {
            chrome.userScripts.unregister({ ids }, () => {
              const err = chrome.runtime && chrome.runtime.lastError;
              if (err && /nonexistent script id/i.test(String(err.message))) {
                // Ignore missing IDs to avoid noisy console warnings
              }
              resolve();
            });
          });
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
    configManager.getConfigForUrl(message.url)
      .then(config => {
        sendResponse({ success: true, config });
      })
      .catch(error => {
        console.error('Error getting config for URL:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'INJECT_JS') {
    injectJSFile(message.configId, message.jsFileName, message.runAt || 'document_idle', message.tabId || sender.tab?.id).then(() => {
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
      browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          sendResponse({ success: true, tabId: tabs[0].id });
        } else {
          sendResponse({ success: false, error: 'Could not determine tab ID' });
        }
      });
      return true; // Async response
    }
  }
});

function normalizeRunAt(runAt) {
  const allowed = ['document_start', 'document_end', 'document_idle'];
  if (!runAt || typeof runAt !== 'string') {
    return 'document_idle';
  }
  if (allowed.indexOf(runAt) !== -1) {
    return runAt;
  }
  return 'document_idle';
}

async function injectJSFile(configId, jsFileName, runAt, tabId) {
  if (!tabId) {
    throw new Error('Tab ID is required for JS injection');
  }

  const storageKey = `userweb_files_${configId}`;
  const result = await browserAPI.storage.local.get(storageKey);
  const files = result[storageKey] || {};

  if (!files[jsFileName]) {
    throw new Error(`JS file not found: ${jsFileName}`);
  }

  const jsContent = files[jsFileName].split(',')[1];
  const decodedJS = atob(jsContent);

  const normalizedRunAt = normalizeRunAt(runAt);

  let injectImmediately = false;
  if (normalizedRunAt === 'document_start') {
    injectImmediately = true;
  }

  try {
    const userScriptsAPI = (typeof chrome !== 'undefined' && chrome.userScripts) || (typeof browser !== 'undefined' && browser.userScripts);
    if (userScriptsAPI && userScriptsAPI.register) {
      const config = configManager.getConfig(configId);
      if (!config || !config.matches || !config.matches.length) {
        throw new Error('Config not found for userScripts');
      }
      const scriptKey = `${configId}:${jsFileName}`;
      if (userScriptsRegistry.has(scriptKey) || pendingRegistrations.has(scriptKey)) return;
      pendingRegistrations.add(scriptKey);
      const scriptId = `userweb_${configId}_${jsFileName}`.replace(/[^a-zA-Z0-9_]/g, '_');
      const registered = await new Promise((resolve) => {
        userScriptsAPI.register([{
          id: scriptId,
          matches: config.matches,
          js: [{ code: decodedJS }],
          runAt: normalizedRunAt
        }], () => {
          const err = browserAPI.runtime.lastError;
          if (err && String(err.message).toLowerCase().includes('duplicate script id')) {
            resolve(true);
          } else if (err) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
      pendingRegistrations.delete(scriptKey);
      if (registered) {
        userScriptsRegistry.set(scriptKey, scriptId);
      } else {
        throw new Error('Failed to register userScript');
      }
      return;
    }

    if (browserAPI.scripting) {
      // Direct injection for browsers without userScripts API
      await browserAPI.scripting.executeScript({
        target: { tabId: tabId },
        func: (codeString) => {
          const scriptEl = document.createElement('script');
          scriptEl.textContent = codeString;
          (document.head || document.documentElement).appendChild(scriptEl);
          scriptEl.remove();
        },
        args: [decodedJS],
        world: 'ISOLATED',
        injectImmediately: injectImmediately
      });
    } else if (browserAPI.tabs && browserAPI.tabs.executeScript) {
      await new Promise((resolve, reject) => {
        browserAPI.tabs.executeScript(tabId, { code: decodedJS }, () => {
          if (browserAPI.runtime.lastError) {
            reject(new Error(browserAPI.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
    } else {
      throw new Error('Scripting API not available');
    }
  } catch (error) {
    console.error(`Error injecting JS via scripting API:`, error);
    throw error;
  }
}

// Watch for tab updates to inject scripts/styles
browserAPI.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const config = await configManager.getConfigForUrl(tab.url);
      if (config && config.enabled) {
        await sendInjectToTab(tabId, config);
      }
    } catch (error) {
      console.error('Error injecting scripts:', error);
    }
  }
});
