# Bugfix Requirements Document

## Introduction

UserSite is a Chrome/Firefox MV3 browser extension that injects custom JS and CSS into websites via user-defined `config.json` folders. This document captures requirements for fixing a cluster of reliability and correctness bugs affecting script injection, config state management, URL matching, and error visibility. The bugs collectively cause scripts to be injected multiple times, missed on first page load, lost after service worker restarts, and silently fail without any diagnostic output. The fix must restore reliable injection behavior on Chrome while not regressing Firefox support.

---

## Bug Analysis

### Current Behavior (Defect)

**Bug 1 – JS injected multiple times**

1.1 WHEN `registerScriptsForConfig` is called and a prior `unregister` call fails silently THEN the system registers a duplicate userScript with the same ID, causing the script to execute more than once on matching pages.

1.2 WHEN the MV3 service worker restarts THEN the system loses the in-memory `userScriptsRegistry` map, so subsequent calls to `RELOAD_CONFIGS` attempt to unregister IDs that are no longer tracked, leaving stale scripts registered in the browser engine.

**Bug 2 – Config not synced/updated after reload**

1.3 WHEN the service worker restarts after a toggle or reload THEN the system starts with an empty `userScriptsRegistry`, causing the `RELOAD_CONFIGS` handler to skip unregistering previously registered scripts.

1.4 WHEN `injectConfigIntoMatchingTabs` sends an `INJECT` message to a tab THEN the system may inject CSS a second time because `content.js` `init()` already ran and injected from the same config, resulting in duplicate `<style>` elements.

**Bug 3 – JS not injected on first load**

1.5 WHEN `content.js` `init()` sends a `GET_CONFIGS` message and the MV3 service worker is still waking up THEN the system silently drops the message, the catch block only logs the error, and no CSS or JS is injected for that page load.

**Bug 4 – Broken regex in `content.js` `init()`**

1.6 WHEN `content.js` `init()` evaluates the `matchesPattern` function THEN the system uses a corrupted regex escape string (`\\48fd4596-79af-4057-a6b2-8d729aecc062` — a UUID placeholder instead of `\\$&`) causing all URL pattern matching to produce incorrect results and configs to never match any URL.

**Bug 5 – `enabled` defaults to `false`**

1.7 WHEN a new config is added via `configManager.addConfig()` and the `config.json` does not contain an explicit `"enabled": true` field THEN the system saves the config with `enabled = false` due to `config.enabled ?? false`, so the config is immediately disabled and no injection occurs.

**Bug 6 – Silent exception swallowing**

1.8 WHEN any `try/catch` block in `background.js`, `content.js`, or `dashboard.js` catches a runtime error THEN the system only calls `console.error(...)` or silently ignores the error, providing no structured error propagation and no visibility in the dashboard.

**Bug 7 – CSS/JS injection asymmetry**

1.9 WHEN CSS injection is performed THEN the system uses DOM manipulation in `content.js`, while JS injection uses the `userScripts` API in `background.js`, with no consistent naming, timing guarantees, or cleanup parity between the two paths, making the combined injection behavior unpredictable and hard to reason about.

---

### Expected Behavior (Correct)

**Bug 1 – JS injected multiple times**

2.1 WHEN `registerScriptsForConfig` is called THEN the system SHALL query the browser engine for existing scripts by ID prefix and unregister them before registering new ones, ensuring no duplicate script IDs exist in the engine regardless of in-memory state.

2.2 WHEN the MV3 service worker restarts THEN the system SHALL re-derive the set of registered script IDs from persistent storage (config data) rather than relying on the in-memory `userScriptsRegistry` map, so cleanup is always accurate.

**Bug 2 – Config not synced/updated after reload**

2.3 WHEN `RELOAD_CONFIGS` is handled THEN the system SHALL query the browser engine directly for all `usersite_`-prefixed scripts and unregister them before re-registering, independent of the in-memory registry.

2.4 WHEN `injectConfigIntoMatchingTabs` sends an `INJECT` message THEN the system SHALL include a version or generation token so `content.js` can detect and skip re-injection of already-applied resources, preventing duplicate `<style>` elements.

**Bug 3 – JS not injected on first load**

2.5 WHEN `content.js` `init()` fails to reach the service worker on the first attempt THEN the system SHALL retry the `GET_CONFIGS` message with exponential backoff (at least 2 retries) before giving up, ensuring injection succeeds once the service worker is awake.

**Bug 4 – Broken regex in `content.js` `init()`**

2.6 WHEN `content.js` `init()` evaluates the `matchesPattern` function THEN the system SHALL use the correct regex escape replacement (`\\$&` or equivalent) so that URL pattern matching correctly identifies matching configs for the current page URL.

**Bug 5 – `enabled` defaults to `false`**

2.7 WHEN a new config is added via `configManager.addConfig()` and the `config.json` does not contain an explicit `"enabled"` field THEN the system SHALL default `config.enabled` to `true`, so newly added configs are active immediately without requiring manual enabling.

**Bug 6 – Silent exception swallowing**

2.8 WHEN any `try/catch` block catches a runtime error THEN the system SHALL propagate the error to the caller or surface it in the dashboard UI, ensuring no error is silently swallowed and all failures are visible to the user.

**Bug 7 – CSS/JS injection asymmetry**

2.9 WHEN CSS or JS injection is performed THEN the system SHALL use clearly named, consistently structured injection paths for both resource types, with equivalent cleanup behavior, so the injection lifecycle is predictable and maintainable.

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a config with `"enabled": true` is added and the page URL matches `config.matches` THEN the system SHALL CONTINUE TO inject the configured CSS into the page via DOM `<style>` elements.

3.2 WHEN a config with `"enabled": true` is added and the page URL matches `config.matches` THEN the system SHALL CONTINUE TO register the configured JS files via the `userScripts` API so they execute on matching pages.

3.3 WHEN a config is toggled to disabled THEN the system SHALL CONTINUE TO unregister its userScripts from the browser engine and send a `CLEANUP` message to matching tabs to remove injected CSS elements.

3.4 WHEN a config is deleted THEN the system SHALL CONTINUE TO unregister its userScripts and remove injected CSS from matching tabs.

3.5 WHEN the extension is installed or the service worker starts THEN the system SHALL CONTINUE TO load all configs from storage and register scripts for all enabled configs.

3.6 WHEN running in Firefox THEN the system SHALL CONTINUE TO use the Firefox-compatible `userScripts` registration path via `api-adapter.js` without regression.

3.7 WHEN a config references a remote (HTTP/HTTPS) JS file THEN the system SHALL CONTINUE TO serve it from the OPFS cache managed by `CacheManager`.

3.8 WHEN a config references a local JS or CSS file THEN the system SHALL CONTINUE TO read it from `browser.storage.local` using the `usersite_files_{configId}` key.

3.9 WHEN the dashboard loads THEN the system SHALL CONTINUE TO display all saved configs with their enabled state, matches, and source files.

3.10 WHEN `content.js` receives a `CLEANUP` message for a config THEN the system SHALL CONTINUE TO remove all `<style>` elements tagged with `data-usersite-config` for that config ID.

---

## Bug Condition Summary (Pseudocode)

### Bug 4 – Broken Regex (Primary Fix Condition)

```pascal
FUNCTION isBugCondition_regex(X)
  INPUT: X of type { url: string, pattern: string }
  OUTPUT: boolean

  // Bug is triggered whenever matchesPattern is called — the regex is always broken
  RETURN true  // The corruption is unconditional; every call is affected
END FUNCTION

// Property: Fix Checking
FOR ALL X WHERE isBugCondition_regex(X) DO
  result ← matchesPattern'(X.url, X.pattern)
  ASSERT result = correctGlobMatch(X.url, X.pattern)
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition_regex(X) DO
  // No non-buggy inputs exist for this bug (all calls are affected)
  // Preservation is satisfied by the fix itself
END FOR
```

### Bug 5 – Enabled Default

```pascal
FUNCTION isBugCondition_enabled(X)
  INPUT: X of type ConfigObject
  OUTPUT: boolean

  RETURN X.enabled = undefined OR X.enabled = null
END FUNCTION

// Property: Fix Checking
FOR ALL X WHERE isBugCondition_enabled(X) DO
  result ← addConfig'(X)
  ASSERT result.enabled = true
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition_enabled(X) DO
  ASSERT addConfig'(X).enabled = addConfig(X).enabled
END FOR
```

### Bug 1 – Duplicate Registration

```pascal
FUNCTION isBugCondition_duplicate(X)
  INPUT: X of type { configId: string, registryState: 'empty' | 'populated' }
  OUTPUT: boolean

  // Bug triggers when registry is empty (after SW restart) but scripts exist in engine
  RETURN X.registryState = 'empty'
END FUNCTION

// Property: Fix Checking
FOR ALL X WHERE isBugCondition_duplicate(X) DO
  result ← registerScriptsForConfig'(X.configId)
  ASSERT countEngineScripts(X.configId) = expectedScriptCount(X.configId)
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition_duplicate(X) DO
  ASSERT F(X) = F'(X)  // Registration behavior unchanged when registry is accurate
END FOR
```
