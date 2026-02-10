// Content script for UserSite extension
// Handles injection of CSS and JS files based on config

(function () {
  'use strict';

  // Store injected resources to prevent duplicates
  const injectedResources = new Map();

  // Message listener for injection requests
  browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'INJECT' && message.config) {
      return injectConfig(message.config, sender.tab?.id)
        .then(() => ({ success: true }))
        .catch((error) => ({ success: false, error: error.message }));
    }

    if (message.type === 'CLEANUP' && message.configId) {
      const elements = document.querySelectorAll(`[data-usersite-config="${message.configId}"]`);
      elements.forEach(el => el.remove());
      // Also clear from injectedResources map
      for (const [key, value] of injectedResources.entries()) {
        if (key.startsWith(`css-${message.configId}-`) || key.startsWith(`js-${message.configId}-`)) {
          injectedResources.delete(key);
        }
      }
      return Promise.resolve({ success: true });
    }
  });

  function isUrl(str) {
    try {
      const url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  async function injectCSS(configId, cssFileName, injectionPoint = 'head', cssCode = null) {
    const cacheKey = `css-${configId}-${cssFileName}`;
    if (injectedResources.has(cacheKey)) {
      return;
    }

    try {
      let decodedCSS = cssCode || '';

      if (!decodedCSS) {
        if (isUrl(cssFileName)) {
          const response = await browser.runtime.sendMessage({
              type: 'GET_CACHED_CONTENT',
              configId: configId,
              url: cssFileName
            });
          if (response && response.success && response.content) {
            decodedCSS = response.content;
          } else {
            console.error(`Cached CSS not found for URL: ${cssFileName}`);
            return;
          }
        } else {
          const storageKey = `usersite_files_${configId}`;
          const result = await browser.storage.local.get(storageKey);
          const files = result[storageKey] || {};

          if (!files[cssFileName]) {
            console.error(`CSS file not found: ${cssFileName}`);
            return;
          }

          const cssContent = files[cssFileName].split(',')[1];
          decodedCSS = atob(cssContent);
        }
      }

      const existing = document.querySelector(
        `style[data-usersite-config="${configId}"][data-usersite-css-file="${cssFileName}"]`
      );
      if (existing) {
        injectedResources.set(cacheKey, existing);
        return;
      }

      const styleEl = document.createElement('style');
      styleEl.type = 'text/css';
      styleEl.setAttribute('data-usersite-config', String(configId));
      styleEl.setAttribute('data-usersite-css-file', String(cssFileName));
      styleEl.textContent = decodedCSS;

      if (injectionPoint === 'head') {
        if (document.head) {
          document.head.appendChild(styleEl);
        } else {
          document.documentElement.appendChild(styleEl);
        }
      } else if (injectionPoint === 'body_start') {
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
      } else if (injectionPoint === 'body_end') {
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
  async function injectJS(configId, jsFileName, runAt = 'document_idle', tabId, jsCode) {
    const cacheKey = `js-${configId}-${jsFileName || 'inline'}`;
    if (injectedResources.has(cacheKey)) {
      return;
    }

    try {
      // Request background script to inject the JS using scripting API
      // This bypasses CSP because it's injected by the extension API
      const response = await new Promise((resolve, reject) => {
        browser.runtime.sendMessage({
          type: 'INJECT_JS',
          configId: configId,
          jsFileName: jsFileName,
          jsCode: jsCode,
          runAt: runAt,
          tabId: tabId
        }, (response) => {
          if (browser.runtime.lastError) {
            reject(new Error(browser.runtime.lastError.message));
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



  /**
   * Inject all resources from config
   */
  async function injectConfig(config, tabId) {
    if (!config || !config.enabled) return;

    // Get current tab ID for JS injection if not provided
    // Content scripts can't access tabs API directly, so request from background
    if (!tabId) {
      tabId = await new Promise((resolve) => {
        browser.runtime.sendMessage({ type: 'GET_TAB_ID' }, (response) => {
          if (browser.runtime.lastError) {
            console.error('Error getting tab ID:', browser.runtime.lastError);
            resolve(null);
          } else {
            resolve(response?.tabId || null);
          }
        });
      });
    }

    // Inject CSS files (CSS can be injected directly)
    if (config.css && Array.isArray(config.css)) {
      for (const [index, cssItem] of config.css.entries()) {
        const mergedItem = Object.assign({}, config.cssDefault || {}, typeof cssItem === 'object' ? cssItem : { file: cssItem });
        let cssFileName = mergedItem.file;
        const cssCode = mergedItem.code;
        const injectionPoint = mergedItem.injectAt || 'head';

        if (!cssFileName && cssCode) {
          cssFileName = `inline_${index}`;
        }

        if (cssFileName) {
          await injectCSS(config.id, cssFileName, injectionPoint, cssCode);
        }
      }
    }



    // Inject JS files (via background script to bypass CSP)
    if (config.js && Array.isArray(config.js) && tabId) {
      for (const jsItem of config.js) {
        const mergedItem = Object.assign({}, config.jsDefault || {}, typeof jsItem === 'object' ? jsItem : { file: jsItem });
        const jsFileName = mergedItem.file;
        const jsCode = mergedItem.code;
        const runAt = mergedItem.runAt || 'document_idle';

        await injectJS(config.id, jsFileName, runAt, tabId, jsCode);
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
        browser.runtime.sendMessage({ type: 'GET_TAB_ID' }, (response) => {
          if (browser.runtime.lastError) {
            resolve(null);
          } else {
            resolve(response);
          }
        });
      });

      const tabId = tabIdResponse?.tabId || null;

      // Get config for current URL
      const configResponse = await new Promise((resolve) => {
        browser.runtime.sendMessage({
          type: 'GET_CONFIG',
          url: window.location.href
        }, (response) => {
          if (browser.runtime.lastError) {
            resolve(null);
          } else {
            resolve(response);
          }
        });
      });

      if (configResponse && configResponse.success && configResponse.config) {
        const config = configResponse.config;
        if (config.matches) {
          await injectConfig(config, tabId);
        }
      }
    } catch (error) {
      console.error('Error in requestConfig:', error);
    }
  }
})();
