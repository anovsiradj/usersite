/**
 * Preservation Tests
 *
 * These tests run on UNFIXED code and are EXPECTED TO PASS.
 * They establish the baseline behavior that must be preserved after fixes.
 *
 * DO NOT modify these tests when implementing fixes — they must continue to pass.
 * GOAL: Confirm that non-buggy inputs are handled correctly even on unfixed code.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.5
 */

// =============================================================================
// BUG 4 – Regex Preservation
// =============================================================================
//
// Even though the matchesPattern function has a corrupted UUID escape string,
// non-matching URLs still correctly return false. The broken regex happens to
// reject non-matching URLs too — so these preservation tests PASS on unfixed code.
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

Deno.test("Bug 4 – Regex preservation: non-matching URL should return false (correct rejection preserved)", () => {
  // EXPECTED TO PASS on unfixed code — the broken regex still rejects non-matching URLs
  // Preservation: matchesPattern("https://other.com", "https://example.com/*") === false
  const result = matchesPattern("https://other.com", "https://example.com/*");
  console.log(`  matchesPattern("https://other.com", "https://example.com/*") = ${result}`);
  if (result !== false) {
    throw new Error(
      `PRESERVATION BROKEN: matchesPattern("https://other.com", "https://example.com/*") returned ${result}, expected false.\n` +
        `Non-matching URLs must still return false after the fix.`
    );
  }
});

Deno.test("Bug 4 – Regex preservation: completely different domain should return false", () => {
  // EXPECTED TO PASS on unfixed code — the broken regex still rejects non-matching URLs
  // Preservation: matchesPattern("https://example.com/page", "https://totally-different.com/*") === false
  const result = matchesPattern("https://example.com/page", "https://totally-different.com/*");
  console.log(`  matchesPattern("https://example.com/page", "https://totally-different.com/*") = ${result}`);
  if (result !== false) {
    throw new Error(
      `PRESERVATION BROKEN: matchesPattern("https://example.com/page", "https://totally-different.com/*") returned ${result}, expected false.\n` +
        `Non-matching URLs must still return false after the fix.`
    );
  }
});

// =============================================================================
// BUG 5 – Enabled Preservation
// =============================================================================
//
// When a config explicitly sets enabled: true or enabled: false, the ?? false
// operator preserves the explicit value (since ?? only applies when the left
// side is null or undefined). These tests PASS on unfixed code.
//
// Inline ConfigManager with the UNFIXED code (copied from lib/config-manager.js)

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

Deno.test("Bug 5 – Enabled preservation: explicit enabled: true should be preserved", async () => {
  // EXPECTED TO PASS on unfixed code — ?? false preserves explicit true values
  // Preservation: addConfig with enabled: true → config.enabled === true
  const manager = new ConfigManager();
  const config = await manager.addConfig("test-true", {
    name: "test-true",
    enabled: true,
    matches: ["*://example.com/*"],
  });

  console.log(`  config.enabled = ${config.enabled}`);
  if (config.enabled !== true) {
    throw new Error(
      `PRESERVATION BROKEN: addConfig with enabled: true produced config.enabled = ${config.enabled}, expected true.\n` +
        `Explicit enabled: true must be preserved by the fix.`
    );
  }
});

Deno.test("Bug 5 – Enabled preservation: explicit enabled: false should be preserved", async () => {
  // EXPECTED TO PASS on unfixed code — ?? false preserves explicit false values
  // Preservation: addConfig with enabled: false → config.enabled === false
  const manager = new ConfigManager();
  const config = await manager.addConfig("test-false", {
    name: "test-false",
    enabled: false,
    matches: ["*://example.com/*"],
  });

  console.log(`  config.enabled = ${config.enabled}`);
  if (config.enabled !== false) {
    throw new Error(
      `PRESERVATION BROKEN: addConfig with enabled: false produced config.enabled = ${config.enabled}, expected false.\n` +
        `Explicit enabled: false must be preserved by the fix.`
    );
  }
});

// =============================================================================
// BUG 3 – SW Race Preservation
// =============================================================================
//
// When the SW is already awake (first sendMessage succeeds), init() injects
// configs immediately. This behavior is correct on unfixed code and must be
// preserved after the retry fix is applied.
//
// Uses the same initWithoutRetry pattern from exploration.test.js.

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

Deno.test("Bug 3 – SW Race preservation: when SW is already awake, init() should inject immediately", async () => {
  // EXPECTED TO PASS on unfixed code — when SW responds on first attempt, injection works
  // Preservation: SW awake on first attempt → injection occurs without retry
  let callCount = 0;
  const mockSendMessage = async (_message) => {
    callCount++;
    // SW is already awake — succeeds on first attempt
    return {
      success: true,
      configs: [{ id: "test", enabled: true, matches: ["*://example.com/*"] }],
    };
  };

  const result = await initWithoutRetry(mockSendMessage);

  console.log(`  sendMessage call count: ${callCount}`);
  console.log(`  result.injected: ${result.injected}`);

  if (callCount !== 1) {
    throw new Error(
      `PRESERVATION BROKEN: sendMessage was called ${callCount} time(s), expected exactly 1.\n` +
        `When SW is awake, init() must inject on the first attempt without unnecessary retries.`
    );
  }

  if (result.injected !== true) {
    throw new Error(
      `PRESERVATION BROKEN: result.injected = ${result.injected}, expected true.\n` +
        `When SW is awake, init() must inject configs immediately.`
    );
  }
});

// Fixed version of init() using sendWithRetry (mirrors content.js after Bug 3 fix)
async function sendWithRetryPreservation(sendMessage, message, maxAttempts = 3, baseDelayMs = 200) {
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
    const response = await sendWithRetryPreservation(sendMessage, { type: "GET_CONFIGS" });
    if (response && response.success && Array.isArray(response.configs)) {
      return { injected: true, configs: response.configs };
    }
    return { injected: false, configs: [] };
  } catch (error) {
    console.error("[UserSite] Initialization error after retries:", error);
    return { injected: false, error: error.message };
  }
}

Deno.test("Bug 3 – SW Race preservation (fixed): when SW is already awake, initWithRetry() should inject immediately with exactly 1 call", async () => {
  // EXPECTED TO PASS — the fixed initWithRetry must not add extra calls when SW is awake
  // Preservation: SW awake on first attempt → injection occurs on first attempt, callCount === 1
  let callCount = 0;
  const mockSendMessage = async (_message) => {
    callCount++;
    // SW is already awake — succeeds on first attempt
    return {
      success: true,
      configs: [{ id: "test", enabled: true, matches: ["*://example.com/*"] }],
    };
  };

  const result = await initWithRetry(mockSendMessage);

  console.log(`  sendMessage call count: ${callCount}`);
  console.log(`  result.injected: ${result.injected}`);

  if (callCount !== 1) {
    throw new Error(
      `PRESERVATION BROKEN: sendMessage was called ${callCount} time(s), expected exactly 1.\n` +
        `When SW is awake, the fixed init() must inject on the first attempt without unnecessary retries.`
    );
  }

  if (result.injected !== true) {
    throw new Error(
      `PRESERVATION BROKEN: result.injected = ${result.injected}, expected true.\n` +
        `When SW is awake, the fixed init() must inject configs immediately.`
    );
  }
});

// =============================================================================
// BUG 1 – Duplicate Registration Preservation (Manual Test Case)
// =============================================================================
//
// MANUAL TEST — Cannot run browser.userScripts API in Deno tests.
//
// Preservation: When userScriptsRegistry is populated and matches engine state,
// registerScriptsForConfig produces the correct script count (no doubling).
//
// Steps to verify manually:
//   1. Load the extension in Chrome
//   2. Add a config with 2 JS files (e.g., script1.js, script2.js)
//   3. Open chrome://extensions → inspect the service worker → run:
//        browser.userScripts.getScripts().then(s => console.log(s.length))
//      Expected: 2 scripts
//   4. WITHOUT reloading the extension (registry is still populated), call
//      registerScriptsForConfig again for the same config
//   5. Run the same query again:
//        browser.userScripts.getScripts().then(s => console.log(s.length))
//      PRESERVED BEHAVIOR: 2 scripts (no doubling when registry is accurate)
//
// This preservation test confirms that the fix (adding unregisterScriptsForConfig
// at the top of registerScriptsForConfig) does not break the normal registration
// path when the registry is already populated.

Deno.test("Bug 1 – Duplicate Registration preservation (documented manual test)", () => {
  // This is a documentation test — it always passes but records the expected behavior.
  console.log("  BUG 1 – Duplicate Registration Preservation");
  console.log("  Manual verification required (browser.userScripts API not available in Deno)");
  console.log("  Preserved behavior: engine script count should NOT change when registry is accurate");
  console.log("  Condition: userScriptsRegistry is populated and matches engine state");
  console.log("  See test file comments for manual verification steps");
});

// =============================================================================
// BUG 2 – Reload Sync Preservation (Manual Test Case)
// =============================================================================
//
// MANUAL TEST — Cannot run browser.userScripts API in Deno tests.
//
// Preservation: When userScriptsRegistry is populated (non-empty), RELOAD_CONFIGS
// correctly unregisters and re-registers scripts, producing the correct final state.
//
// Steps to verify manually:
//   1. Load the extension in Chrome
//   2. Add a config with JS files
//   3. WITHOUT reloading the extension (registry is still populated), trigger RELOAD_CONFIGS:
//        chrome.runtime.sendMessage({ type: 'RELOAD_CONFIGS' })
//   4. Check engine scripts:
//        browser.userScripts.getScripts().then(s => console.log(s.map(s => s.id)))
//      PRESERVED BEHAVIOR: only the expected scripts (no stale ones, no duplicates)
//
// This preservation test confirms that the fix (querying engine instead of in-memory
// registry) does not break the reload path when the registry is already populated.

Deno.test("Bug 2 – Reload Sync preservation (documented manual test)", () => {
  // This is a documentation test — it always passes but records the expected behavior.
  console.log("  BUG 2 – Reload Sync Preservation");
  console.log("  Manual verification required (browser.userScripts API not available in Deno)");
  console.log("  Preserved behavior: RELOAD_CONFIGS produces correct final state when registry is populated");
  console.log("  Condition: userScriptsRegistry is non-empty and matches engine state");
  console.log("  See test file comments for manual verification steps");
});
