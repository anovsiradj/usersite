// Content script for UserSite extension
// Handles injection of CSS and JS files based on config

(function () {
  'use strict';

  // === CSS Injection Path (injectCSSResources) ===
  // Receives INJECT message from background.js → injectConfig() → injectCSS()
  // Creates <style data-usersite-config="{configId}" data-usersite-css-file="{file}"> in DOM
  // Cleanup: CLEANUP message → removes all [data-usersite-config="{configId}"] elements
  //
  // JS Injection Path (registerJSResources) — managed in background.js
  // background.js registers scripts via browser.userScripts API (document_start, MAIN world)
  // content.js does NOT handle JS injection directly

  // Store injected resources to prevent duplicates
  const injectedResources = new Map();

  // Message listener for injection requests
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'INJECT' && message.config) {
      return injectConfig(message.config)
        .then(() => ({ success: true }))
        .catch((error) => ({ success: false, error: error.message }));
    }

    if (message.type === 'CLEANUP' && message.configId) {
      const elements = document.querySelectorAll(`[data-usersite-config="${message.configId}"]`);
      elements.forEach(el => el.remove());
      // Clear CSS entries from the injected resources map
      for (const key of injectedResources.keys()) {
        if (key.startsWith(`css-${message.configId}-`)) {
          injectedResources.delete(key);
        }
      }
      return Promise.resolve({ success: true });
    }
  });

  async function injectCSS(configId, cssFileName, injectionPoint = 'head', cssCode = null) {
    const cacheKey = `css-${configId}-${cssFileName}`;
    if (injectedResources.has(cacheKey)) {
      return;
    }

    try {
      let decodedCSS = cssCode || '';

      if (!decodedCSS) {
        if (isFileHttp(cssFileName)) {
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
      styleEl.setAttribute('data-usersite-config', String(configId));
      styleEl.setAttribute('data-usersite-css-file', String(cssFileName));
      styleEl.textContent = decodedCSS;

      if (injectionPoint === 'head') {
        if (document.head) {
          document.head.appendChild(styleEl);
        } else {
          console.warn('Document head not available, appending to documentElement');
          document.documentElement.appendChild(styleEl);
        }
      } else if (injectionPoint === 'body_start') {
        if (document.body) {
          document.body.insertBefore(styleEl, document.body.firstChild);
        } else {
          console.warn('Document body not available, waiting for DOMContentLoaded');
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
          console.warn('Document body not available, waiting for DOMContentLoaded');
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

  // Inject CSS resources from config into the current page
  async function injectConfig(config) {
    if (!config || !config.enabled) return;
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
  }

  // Retry helper for sendMessage with exponential backoff
  // attempt 1: immediate, attempt 2: wait 200ms, attempt 3: wait 400ms
  async function sendWithRetry(message, maxAttempts = 3, baseDelayMs = 200) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await browser.runtime.sendMessage(message);
      } catch (error) {
        if (attempt < maxAttempts) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, delay));
        } else {
          throw error;
        }
      }
    }
  }

  // Auto-initialize: Request matching configs from background on load
  async function init() {
    try {
      const response = await sendWithRetry({ type: 'GET_CONFIGS' });
      if (response && response.success && Array.isArray(response.configs)) {
        const currentUrl = window.location.href;
        
        // Match patterns helper (simplified glob-to-regex)
        const matchesPattern = (url, pattern) => {
          try {
            const regex = new RegExp('^' + pattern.split('*').map(s => s.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
            return regex.test(url);
          } catch (e) {
            return false;
          }
        };

        for (const config of response.configs) {
          if (!config.enabled || !config.matches) continue;
          
          const patterns = Array.isArray(config.matches) ? config.matches : [config.matches];
          const isMatch = patterns.some(pattern => matchesPattern(currentUrl, pattern));
          
          if (isMatch) {
            await injectConfig(config);
          }
        }
      }
    } catch (error) {
      console.error('[UserSite] Initialization error after retries:', error);
    }
  }

  // Run initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
