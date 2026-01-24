// Content script for UserWeb extension
// Handles injection of CSS and JS files based on config

(function() {
  'use strict';
  
  // Browser API compatibility (chrome/browser)
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  // Store injected resources to prevent duplicates
  const injectedResources = new Map();

  // Message listener for injection requests
  browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'INJECT' && message.config) {
      injectConfig(message.config, sender.tab?.id).then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep channel open for async response
    }
    return false;
  });

  async function injectCSS(configId, cssFileName, injectionPoint = 'head') {
    const cacheKey = `css-${configId}-${cssFileName}`;
    if (injectedResources.has(cacheKey)) {
      return;
    }

    try {
      const storageKey = `userweb_files_${configId}`;
      const result = await browserAPI.storage.local.get(storageKey);
      const files = result[storageKey] || {};
      
      if (!files[cssFileName]) {
        console.error(`CSS file not found: ${cssFileName}`);
        return;
      }

      const existing = document.querySelector(
        `style[data-userweb-config="${configId}"][data-userweb-css-file="${cssFileName}"]`
      );
      if (existing) {
        injectedResources.set(cacheKey, existing);
        return;
      }

      const cssContent = files[cssFileName].split(',')[1];
      const decodedCSS = atob(cssContent);

      const styleEl = document.createElement('style');
      styleEl.type = 'text/css';
      styleEl.setAttribute('data-userweb-config', String(configId));
      styleEl.setAttribute('data-userweb-css-file', String(cssFileName));
      styleEl.textContent = decodedCSS;

      if (injectionPoint === 'head') {
        if (document.head) {
          document.head.appendChild(styleEl);
        } else {
          document.documentElement.appendChild(styleEl);
        }
      } else if (injectionPoint === 'body-start') {
        if (document.body) {
          document.body.insertBefore(styleEl, document.body.firstChild);
        } else {
          const observer = new MutationObserver(() => {
            if (document.body) {
              document.body.insertBefore(styleEl, document.body.firstChild);
              observer.disconnect();
            }
          });
          observer.observe(document.documentElement, { childList: true });
        }
      } else if (injectionPoint === 'body-end') {
        if (document.body) {
          document.body.appendChild(styleEl);
        } else {
          const observer = new MutationObserver(() => {
            if (document.body) {
              document.body.appendChild(styleEl);
              observer.disconnect();
            }
          });
          observer.observe(document.documentElement, { childList: true });
        }
      }

      injectedResources.set(cacheKey, styleEl);
    } catch (error) {
      console.error(`Error injecting CSS ${cssFileName}:`, error);
    }
  }

  /**
   * Inject JS file from storage
   * Note: For CSP compliance, JS injection is handled by background script
   * This function just requests the injection
   */
  async function injectJS(configId, jsFileName, runAt = 'document_idle', tabId) {
    const cacheKey = `js-${configId}-${jsFileName}`;
    if (injectedResources.has(cacheKey)) {
      return;
    }

    try {
      // Request background script to inject the JS using scripting API
      // This bypasses CSP because it's injected by the extension API
      const response = await new Promise((resolve, reject) => {
        browserAPI.runtime.sendMessage({
          type: 'INJECT_JS',
          configId: configId,
          jsFileName: jsFileName,
          runAt: runAt,
          tabId: tabId
        }, (response) => {
          if (browserAPI.runtime.lastError) {
            reject(new Error(browserAPI.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });

      if (response && response.success) {
        injectedResources.set(cacheKey, true);
      }
    } catch (error) {
      console.error(`Error injecting JS ${jsFileName}:`, error);
    }
  }

  async function injectJQuery(configId, version, runAt = 'document_start', tabId) {
    const cacheKey = `jquery-${version}`;
    if (injectedResources.has(cacheKey)) {
      return;
    }
    try {
      const response = await new Promise((resolve, reject) => {
        browserAPI.runtime.sendMessage({
          type: 'INJECT_JQUERY',
          configId: configId,
          version: version,
          runAt: runAt,
          tabId: tabId
        }, (response) => {
          if (browserAPI.runtime.lastError) {
            reject(new Error(browserAPI.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      if (response && response.success) {
        injectedResources.set(cacheKey, true);
      }
    } catch (error) {
      console.error(`Error injecting jQuery ${version}:`, error);
    }
  }

  /**
   * Inject all resources from config
   */
  async function injectConfig(config, tabId) {
    if (!config || !config.enabled) return;

    // Get current tab ID for JS injection if not provided
    // Content scripts can't access tabs API directly, so request from background
    if (!tabId) {
      tabId = await new Promise((resolve) => {
        browserAPI.runtime.sendMessage({ type: 'GET_TAB_ID' }, (response) => {
          if (browserAPI.runtime.lastError) {
            console.error('Error getting tab ID:', browserAPI.runtime.lastError);
            resolve(null);
          } else {
            resolve(response?.tabId || null);
          }
        });
      });
    }

    // Inject CSS files (CSS can be injected directly)
    if (config.css && Array.isArray(config.css)) {
      for (const cssItem of config.css) {
        const cssFileName = typeof cssItem === 'string' ? cssItem : cssItem.path;
        const injectionPoint = typeof cssItem === 'object' && cssItem.inject 
          ? cssItem.inject 
          : 'head';
        
        await injectCSS(config.id, cssFileName, injectionPoint);
      }
    }

    // jQuery (optional): version string
    if (tabId && typeof config.jquery === 'string') {
      await injectJQuery(config.id, config.jquery, 'document_start', tabId);
    }

    // Inject JS files (via background script to bypass CSP)
    if (config.js && Array.isArray(config.js) && tabId) {
      for (const jsItem of config.js) {
        const jsFileName = typeof jsItem === 'string' ? jsItem : jsItem.path;
        const runAt = typeof jsItem === 'object' && jsItem.runAt 
          ? jsItem.runAt 
          : 'document_idle';
        
        await injectJS(config.id, jsFileName, runAt, tabId);
      }
    }
  }

  // Auto-inject on page load if config exists
  // This is a fallback if background script injection didn't work
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      requestConfig();
    });
  } else {
    requestConfig();
  }

  async function requestConfig() {
    try {
      // Get tab ID first
      const tabIdResponse = await new Promise((resolve) => {
        browserAPI.runtime.sendMessage({ type: 'GET_TAB_ID' }, (response) => {
          if (browserAPI.runtime.lastError) {
            resolve(null);
          } else {
            resolve(response);
          }
        });
      });

      const tabId = tabIdResponse?.tabId || null;

      // Get config for current URL
      const configResponse = await new Promise((resolve) => {
        browserAPI.runtime.sendMessage({
          type: 'GET_CONFIG',
          url: window.location.href
        }, (response) => {
          if (browserAPI.runtime.lastError) {
            resolve(null);
          } else {
            resolve(response);
          }
        });
      });

      if (configResponse && configResponse.success && configResponse.config) {
        await injectConfig(configResponse.config, tabId);
      }
    } catch (error) {
      console.error('Error in requestConfig:', error);
    }
  }
})();
