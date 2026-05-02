# UserSite Bugfix Design

## Overview

This document covers the design for fixing seven reliability and correctness bugs in the UserSite browser extension. The bugs affect URL pattern matching, config defaults, script registration deduplication, service worker wakeup races, config reload state, error visibility, and injection path consistency.

Fixes are ordered by priority: Bug 4 (broken regex) → Bug 5 (enabled default) → Bug 1 (duplicate registration) → Bug 3 (first-load race) → Bug 2 (reload sync) → Bug 6 (silent errors) → Bug 7 (injection asymmetry).

All fixes target Chrome MV3 as primary. Firefox compatibility via `api-adapter.js` must not regress.

---

## Glossary

- **Bug_Condition (C)**: The condition that identifies inputs or states that trigger a specific bug.
- **Property (P)**: The desired correct behavior when the bug condition holds.
- **Preservation**: Existing correct behaviors that must remain unchanged after the fix.
- **matchesPattern**: The glob-to-regex URL matching function in `content.js` `init()`.
- **userScriptsRegistry**: The in-memory `Map` in `background.js` tracking registered script IDs; lost on service worker restart.
- **SW**: Service Worker — the MV3 background script (`background.js`), which can be terminated and restarted by the browser at any time.
- **engine scripts**: Scripts registered in the browser's `userScripts` API, which persist across SW restarts independently of the in-memory registry.
- **configId**: The sanitized string ID derived from `config.name` via `toId()`, used as the key for storage and script ID prefixes.
- **usersite_ prefix**: The prefix used for all `userScripts` IDs: `usersite_{configId}_{itemId}`.
- **OPFS**: Origin Private File System — used by `CacheManager` to cache remote CDN assets.

---

## Bug Details

### Bug 4 – Broken Regex in `matchesPattern`

#### Bug Condition

The `matchesPattern` function in `content.js` `init()` constructs a regex by splitting on `*` and escaping the literal parts. The escape replacement string is a UUID placeholder (`\98dfecf7-a1fd-49c2-b66d-9e9cfd6078c2` or similar) instead of the correct regex escape string (`\\$&` or equivalent). This means every call to `matchesPattern` produces a broken regex, and no config ever matches any URL.

**Formal Specification:**
```
FUNCTION isBugCondition_regex(X)
  INPUT: X of type { url: string, pattern: string }
  OUTPUT: boolean

  // The corruption is unconditional — every call is affected
  RETURN true
END FUNCTION
```

**Examples:**
- `matchesPattern("https://example.com/page", "https://example.com/*")` → `false` (should be `true`)
- `matchesPattern("https://foo.bar/baz", "*://foo.bar/*")` → `false` (should be `true`)
- `matchesPattern("https://other.com", "https://example.com/*")` → `false` (correctly `false`, but for wrong reasons)

---

### Bug 5 – `enabled` Defaults to `false`

#### Bug Condition

In `lib/config-manager.js`, `addConfig()` sets `config.enabled = config.enabled ?? false`. When a `config.json` omits the `"enabled"` field (the common case), the config is saved as disabled.

**Formal Specification:**
```
FUNCTION isBugCondition_enabled(X)
  INPUT: X of type ConfigObject
  OUTPUT: boolean

  RETURN X.enabled = undefined OR X.enabled = null
END FUNCTION
```

**Examples:**
- `addConfig("mysite", { name: "mysite", matches: ["*://example.com/*"], js: ["script.js"] })` → `enabled: false` (should be `true`)
- `addConfig("mysite", { name: "mysite", enabled: true, ... })` → `enabled: true` (correct, preserved)
- `addConfig("mysite", { name: "mysite", enabled: false, ... })` → `enabled: false` (correct, preserved)

---

### Bug 1 – JS Injected Multiple Times (Duplicate Registration)

#### Bug Condition

`registerScriptsForConfig` in `background.js` calls `UserScripts.register()` which proactively unregisters by ID before re-registering. However, after a SW restart, `userScriptsRegistry` is empty, so `unregisterScriptsForConfig` finds no keys to remove from the in-memory map. The engine-side query path in `unregisterScriptsForConfig` does exist but is only called explicitly — `registerScriptsForConfig` itself does not call `unregisterScriptsForConfig` first. The `UserScripts.register()` in `api-adapter.js` does call `unregister` before `register` for Chrome, but only for the IDs in the current batch. If a config previously had 3 scripts and now has 2, the third stale script remains registered.

**Formal Specification:**
```
FUNCTION isBugCondition_duplicate(X)
  INPUT: X of type { configId: string, previousScriptCount: int, currentScriptCount: int }
  OUTPUT: boolean

  // Bug triggers when stale scripts from a prior registration remain in the engine
  RETURN previousScriptCount > currentScriptCount
         OR registryIsEmpty AND engineHasScriptsForConfig(X.configId)
END FUNCTION
```

**Examples:**
- Config had 3 JS files, now has 2 after rescan → 3rd script still fires on matching pages
- SW restarts, `RELOAD_CONFIGS` is triggered → old scripts not cleaned up, new ones added on top

---

### Bug 3 – JS Not Injected on First Load (SW Wakeup Race)

#### Bug Condition

`content.js` `init()` sends `GET_CONFIGS` immediately. If the SW is still waking up, the message fails with a connection error. The catch block logs the error and stops — no retry occurs.

**Formal Specification:**
```
FUNCTION isBugCondition_swRace(X)
  INPUT: X of type { swState: 'waking' | 'awake', attempt: int }
  OUTPUT: boolean

  RETURN X.swState = 'waking' AND X.attempt = 1
END FUNCTION
```

**Examples:**
- Page loads immediately after browser start → SW waking → `GET_CONFIGS` fails → no injection
- Page loads after SW has been idle for 30s → SW waking → same failure
- Page loads while SW is active → succeeds on first attempt (preserved)

---

### Bug 2 – Config Not Synced After Reload

#### Bug Condition

The `RELOAD_CONFIGS` handler in `background.js` unregisters scripts using `Array.from(userScriptsRegistry.values())`. After a SW restart, this map is empty, so no scripts are unregistered before re-registration. Stale engine scripts from the previous SW lifetime persist.

**Formal Specification:**
```
FUNCTION isBugCondition_reload(X)
  INPUT: X of type { registrySize: int, engineScriptCount: int }
  OUTPUT: boolean

  RETURN X.registrySize = 0 AND X.engineScriptCount > 0
END FUNCTION
```

---

### Bug 6 – Silent Exception Swallowing

#### Bug Condition

Every `try/catch` in `background.js`, `content.js`, and `dashboard.js` calls `console.error()` or silently ignores the error. No structured error is propagated to callers or surfaced in the dashboard UI.

**Formal Specification:**
```
FUNCTION isBugCondition_silent(X)
  INPUT: X of type RuntimeError
  OUTPUT: boolean

  RETURN X is caught AND NOT propagated AND NOT visible in dashboard
END FUNCTION
```

---

### Bug 7 – CSS/JS Injection Asymmetry

#### Bug Condition

CSS injection uses DOM `<style>` elements managed in `content.js`. JS injection uses the `userScripts` API managed in `background.js`. The two paths have different naming conventions, different cleanup triggers, and no shared lifecycle documentation. This makes the combined behavior hard to reason about and maintain.

**Formal Specification:**
```
FUNCTION isBugCondition_asymmetry(X)
  INPUT: X of type InjectionOperation
  OUTPUT: boolean

  RETURN X.type = 'cleanup'
         AND (cssCleanupPath(X) != jsCleanupPath(X) in structure or naming)
END FUNCTION
```

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Configs with `"enabled": true` in `config.json` must continue to inject CSS via DOM `<style>` elements on matching pages.
- Configs with `"enabled": true` must continue to register JS via the `userScripts` API.
- Toggling a config to disabled must continue to unregister its userScripts and send `CLEANUP` to matching tabs.
- Deleting a config must continue to unregister its userScripts and remove injected CSS.
- On extension install/startup, all enabled configs must continue to be loaded from storage and registered.
- Firefox must continue to use the Firefox-compatible registration path in `api-adapter.js`.
- Remote JS/CSS files must continue to be served from OPFS cache via `CacheManager`.
- Local JS/CSS files must continue to be read from `browser.storage.local`.
- The dashboard must continue to display all configs with enabled state, matches, and source files.
- `CLEANUP` messages must continue to remove all `<style>` elements tagged with `data-usersite-config`.

**Scope:**
All inputs that do NOT involve the specific bug conditions above must be completely unaffected. This includes:
- Configs with explicit `"enabled": true` or `"enabled": false` in `config.json`
- URL patterns that already matched correctly (none, since Bug 4 broke all matching — but the fix must not break patterns that were intentionally non-matching)
- Script registration when the SW is already awake and the registry is populated
- Dashboard interactions unrelated to error display

---

## Hypothesized Root Causes

### Bug 4 – Broken Regex
The `matchesPattern` function was written with a template placeholder for the regex escape string. The placeholder (`\98dfecf7-...` or similar UUID) was never replaced with the actual escape logic. The correct approach is to escape regex special characters in each glob segment using `.replace(/[.+^${}()|[\]\\]/g, '\\$&')`.

### Bug 5 – Enabled Default
The nullish coalescing operator `?? false` was used instead of `?? true`. A one-character fix.

### Bug 1 – Duplicate Registration
`registerScriptsForConfig` does not call `unregisterScriptsForConfig` before registering. It relies on `UserScripts.register()` in `api-adapter.js` to unregister the exact IDs in the current batch, but this misses stale scripts from prior registrations with different IDs (e.g., after a rescan that changes file names). The fix is to always call `unregisterScriptsForConfig(configId)` at the top of `registerScriptsForConfig`.

### Bug 3 – SW Wakeup Race
`content.js` `init()` makes a single attempt with no retry. MV3 service workers can take 100–500ms to wake up. The fix is exponential backoff retry (e.g., 3 attempts: 0ms, 200ms, 600ms). This must not block `document_start` timing — the retry loop should be async and non-blocking.

### Bug 2 – Reload Sync
`RELOAD_CONFIGS` uses `userScriptsRegistry` (in-memory, lost on SW restart) instead of querying the engine. The fix is to use `browser.userScripts.getScripts()` to enumerate all `usersite_`-prefixed scripts and unregister them, mirroring what `unregisterScriptsForConfig` already does per-config.

### Bug 6 – Silent Errors
No structured logging layer exists. The fix is a minimal `lib/logger.js` module that wraps `console.error` and appends entries to an in-memory ring buffer (capped at ~50 entries), plus a small log panel in the dashboard that reads from this buffer via a `GET_LOGS` message. Errors in `background.js` write to the logger; the dashboard polls or requests on load.

### Bug 7 – CSS/JS Injection Asymmetry
The two paths evolved independently. The fix is documentation and naming clarity: rename the CSS injection path in comments to `injectCSSResources` and the JS path to `registerJSResources`, add a shared lifecycle comment block explaining the two paths, and verify cleanup parity (both paths clean up on `CLEANUP`/`DELETE`/`TOGGLE_OFF`).

---

## Correctness Properties

Property 1: Bug Condition – matchesPattern Produces Correct Results

_For any_ `(url, pattern)` pair where `isBugCondition_regex` holds (i.e., always, since all calls are affected), the fixed `matchesPattern` function SHALL return `true` if and only if the URL matches the glob pattern using standard `*` wildcard semantics, and `false` otherwise.

**Validates: Requirements 2.6**

Property 2: Preservation – matchesPattern Non-Matching URLs Still Return False

_For any_ `(url, pattern)` pair where the URL does NOT match the glob pattern, the fixed `matchesPattern` function SHALL return `false`, preserving correct rejection behavior.

**Validates: Requirements 3.1, 3.2**

Property 3: Bug Condition – addConfig Defaults enabled to true

_For any_ config object where `isBugCondition_enabled` holds (enabled is undefined or null), the fixed `addConfig` function SHALL save the config with `enabled = true`.

**Validates: Requirements 2.7**

Property 4: Preservation – addConfig Respects Explicit enabled Values

_For any_ config object where `isBugCondition_enabled` does NOT hold (enabled is explicitly `true` or `false`), the fixed `addConfig` function SHALL preserve the explicit value unchanged.

**Validates: Requirements 3.1, 3.2, 3.3**

Property 5: Bug Condition – registerScriptsForConfig Produces No Duplicates

_For any_ `configId` where `isBugCondition_duplicate` holds (stale engine scripts exist), the fixed `registerScriptsForConfig` function SHALL result in exactly the expected number of engine scripts for that config — no more, no less.

**Validates: Requirements 2.1, 2.2**

Property 6: Preservation – registerScriptsForConfig Unchanged When Registry Is Accurate

_For any_ `configId` where `isBugCondition_duplicate` does NOT hold (registry matches engine state), the fixed `registerScriptsForConfig` function SHALL produce the same engine script state as the original function.

**Validates: Requirements 3.2, 3.5**

Property 7: Bug Condition – init() Retries on SW Wakeup Failure

_For any_ page load where `isBugCondition_swRace` holds (SW is waking up on first attempt), the fixed `init()` function SHALL retry `GET_CONFIGS` with backoff and eventually inject matching configs once the SW responds.

**Validates: Requirements 2.5**

Property 8: Preservation – init() Behavior Unchanged When SW Is Awake

_For any_ page load where `isBugCondition_swRace` does NOT hold (SW responds on first attempt), the fixed `init()` function SHALL behave identically to the original, injecting configs on the first attempt without delay.

**Validates: Requirements 3.1, 3.2**

Property 9: Bug Condition – RELOAD_CONFIGS Cleans Up Engine Scripts Regardless of Registry State

_For any_ state where `isBugCondition_reload` holds (registry is empty but engine has scripts), the fixed `RELOAD_CONFIGS` handler SHALL unregister all `usersite_`-prefixed engine scripts before re-registering, leaving no stale scripts.

**Validates: Requirements 2.3**

Property 10: Bug Condition – Errors Are Surfaced, Not Swallowed

_For any_ runtime error where `isBugCondition_silent` holds (error is caught), the fixed code SHALL either propagate the error to the caller or write a structured log entry visible in the dashboard log panel.

**Validates: Requirements 2.8**

---

## Fix Implementation

### Bug 4 – Fix `matchesPattern` in `content.js`

**File:** `content.js`

**Function:** `matchesPattern` (inside `init()`)

**Specific Changes:**
1. Replace the corrupted escape string with the correct regex special-character escape: `.replace(/[.+^${}()|[\]\\]/g, '\\$&')`.
2. The corrected function body:
   ```javascript
   const matchesPattern = (url, pattern) => {
     try {
       const regex = new RegExp(
         '^' + pattern.split('*').map(s => s.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'
       );
       return regex.test(url);
     } catch (e) {
       return false;
     }
   };
   ```
3. Note: the trailing `$` anchor should also be added for correctness (the original may have been missing it).

---

### Bug 5 – Fix `enabled` Default in `lib/config-manager.js`

**File:** `lib/config-manager.js`

**Function:** `addConfig`

**Specific Changes:**
1. Change `config.enabled = config.enabled ?? false;` to `config.enabled = config.enabled ?? true;`.

---

### Bug 1 – Fix Duplicate Registration in `background.js`

**File:** `background.js`

**Function:** `registerScriptsForConfig`

**Specific Changes:**
1. Add `await unregisterScriptsForConfig(configId);` as the first statement in `registerScriptsForConfig`, before any script building logic.
2. This ensures stale engine scripts are always cleared before new ones are registered, regardless of in-memory registry state.
3. `unregisterScriptsForConfig` already queries the engine via `browser.userScripts.getScripts()`, so this is safe after SW restarts.

---

### Bug 3 – Retry with Backoff in `content.js` `init()`

**File:** `content.js`

**Function:** `init()`

**Specific Changes:**
1. Extract the `GET_CONFIGS` call into a helper `sendWithRetry(message, maxAttempts, baseDelayMs)`.
2. Retry up to 3 times with delays of 0ms, 200ms, 600ms (exponential backoff).
3. On each attempt, catch connection errors (SW not ready) and wait before retrying.
4. If all attempts fail, log a structured error (see Bug 6 fix) and return without injecting.
5. The retry loop is fully async — it does not block `document_start` timing since `init()` is already called asynchronously.

**Pseudocode:**
```
FUNCTION sendWithRetry(message, maxAttempts=3, baseDelay=200)
  FOR attempt = 1 TO maxAttempts DO
    TRY
      response ← browser.runtime.sendMessage(message)
      RETURN response
    CATCH error
      IF attempt < maxAttempts THEN
        WAIT baseDelay * (2 ^ (attempt - 1)) ms
      ELSE
        THROW error
      END IF
    END TRY
  END FOR
END FUNCTION
```

---

### Bug 2 – Fix `RELOAD_CONFIGS` in `background.js`

**File:** `background.js`

**Handler:** `RELOAD_CONFIGS` message handler

**Specific Changes:**
1. Replace the in-memory registry unregister block with an engine query:
   ```javascript
   // Before: relied on userScriptsRegistry (empty after SW restart)
   // After: query engine directly
   if (browser.userScripts.getScripts) {
     const allScripts = await browser.userScripts.getScripts();
     const usersiteIds = allScripts.map(s => s.id).filter(id => id.startsWith('usersite_'));
     if (usersiteIds.length > 0) {
       await browser.userScripts.unregister({ ids: usersiteIds });
     }
   }
   userScriptsRegistry.clear();
   ```
2. This mirrors the engine-query pattern already used in `unregisterScriptsForConfig`.

---

### Bug 6 – Structured Logging Layer

**New File:** `lib/logger.js`

**Design:**
- Export a `Logger` class (or singleton `logger` object) with methods: `info(msg, data?)`, `warn(msg, data?)`, `error(msg, data?)`.
- Internally maintains an in-memory ring buffer (array capped at 50 entries). Each entry: `{ level, message, data, timestamp }`.
- Also calls the corresponding `console.*` method so existing devtools behavior is preserved.
- Exposes `getLogs()` to return the current buffer.

**File:** `background.js`
- Import `logger` from `lib/logger.js`.
- Replace `console.error(...)` calls in catch blocks with `logger.error(...)`.
- Add a `GET_LOGS` message handler that returns `logger.getLogs()`.

**File:** `dashboard.html` / `dashboard.js`
- Add a minimal log panel below the config list: a `<div id="logPanel">` with a `<ul id="logList">` inside.
- On dashboard load, send `GET_LOGS` to background and render entries as `<li>` items with level, timestamp, and message.
- Add a "Clear Logs" button that sends a `CLEAR_LOGS` message and empties the list.
- No persistence — logs live only in the background SW's memory for the current session.
- Styling: minimal, no UI polish. Use Bootstrap's `text-danger` / `text-warning` / `text-muted` classes for level coloring.

**Note:** `content.js` runs in the page context and cannot import ES modules. Logging in `content.js` will use `console.error` with a `[UserSite]` prefix and structured data objects, which is sufficient for devtools visibility. Full dashboard log integration is background-only.

---

### Bug 7 – CSS/JS Injection Path Clarity

**Files:** `background.js`, `content.js`

**Specific Changes:**
1. Add a comment block at the top of `background.js` documenting the two injection paths:
   - **JS path**: `registerScriptsForConfig` → `browser.userScripts.register()` → runs at `document_start` in `MAIN` world. Cleanup: `unregisterScriptsForConfig`.
   - **CSS path**: `injectConfigIntoMatchingTabs` → `INJECT` message → `content.js` `injectCSS()` → DOM `<style>` element. Cleanup: `CLEANUP` message → `content.js` removes `[data-usersite-config]` elements.
2. Rename the internal comment label for the CSS injection trigger from the generic `sendInjectToTab` to clarify it handles CSS only (JS is handled by userScripts API). No function rename needed — just comment clarity.
3. Verify that both paths are triggered on the same lifecycle events (ADD_CONFIG, TOGGLE_ON, RELOAD) and both are cleaned up on (TOGGLE_OFF, DELETE). Add any missing cleanup calls.
4. No architectural changes — this is documentation and comment-level clarity only.

---

## Testing Strategy

### Validation Approach

Testing follows a two-phase approach: first, write tests that demonstrate the bug on unfixed code (exploratory), then verify the fix and preservation on fixed code.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug BEFORE implementing the fix. Confirm or refute root cause analysis.

**Test Cases:**

1. **Bug 4 – Regex**: Call `matchesPattern("https://example.com/page", "https://example.com/*")` on unfixed code. Expected: `false` (demonstrating the bug). After fix: `true`.

2. **Bug 5 – Enabled**: Call `addConfig("test", { name: "test", matches: ["*"] })` on unfixed code. Assert `config.enabled === false` (demonstrating the bug). After fix: `true`.

3. **Bug 1 – Duplicate**: Register scripts for a config, clear `userScriptsRegistry`, register again. Query engine. Expected: 2x scripts (demonstrating the bug). After fix: 1x scripts.

4. **Bug 3 – SW Race**: Mock `browser.runtime.sendMessage` to fail on first call, succeed on second. Call `init()` on unfixed code. Expected: no injection (demonstrating the bug). After fix: injection succeeds.

5. **Bug 2 – Reload**: Register scripts, clear `userScriptsRegistry`, trigger `RELOAD_CONFIGS`. Query engine. Expected: old scripts still present plus new ones (demonstrating the bug). After fix: only new scripts.

**Expected Counterexamples:**
- `matchesPattern` returns `false` for all inputs on unfixed code
- `addConfig` saves `enabled: false` when not specified
- Engine script count doubles after re-registration with empty registry

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode (Bug 4):**
```
FOR ALL (url, pattern) WHERE isBugCondition_regex(url, pattern) DO
  result := matchesPattern_fixed(url, pattern)
  ASSERT result = correctGlobMatch(url, pattern)
END FOR
```

**Pseudocode (Bug 5):**
```
FOR ALL config WHERE isBugCondition_enabled(config) DO
  result := addConfig_fixed(id, config)
  ASSERT result.enabled = true
END FOR
```

**Pseudocode (Bug 1):**
```
FOR ALL configId WHERE isBugCondition_duplicate(configId) DO
  registerScriptsForConfig_fixed(configId)
  ASSERT engineScriptCount(configId) = expectedScriptCount(configId)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original.

**Pseudocode (Bug 5):**
```
FOR ALL config WHERE NOT isBugCondition_enabled(config) DO
  ASSERT addConfig_fixed(id, config).enabled = addConfig_original(id, config).enabled
END FOR
```

**Testing Approach**: Property-based testing is recommended for Bug 1 (duplicate registration) and Bug 5 (enabled default) because:
- They have well-defined input domains (config objects, registry states)
- PBT can generate many combinations of explicit/implicit `enabled` values
- PBT can generate many combinations of registry states and engine states

### Unit Tests

- `matchesPattern` with a variety of URL/pattern pairs (exact match, wildcard, no match, edge cases like empty pattern)
- `addConfig` with `enabled` undefined, null, true, false
- `registerScriptsForConfig` called twice for the same config — verify engine script count equals expected, not doubled
- `RELOAD_CONFIGS` handler with empty registry — verify engine scripts are cleared before re-registration
- `sendWithRetry` with mock that fails N times then succeeds — verify injection occurs
- `logger.error` — verify entry appears in `getLogs()` ring buffer

### Property-Based Tests

- Generate random config objects with `enabled` as undefined, null, true, or false — verify `addConfig` always produces the correct `enabled` value (true for undefined/null, preserved otherwise)
- Generate random sets of registered script IDs in the engine and call `registerScriptsForConfig` — verify final engine count equals expected count regardless of prior state
- Generate random URL/pattern pairs and verify `matchesPattern` agrees with a reference glob implementation

### Integration Tests

- Full flow: add config (no `enabled` field) → verify it appears enabled in dashboard → verify CSS injected on matching page
- Full flow: SW restart simulation → trigger `RELOAD_CONFIGS` → verify no duplicate scripts in engine
- Full flow: page load while SW waking → verify injection eventually succeeds after retry
- Dashboard log panel: trigger an error in background → open dashboard → verify error appears in log panel
