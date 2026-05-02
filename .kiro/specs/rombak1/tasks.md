# Implementation Plan

- [x] 1. Write bug condition exploration tests (BEFORE implementing any fix)
  - **Property 1: Bug Condition** - Regex, Enabled Default, Duplicate Registration, SW Race, Reload Sync
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms each bug exists
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **GOAL**: Surface counterexamples that demonstrate each bug exists
  - **Bug 4 – Regex**: Call `matchesPattern("https://example.com/page", "https://example.com/*")` on unfixed `content.js`. Assert result is `false` (bug: UUID placeholder corrupts regex). Document counterexample.
  - **Bug 5 – Enabled**: Call `configManager.addConfig("test", { name: "test", matches: ["*://example.com/*"] })` (no `enabled` field) on unfixed `lib/config-manager.js`. Assert `config.enabled === false` (bug: `?? false` instead of `?? true`). Document counterexample.
  - **Bug 1 – Duplicate**: Register scripts for a config, clear `userScriptsRegistry`, register again. Query engine. Assert engine script count is doubled (bug: no pre-unregister in `registerScriptsForConfig`). Document counterexample.
  - **Bug 3 – SW Race**: Mock `browser.runtime.sendMessage` to fail on first call, succeed on second. Call `init()` on unfixed `content.js`. Assert no injection occurs (bug: no retry). Document counterexample.
  - **Bug 2 – Reload**: Register scripts, clear `userScriptsRegistry`, trigger `RELOAD_CONFIGS`. Query engine. Assert old scripts still present plus new ones (bug: uses empty in-memory registry). Document counterexample.
  - Run all tests on UNFIXED code
  - **EXPECTED OUTCOME**: All tests FAIL (this is correct — it proves the bugs exist)
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7_

- [x] 2. Write preservation property tests (BEFORE implementing any fix)
  - **Property 2: Preservation** - Correct Matching, Explicit Enabled, Accurate Registry, Awake SW, Populated Registry
  - **IMPORTANT**: Follow observation-first methodology — observe UNFIXED code behavior for non-buggy inputs
  - **Bug 4 – Regex preservation**: Observe `matchesPattern("https://other.com", "https://example.com/*")` returns `false` on unfixed code (correct rejection). Write property: for all `(url, pattern)` pairs where the URL genuinely does not match the glob, `matchesPattern` returns `false`.
  - **Bug 5 – Enabled preservation**: Observe `addConfig("test", { name: "test", enabled: true, ... })` saves `enabled: true` and `addConfig("test", { name: "test", enabled: false, ... })` saves `enabled: false` on unfixed code. Write property: for all configs where `enabled` is explicitly `true` or `false`, `addConfig` preserves the explicit value.
  - **Bug 1 – Duplicate preservation**: Observe that when `userScriptsRegistry` is populated and matches engine state, `registerScriptsForConfig` produces the correct script count. Write property: for all `configId` where registry is accurate, engine script count equals expected after registration.
  - **Bug 3 – SW Race preservation**: Observe that when SW is already awake (first `sendMessage` succeeds), `init()` injects configs immediately. Write property: for all page loads where SW responds on first attempt, injection behavior is unchanged.
  - **Bug 2 – Reload preservation**: Observe that when `userScriptsRegistry` is populated, `RELOAD_CONFIGS` correctly unregisters and re-registers. Write property: for all states where registry is non-empty, reload produces correct final engine state.
  - Verify all preservation tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [x] 3. Fix Bug 4 – Fix `matchesPattern` regex in `content.js`

  - [x] 3.1 Replace corrupted UUID escape string in `matchesPattern`
    - File: `content.js`, inside `init()`, in the `matchesPattern` arrow function
    - Replace the UUID placeholder escape string (e.g. `\\0ba8719a-f879-44cc-88f5-64cd4dd02158` or similar) with the correct regex escape: `'\\$&'`
    - Corrected map callback: `s => s.replace(/[.+^${}()|[\]\\]/g, '\\$&')`
    - Verify the full corrected function: `const regex = new RegExp('^' + pattern.split('*').map(s => s.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');`
    - Add the trailing `$` anchor if missing (the original may omit it)
    - _Bug_Condition: isBugCondition_regex(X) — every call to matchesPattern is affected_
    - _Expected_Behavior: matchesPattern(url, pattern) returns true iff url matches the glob pattern_
    - _Preservation: Non-matching (url, pattern) pairs must still return false_
    - _Requirements: 1.6, 2.6, 3.1, 3.2_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - matchesPattern Produces Correct Results
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - Run: `matchesPattern("https://example.com/page", "https://example.com/*")` → assert `true`
    - Run: `matchesPattern("https://foo.bar/baz", "*://foo.bar/*")` → assert `true`
    - **EXPECTED OUTCOME**: Test PASSES (confirms Bug 4 is fixed)
    - _Requirements: 2.6_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Matching URLs Still Return False
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run: `matchesPattern("https://other.com", "https://example.com/*")` → assert `false`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 4. Fix Bug 5 – Fix `enabled` default in `lib/config-manager.js`

  - [x] 4.1 Change `?? false` to `?? true` in `addConfig`
    - File: `lib/config-manager.js`, `addConfig` method, line: `config.enabled = config.enabled ?? false;`
    - Change to: `config.enabled = config.enabled ?? true;`
    - This is a one-character fix — only the default value changes; explicit `true`/`false` values are unaffected
    - _Bug_Condition: isBugCondition_enabled(X) — X.enabled is undefined or null_
    - _Expected_Behavior: addConfig saves config with enabled = true when enabled is not specified_
    - _Preservation: Explicit enabled: true and enabled: false values must be preserved unchanged_
    - _Requirements: 1.7, 2.7, 3.1, 3.2_

  - [x] 4.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - addConfig Defaults enabled to true
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - Run: `addConfig("test", { name: "test", matches: ["*://example.com/*"] })` → assert `config.enabled === true`
    - **EXPECTED OUTCOME**: Test PASSES (confirms Bug 5 is fixed)
    - _Requirements: 2.7_

  - [x] 4.3 Verify preservation tests still pass
    - **Property 2: Preservation** - addConfig Respects Explicit enabled Values
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run: `addConfig("test", { ..., enabled: true })` → assert `enabled === true`
    - Run: `addConfig("test", { ..., enabled: false })` → assert `enabled === false`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 5. Fix Bug 1 – Fix duplicate registration in `background.js`

  - [x] 5.1 Add `await unregisterScriptsForConfig(configId)` at top of `registerScriptsForConfig`
    - File: `background.js`, `registerScriptsForConfig` function
    - Add `await unregisterScriptsForConfig(configId);` as the very first statement, before the `configManager.getConfig` call
    - `unregisterScriptsForConfig` already queries the engine via `browser.userScripts.getScripts()`, so this is safe after SW restarts when `userScriptsRegistry` is empty
    - This ensures stale engine scripts (from prior registrations with different file counts or names) are always cleared before new ones are registered
    - _Bug_Condition: isBugCondition_duplicate(X) — registryState is 'empty' but engine has scripts for configId_
    - _Expected_Behavior: engine script count for configId equals expectedScriptCount after registerScriptsForConfig_
    - _Preservation: When registry is accurate, registration behavior is unchanged_
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.2, 3.5_

  - [x] 5.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - registerScriptsForConfig Produces No Duplicates
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - Register scripts, clear `userScriptsRegistry`, register again. Assert engine script count equals expected (not doubled).
    - **EXPECTED OUTCOME**: Test PASSES (confirms Bug 1 is fixed)
    - _Requirements: 2.1, 2.2_

  - [x] 5.3 Verify preservation tests still pass
    - **Property 2: Preservation** - registerScriptsForConfig Unchanged When Registry Is Accurate
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 6. Fix Bug 3 – Add retry with backoff in `content.js` `init()`

  - [x] 6.1 Extract `GET_CONFIGS` call into a `sendWithRetry` helper in `content.js`
    - File: `content.js`, inside the IIFE, before `init()`
    - Add helper function `sendWithRetry(message, maxAttempts, baseDelayMs)`:
      - `maxAttempts = 3`, `baseDelayMs = 200`
      - On each attempt: call `browser.runtime.sendMessage(message)`
      - On connection error (SW not ready): if attempts remain, `await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1)))` then retry
      - On final failure: throw the error
      - Delays: attempt 1 = 0ms (immediate), attempt 2 = 200ms, attempt 3 = 600ms
    - Update `init()` to call `sendWithRetry({ type: 'GET_CONFIGS' }, 3, 200)` instead of `browser.runtime.sendMessage`
    - The retry loop is fully async — does not block `document_start` timing since `init()` is already called asynchronously
    - On all-attempts failure: log `[UserSite] Initialization error after retries:` and return without injecting
    - _Bug_Condition: isBugCondition_swRace(X) — swState is 'waking' and attempt is 1_
    - _Expected_Behavior: init() retries and eventually injects configs once SW responds_
    - _Preservation: When SW is already awake, init() behaves identically (injects on first attempt)_
    - _Requirements: 1.5, 2.5, 3.1, 3.2_

  - [x] 6.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - init() Retries on SW Wakeup Failure
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - Mock `sendMessage` to fail on attempt 1, succeed on attempt 2. Assert injection occurs.
    - **EXPECTED OUTCOME**: Test PASSES (confirms Bug 3 is fixed)
    - _Requirements: 2.5_

  - [x] 6.3 Verify preservation tests still pass
    - **Property 2: Preservation** - init() Behavior Unchanged When SW Is Awake
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Mock `sendMessage` to succeed on first attempt. Assert injection occurs immediately.
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 7. Fix Bug 2 – Fix `RELOAD_CONFIGS` to query engine instead of in-memory registry

  - [x] 7.1 Replace in-memory registry unregister with engine query in `RELOAD_CONFIGS` handler
    - File: `background.js`, `RELOAD_CONFIGS` message handler
    - Remove the block: `const ids = Array.from(userScriptsRegistry.values()); if (ids.length) { await UserScripts.unregister(ids); }`
    - Replace with engine query:
      ```javascript
      if (browser.userScripts && browser.userScripts.getScripts) {
        const allScripts = await browser.userScripts.getScripts();
        const usersiteIds = allScripts.map(s => s.id).filter(id => id.startsWith('usersite_'));
        if (usersiteIds.length > 0) {
          await browser.userScripts.unregister({ ids: usersiteIds });
        }
      }
      ```
    - Keep `userScriptsRegistry.clear()` after the engine query
    - This mirrors the engine-query pattern already used in `unregisterScriptsForConfig`
    - _Bug_Condition: isBugCondition_reload(X) — registrySize is 0 but engineScriptCount > 0_
    - _Expected_Behavior: RELOAD_CONFIGS unregisters all usersite_-prefixed engine scripts before re-registering_
    - _Preservation: When registry is non-empty, reload produces correct final engine state_
    - _Requirements: 1.3, 2.3, 3.3, 3.5_

  - [x] 7.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - RELOAD_CONFIGS Cleans Up Engine Scripts Regardless of Registry State
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - Register scripts, clear `userScriptsRegistry`, trigger `RELOAD_CONFIGS`. Assert only expected scripts remain in engine (no stale duplicates).
    - **EXPECTED OUTCOME**: Test PASSES (confirms Bug 2 is fixed)
    - _Requirements: 2.3_

  - [x] 7.3 Verify preservation tests still pass
    - **Property 2: Preservation** - RELOAD_CONFIGS Unchanged When Registry Is Populated
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 8. Fix Bug 6 – Add `lib/logger.js` + `GET_LOGS`/`CLEAR_LOGS` messages + dashboard log panel

  - [x] 8.1 Create `lib/logger.js` with ring-buffer logger
    - File: `lib/logger.js` (new file)
    - Export a `Logger` class with methods: `info(msg, data?)`, `warn(msg, data?)`, `error(msg, data?)`
    - Each method: appends `{ level, message, data, timestamp: Date.now() }` to an in-memory array capped at 50 entries (ring buffer — drop oldest when full)
    - Each method also calls the corresponding `console.info/warn/error` so existing devtools behavior is preserved
    - Expose `getLogs()` returning a copy of the current buffer
    - Expose `clearLogs()` emptying the buffer
    - Export a singleton `logger` instance as the default export

  - [x] 8.2 Integrate `logger` into `background.js`
    - File: `background.js`
    - Import: `import { logger } from './lib/logger.js';`
    - Replace all `console.error(...)` calls in catch blocks with `logger.error(...)`
    - Add `GET_LOGS` message handler: returns `{ success: true, logs: logger.getLogs() }`
    - Add `CLEAR_LOGS` message handler: calls `logger.clearLogs()`, returns `{ success: true }`
    - _Bug_Condition: isBugCondition_silent(X) — error is caught and not propagated or surfaced_
    - _Expected_Behavior: every caught error writes a structured log entry visible in dashboard_
    - _Preservation: console.error output is preserved; existing catch block behavior is unchanged_
    - _Requirements: 1.8, 2.8_

  - [x] 8.3 Add log panel to `dashboard.html`
    - File: `dashboard.html`
    - Add below `#configList`:
      ```html
      <div id="logPanel" class="mt-4">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h6 class="mb-0 text-secondary small fw-bold">Extension Logs</h6>
          <button id="clearLogsBtn" class="btn btn-outline-secondary btn-sm py-0">Clear Logs</button>
        </div>
        <ul id="logList" class="list-unstyled small border rounded p-2 bg-body-tertiary" style="max-height: 200px; overflow-y: auto; font-family: monospace;"></ul>
      </div>
      ```

  - [x] 8.4 Wire log panel in `dashboard.js`
    - File: `dashboard.js`
    - On dashboard load (inside the `$(async function() {...})` block): send `GET_LOGS` to background and render entries as `<li>` items
    - Each `<li>`: `[timestamp] [LEVEL] message` — use Bootstrap classes `text-danger` (error), `text-warning` (warn), `text-muted` (info) for level coloring
    - Wire `#clearLogsBtn` click: send `CLEAR_LOGS` message, then empty `#logList`
    - No persistence — logs live only in the background SW's memory for the current session
    - _Requirements: 2.8_

  - [x] 8.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Errors Are Surfaced, Not Swallowed
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - Trigger a caught error in background. Send `GET_LOGS`. Assert entry appears in buffer.
    - **EXPECTED OUTCOME**: Test PASSES (confirms Bug 6 is fixed)
    - _Requirements: 2.8_

  - [x] 8.6 Verify preservation tests still pass
    - **Property 2: Preservation** - console.error Output Preserved
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Assert `console.error` is still called (logger delegates to it)
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 9. Fix Bug 7 – Add CSS/JS injection path documentation in `background.js` and `content.js`

  - [x] 9.1 Add injection path lifecycle comment block to `background.js`
    - File: `background.js`, at the top after the imports
    - Add a comment block documenting both injection paths:
      ```
      // === Injection Path Overview ===
      //
      // JS Path (registerJSResources):
      //   registerScriptsForConfig(configId)
      //     → browser.userScripts.register()
      //     → scripts run at document_start in MAIN world
      //   Cleanup: unregisterScriptsForConfig(configId)
      //     → browser.userScripts.unregister()
      //   Triggered on: ADD_CONFIG, TOGGLE_ON, RELOAD_CONFIGS, onInstalled, onStartup
      //   Cleaned up on: TOGGLE_OFF, DELETE_CONFIG, RELOAD_CONFIGS (before re-register)
      //
      // CSS Path (injectCSSResources):
      //   injectConfigIntoMatchingTabs(configId)
      //     → browser.tabs.sendMessage({ type: 'INJECT', config })
      //     → content.js injectCSS() → DOM <style data-usersite-config="...">
      //   Cleanup: browser.tabs.sendMessage({ type: 'CLEANUP', configId })
      //     → content.js removes [data-usersite-config=configId] elements
      //   Triggered on: ADD_CONFIG, TOGGLE_ON, RELOAD_CONFIGS
      //   Cleaned up on: TOGGLE_OFF, DELETE_CONFIG
      ```
    - Add inline comment on `sendInjectToTab`: `// CSS injection only — JS is handled by userScripts API (see registerScriptsForConfig)`
    - _Bug_Condition: isBugCondition_asymmetry(X) — cleanup paths differ in structure or naming_
    - _Expected_Behavior: both paths have equivalent lifecycle documentation and cleanup parity_
    - _Preservation: no functional changes — documentation and comments only_
    - _Requirements: 1.9, 2.9_

  - [x] 9.2 Add injection path comment block to `content.js`
    - File: `content.js`, at the top of the IIFE, before `injectedResources`
    - Add a comment block:
      ```
      // === CSS Injection Path (injectCSSResources) ===
      // Receives INJECT message from background.js → injectConfig() → injectCSS()
      // Creates <style data-usersite-config="{configId}" data-usersite-css-file="{file}"> in DOM
      // Cleanup: CLEANUP message → removes all [data-usersite-config="{configId}"] elements
      //
      // JS Injection Path (registerJSResources) — managed in background.js
      // background.js registers scripts via browser.userScripts API (document_start, MAIN world)
      // content.js does NOT handle JS injection directly
      ```
    - _Requirements: 1.9, 2.9_

  - [x] 9.3 Verify cleanup parity — both paths cleaned up on TOGGLE_OFF and DELETE_CONFIG
    - File: `background.js`
    - Audit `TOGGLE_CONFIG` (enabled=false) handler: confirm it calls both `unregisterScriptsForConfig` (JS) and sends `CLEANUP` message (CSS) — it already does; add comment confirming parity
    - Audit `DELETE_CONFIG` handler: confirm it calls both `unregisterScriptsForConfig` (JS) and sends `CLEANUP` message (CSS) — it already does; add comment confirming parity
    - Audit `RELOAD_CONFIGS` handler: confirm it calls engine unregister (JS) and `injectConfigIntoMatchingTabs` (CSS re-inject) — add any missing CSS re-inject call if absent
    - No functional changes required if parity already exists — document findings in comments
    - _Requirements: 2.9, 3.3, 3.4_

  - [x] 9.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Injection and Cleanup Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — this task is documentation only)

- [x] 10. Checkpoint – Ensure all tests pass
  - Re-run all exploration tests (Properties 1) — all should now PASS (bugs are fixed)
  - Re-run all preservation tests (Properties 2) — all should still PASS (no regressions)
  - Manually verify end-to-end: add a config without `enabled` field → confirm it appears enabled in dashboard → confirm CSS injects on matching page
  - Manually verify: reload extension after SW restart → confirm no duplicate scripts in engine
  - Manually verify: open dashboard → confirm log panel renders and "Clear Logs" works
  - Ensure all tests pass; ask the user if questions arise.
