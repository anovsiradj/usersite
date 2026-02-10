# compatibility

after some consideration with trial and error, 
the manifest must be split into two versions:
- `manifest.json` for Google Chrome  
- `firefox-manifest.json` for Mozilla Firefox

> **Note**: Beginning in Chrome 144, all Chrome Extension APIs are also available under the `browser` namespace.

# google chrome references

(manifest.json) https://developer.chrome.com/docs/extensions/reference/manifest

(browser) https://developer.chrome.com/docs/extensions/reference/api

(browser.userScripts) https://developer.chrome.com/docs/extensions/reference/api/userScripts

# mozilla firefox references

(manifest.json) https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json

(browser) https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API

(browser.userScripts) https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts