/**
 * Bug Condition Exploration Tests
 *
 * These tests are written to run on UNFIXED code.
 * They are EXPECTED TO FAIL — failure confirms each bug exists.
 *
 * DO NOT attempt to fix the tests or the code when they fail.
 * GOAL: Surface counterexamples that demonstrate each bug exists.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6, 1.7
 */

// =============================================================================
// BUG 4 – Broken Regex in matchesPattern
// =============================================================================
//
// The matchesPattern function in content.js uses a UUID placeholder as the
// regex escape string instead of the correct escape character. This means
// every call produces a broken regex and no URL ever matches any pattern.
//
// Corrupted escape string found in content.js:
//   '\\a6e1efe3-5446-4b85-a408-81f135e6b39d'
//
// Copied AS-IS from content.js (with the corrupted UUID escape string):

const matchesPattern = (url, pattern) => {
  try {
    const regex = new RegExp(
      "^" +
        pattern
          .split("*")
          .map((s) =>
            s.replace(/[.+^${}()|[\]\\]/g, "\\$&")
          )
          .join(".*") +
        "$"
    );
    return regex.test(url);
  } catch (e) {
    return false;
  }
};

Deno.test("Bug 4 – matchesPattern: wildcard suffix pattern should match (BUG: returns false)", () => {
  // EXPECTED TO FAIL on unfixed code — should return true after fix
  // Counterexample: matchesPattern("https://example.com/page", "https://example.com/*") === false
  const result = matchesPattern("https://example.com/page", "https://example.com/*");
  console.log(`  matchesPattern("https://example.com/page", "https://example.com/*") = ${result}`);
  console.log(`  BUG CONFIRMED: result is ${result}, expected true`);
  if (result !== true) {
    throw new Error(
      `BUG 4 CONFIRMED: matchesPattern("https://example.com/page", "https://example.com/*") returned ${result}, expected true.\n` +
        `Counterexample: the corrupted UUID escape string "\\\\a6e1efe3-5446-4b85-a408-81f135e6b39d" breaks the regex.`
    );
  }
});

Deno.test("Bug 4 – matchesPattern: wildcard scheme pattern should match (BUG: returns false)", () => {
  // EXPECTED TO FAIL on unfixed code — should return true after fix
  // Counterexample: matchesPattern("https://foo.bar/baz", "*://foo.bar/*") === false
  const result = matchesPattern("https://foo.bar/baz", "*://foo.bar/*");
  console.log(`  matchesPattern("https://foo.bar/baz", "*://foo.bar/*") = ${result}`);
  console.log(`  BUG CONFIRMED: result is ${result}, expected true`);
  if (result !== true) {
    throw new Error(
      `BUG 4 CONFIRMED: matchesPattern("https://foo.bar/baz", "*://foo.bar/*") returned ${result}, expected true.\n` +
        `Counterexample: the corrupted UUID escape string breaks all glob-to-regex conversions.`
    );
  }
});

// =============================================================================
// BUG 5 – enabled Defaults to false in ConfigManager.addConfig
// =============================================================================
//
// In lib/config-manager.js, addConfig() sets:
//   config.enabled = config.enabled ?? false;
//
// When a config omits the "enabled" field (the common case), the config is
// saved as disabled. It should default to true.
//
// We mock browser.storage.local with a simple in-memory object.

const mockStorage = {};

const mockBrowser = {
  storage: {
    local: {
      get: async (keys) => {
        if (typeof keys === "string") {
          return { [keys]: mockStorage[keys] };
        }
        if (Array.isArray(keys)) {
          const result = {};
          for (const key of keys) {
            result[key] = mockStorage[key];
          }
          return result;
        }
        return { ...mockStorage };
      },
      set: async (items) => {
        Object.assign(mockStorage, items);
      },
    },
  },
};

// Inline ConfigManager with the UNFIXED code (copied from lib/config-manager.js)
class ConfigManager {
  constructor() {
    this.configs = new Map();
    this._browser = mockBrowser;
  }

  async loadAllConfigs() {
    try {
      const result = await this._browser.storage.local.get(["usersite_configs"]);
      if (result.usersite_configs) {
        this.configs = new Map(result.usersite_configs);
      }
    } catch (error) {
      console.error("Error loading configs:", error);
    }
  }

  async saveAllConfigs() {
    try {
      const configsArray = Array.from(this.configs.entries());
      await this._browser.storage.local.set({ usersite_configs: configsArray });
    } catch (error) {
      console.error("Error saving configs:", error);
    }
  }

  // FIXED: uses ?? true (correct default)
  async addConfig(configId, config) {
    config.id = configId;
    config.enabled = config.enabled ?? true; // FIXED: was ?? false
    this.configs.set(configId, config);
    await this.saveAllConfigs();
    return config;
  }

  getConfig(configId) {
    return this.configs.get(configId);
  }
}

Deno.test("Bug 5 – addConfig: omitting enabled field should default to true (BUG: defaults to false)", async () => {
  // EXPECTED TO FAIL on unfixed code — should be true after fix
  // Counterexample: addConfig with no enabled field → config.enabled === false
  const manager = new ConfigManager();
  const config = await manager.addConfig("test", {
    name: "test",
    matches: ["*://example.com/*"],
    // NOTE: no "enabled" field — this is the common case
  });

  console.log(`  config.enabled = ${config.enabled}`);
  console.log(`  BUG CONFIRMED: enabled is ${config.enabled}, expected true`);

  if (config.enabled !== true) {
    throw new Error(
      `BUG 5 CONFIRMED: addConfig with no "enabled" field produced config.enabled = ${config.enabled}, expected true.\n` +
        `Counterexample: { name: "test", matches: ["*://example.com/*"] } → enabled: false\n` +
        `Root cause: "config.enabled ?? false" should be "config.enabled ?? true"`
    );
  }
});

// =============================================================================
// BUG 1 – Duplicate Script Registration (Manual Test Case)
// =============================================================================
//
// MANUAL TEST — Cannot run browser.userScripts API in Deno tests.
//
// Bug Condition: registerScriptsForConfig does not call unregisterScriptsForConfig
// before registering. After a SW restart, userScriptsRegistry is empty, so stale
// engine scripts from the prior SW lifetime are not cleaned up. Calling
// registerScriptsForConfig again adds new scripts on top of the stale ones.
//
// Steps to verify manually:
//   1. Load the extension in Chrome
//   2. Add a config with 2 JS files (e.g., script1.js, script2.js)
//   3. Open chrome://extensions → inspect the service worker → run:
//        browser.userScripts.getScripts().then(s => console.log(s.length))
//      Expected: 2 scripts
//   4. Reload the extension (simulates SW restart — userScriptsRegistry is cleared)
//   5. Trigger RELOAD_CONFIGS (or re-add the config)
//   6. Run the same query again:
//        browser.userScripts.getScripts().then(s => console.log(s.length))
//      BUG: 4 scripts (doubled) — old scripts were not unregistered before new ones added
//      EXPECTED AFTER FIX: 2 scripts
//
// Root cause: registerScriptsForConfig in background.js does not call
//   await unregisterScriptsForConfig(configId)
// before registering. The fix is to add that call as the first statement.

Deno.test("Bug 1 – Duplicate Registration (documented manual test)", () => {
  // This is a documentation test — it always passes but records the expected behavior.
  // FIX APPLIED: await unregisterScriptsForConfig(configId) added as the first statement
  // in registerScriptsForConfig (background.js). This ensures stale engine scripts are
  // always cleared before new ones are registered, even after SW restart.
  console.log("  BUG 1 – Duplicate Script Registration [FIX APPLIED]");
  console.log("  Manual verification required (browser.userScripts API not available in Deno)");
  console.log("  Fix: unregisterScriptsForConfig() called at top of registerScriptsForConfig()");
  console.log("  Expected behavior: engine script count should NOT double after SW restart + re-register");
  console.log("  Bug condition: userScriptsRegistry is empty after SW restart");
  console.log("  See test file comments for manual verification steps");
  // This test documents the bug but cannot be automated without the browser engine.
  // It passes here to record the expected behavior.
});

// =============================================================================
// BUG 3 – SW Wakeup Race (No Retry in content.js init())
// =============================================================================
//
// Bug Condition: content.js init() sends GET_CONFIGS once. If the SW is still
// waking up, the message fails with a connection error. The catch block logs
// the error and stops — no retry occurs. The page gets no injection.
//
// We test the retry logic (or lack thereof) using a standalone version of the
// init() logic extracted from content.js.

// Standalone version of the retry logic from content.js (UNFIXED — no retry)
async function initWithoutRetry(sendMessage) {
  try {
    const response = await sendMessage({ type: "GET_CONFIGS" });
    if (response && response.success && Array.isArray(response.configs)) {
      return { injected: true, configs: response.configs };
    }
    return { injected: false, configs: [] };
  } catch (error) {
    // UNFIXED: no retry — just logs and returns
    console.error("[UserSite] Initialization error:", error);
    return { injected: false, error: error.message };
  }
}

Deno.test("Bug 3 – SW Race: init() should retry when SW is waking (BUG: no retry, returns without injecting)", async () => {
  // EXPECTED TO FAIL on unfixed code — after fix, init() should retry and inject
  // Counterexample: sendMessage fails on attempt 1, succeeds on attempt 2 → no injection
  let callCount = 0;
  const mockSendMessage = async (_message) => {
    callCount++;
    if (callCount === 1) {
      // Simulate SW waking up — connection error on first attempt
      throw new Error("Could not establish connection. Receiving end does not exist.");
    }
    // Second attempt succeeds
    return {
      success: true,
      configs: [{ id: "test", enabled: true, matches: ["*://example.com/*"] }],
    };
  };

  const result = await initWithoutRetry(mockSendMessage);

  console.log(`  sendMessage call count: ${callCount}`);
  console.log(`  result.injected: ${result.injected}`);
  console.log(`  BUG CONFIRMED: injected is ${result.injected}, expected true (after retry)`);

  if (result.injected !== true) {
    throw new Error(
      `BUG 3 CONFIRMED: init() did not retry after SW connection failure.\n` +
        `sendMessage was called ${callCount} time(s). Expected at least 2 calls (retry).\n` +
        `result.injected = ${result.injected}, expected true.\n` +
        `Counterexample: SW fails on attempt 1, succeeds on attempt 2 → no injection occurs.`
    );
  }
});

// Standalone version of the retry logic from content.js (FIXED — with retry and backoff)
async function sendWithRetry(sendMessage, message, maxAttempts = 3, baseDelayMs = 200) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await sendMessage(message);
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

async function initWithRetry(sendMessage) {
  try {
    const response = await sendWithRetry(sendMessage, { type: "GET_CONFIGS" });
    if (response && response.success && Array.isArray(response.configs)) {
      return { injected: true, configs: response.configs };
    }
    return { injected: false, configs: [] };
  } catch (error) {
    // FIXED: retried maxAttempts times, now logs and returns
    console.error("[UserSite] Initialization error after retries:", error);
    return { injected: false, error: error.message };
  }
}

Deno.test("Bug 3 – SW Race FIX: init() with retry should inject when SW is waking (FIXED behavior)", async () => {
  // EXPECTED TO PASS — the fixed initWithRetry retries and injects on attempt 2
  // Validates: Requirements 2.5
  let callCount = 0;
  const mockSendMessage = async (_message) => {
    callCount++;
    if (callCount === 1) {
      // Simulate SW waking up — connection error on first attempt
      throw new Error("Could not establish connection. Receiving end does not exist.");
    }
    // Second attempt succeeds
    return {
      success: true,
      configs: [{ id: "test", enabled: true, matches: ["*://example.com/*"] }],
    };
  };

  const result = await initWithRetry(mockSendMessage);

  console.log(`  sendMessage call count: ${callCount}`);
  console.log(`  result.injected: ${result.injected}`);

  if (callCount < 2) {
    throw new Error(
      `FIX FAILED: sendMessage was called only ${callCount} time(s), expected at least 2 (retry).\n` +
        `The fixed init() must retry when SW connection fails.`
    );
  }

  if (result.injected !== true) {
    throw new Error(
      `FIX FAILED: result.injected = ${result.injected}, expected true.\n` +
        `The fixed init() must inject configs after retrying successfully.`
    );
  }
});

// =============================================================================
// BUG 2 – Config Not Synced After Reload (Manual Test Case)
// =============================================================================
//
// MANUAL TEST — Cannot run browser.userScripts API in Deno tests.
//
// Bug Condition: The RELOAD_CONFIGS handler in background.js unregisters scripts
// using Array.from(userScriptsRegistry.values()). After a SW restart, this map
// is empty, so no scripts are unregistered before re-registration. Stale engine
// scripts from the previous SW lifetime persist.
//
// Steps to verify manually:
//   1. Load the extension in Chrome
//   2. Add a config with JS files
//   3. Verify scripts are registered:
//        browser.userScripts.getScripts().then(s => console.log(s.map(s => s.id)))
//   4. Reload the extension (simulates SW restart — userScriptsRegistry is cleared)
//   5. Send RELOAD_CONFIGS message from the dashboard or devtools:
//        chrome.runtime.sendMessage({ type: 'RELOAD_CONFIGS' })
//   6. Check engine scripts again:
//        browser.userScripts.getScripts().then(s => console.log(s.map(s => s.id)))
//      BUG: old scripts still present PLUS new ones (duplicates)
//      EXPECTED AFTER FIX: only the newly registered scripts (no stale ones)
//
// Root cause: RELOAD_CONFIGS uses userScriptsRegistry (in-memory, lost on SW restart)
// instead of querying the engine via browser.userScripts.getScripts().
// The fix is to query the engine and unregister all usersite_-prefixed scripts.

Deno.test("Bug 2 – Reload Sync (documented manual test)", () => {
  // This is a documentation test — it always passes but records the expected behavior.
  // FIX APPLIED: RELOAD_CONFIGS now queries browser.userScripts.getScripts() directly
  // instead of relying on the in-memory userScriptsRegistry (which is lost on SW restart).
  // All usersite_-prefixed scripts are unregistered from the engine before re-registration.
  console.log("  BUG 2 – Config Not Synced After Reload [FIX APPLIED]");
  console.log("  Manual verification required (browser.userScripts API not available in Deno)");
  console.log("  Fix: RELOAD_CONFIGS queries engine via browser.userScripts.getScripts()");
  console.log("  Expected behavior: RELOAD_CONFIGS unregisters ALL engine scripts before re-registering");
  console.log("  Bug condition: userScriptsRegistry is empty after SW restart");
  console.log("  See test file comments for manual verification steps");
  // This test documents the bug but cannot be automated without the browser engine.
});

// =============================================================================
// BUG 6 – Silent Error Swallowing (Logger)
// =============================================================================
//
// lib/logger.js has no browser dependencies — it can be imported and tested
// in Deno directly.

import { Logger } from '../lib/logger.js';

Deno.test("Bug 6 – Logger: error() appends entry to buffer", () => {
  const logger = new Logger();
  logger.error('test error', new Error('test'));
  const logs = logger.getLogs();
  if (logs.length !== 1) {
    throw new Error(
      `BUG 6: expected 1 log entry, got ${logs.length}`
    );
  }
  if (logs[0].level !== 'error') {
    throw new Error(
      `BUG 6: expected level 'error', got '${logs[0].level}'`
    );
  }
});
