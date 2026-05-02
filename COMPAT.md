# compatibility

after some consideration with trial and error, 
the manifest must be split into two versions:
- `manifest.json` for Google Chrome  
- `firefox-manifest.json` for Mozilla Firefox

to be able to use in firefox,
you must run `deno task firefox-web-ext`.
it will create a dedicated folder for the firefox extension in `./firefox-web-ext`.
from the firefox extension page you have to load `manifest.json` from within that folder.

> **Note**: `firefox-manifest.json` references `browser.js` (flat path) while `manifest.json` uses `js/browser.js`.
> This is intentional — `deno task firefox-web-ext` copies files flat into `./firefox-web-ext/`.

> **Note**: Beginning in Chrome 144, all Chrome Extension APIs are also available under the `browser` namespace.

- **Firefox**: 109.0 or later (Manifest V3)
- **Chrome (including its variants)**: 88 or later (Manifest V3)

# google chrome references

(manifest.json) https://developer.chrome.com/docs/extensions/reference/manifest

(browser) https://developer.chrome.com/docs/extensions/reference/api

(browser.userScripts) https://developer.chrome.com/docs/extensions/reference/api/userScripts

# mozilla firefox references

(manifest.json) https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json

(browser) https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API

(browser.userScripts) https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts