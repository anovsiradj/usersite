/**
 * @link https://extensionworkshop.com/documentation/develop/browser-compatibility/
 */

globalThis.isChrome = typeof globalThis.chrome !== 'undefined';
globalThis.isFirefox = !globalThis.isChrome;

globalThis.browser ??= globalThis.chrome;

console.debug('[isChrome]', isChrome, '[isFirefox]', isFirefox)

if (browser && browser.runtime && !browser.runtime.getBrowserInfo) {
    console.info('polyfill for chrome: browser.runtime.getBrowserInfo()')

    browser.runtime.getBrowserInfo = async function () {
        let name = null;
        let version = null;

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
