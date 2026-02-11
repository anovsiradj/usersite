/* 
 * @link https://extensionworkshop.com/documentation/develop/browser-compatibility/
 */

if (globalThis.chrome) {
    globalThis.isChrome ??= true;
}

globalThis.browser ??= chrome;
globalThis.chrome ??= browser;

globalThis.isFirefox ??= !globalThis.isChrome;

// Polyfill for browser.runtime.getBrowserInfo() if not available (e.g., in Chrome)
if (browser && browser.runtime && !browser.runtime.getBrowserInfo) {
    browser.runtime.getBrowserInfo = async function () {
        let name = null;
        let version = null;

        // Try modern User-Agent Client Hints API first
        let infos = navigator?.userAgentData?.brands || [];
        if (Array.isArray(infos)) {
            let info = infos[infos.length - 1];
            if (info) {
                name = info.brand;
                version = info.version;
            }
        }

        name ??= navigator.userAgent;
        version ??= navigator.userAgent;

        return {
            name,
            version,
        };
    };
}
