/**
 * Dashboard Service
 * All browser.* API calls for the dashboard, isolated from UI logic.
 * Returns plain data — no DOM, no jQuery, no Vue.
 */

export async function fetchConfigs() {
  const response = await browser.runtime.sendMessage({ type: 'GET_CONFIGS' });
  if (!response || !response.success) {
    throw new Error(response?.error || 'Failed to fetch configurations');
  }
  return response.configs;
}

export async function addConfig(configId, config) {
  const response = await browser.runtime.sendMessage({
    type: 'ADD_CONFIG',
    configId,
    config,
  });
  if (!response || !response.success) {
    throw new Error(response?.error || 'Failed to save configuration');
  }
}

export async function toggleConfig(configId, enabled) {
  const response = await browser.runtime.sendMessage({
    type: 'TOGGLE_CONFIG',
    configId,
    enabled,
  });
  if (!response || !response.success) {
    throw new Error(response?.error || 'Failed to toggle configuration');
  }
}

export async function deleteConfig(configId) {
  const response = await browser.runtime.sendMessage({
    type: 'DELETE_CONFIG',
    configId,
  });
  if (!response || !response.success) {
    throw new Error(response?.error || 'Failed to delete configuration');
  }
  await browser.storage.local.remove(`usersite_files_${configId}`);
}

export async function reloadConfigs() {
  const response = await browser.runtime.sendMessage({ type: 'RELOAD_CONFIGS' });
  if (!response || !response.success) {
    throw new Error(response?.error || 'Failed to reload configurations');
  }
}

export async function fetchLogs() {
  const response = await browser.runtime.sendMessage({ type: 'GET_LOGS' });
  if (!response || !response.success) {
    throw new Error(response?.error || 'Failed to fetch logs');
  }
  return response.logs;
}

export async function clearLogs() {
  const response = await browser.runtime.sendMessage({ type: 'CLEAR_LOGS' });
  if (!response || !response.success) {
    throw new Error(response?.error || 'Failed to clear logs');
  }
}

/**
 * Write a log entry into the background's logger so it appears in the dashboard log panel.
 * Fire-and-forget — errors are silently ignored to avoid infinite loops.
 */
export function logToBackground(level, msg, data) {
  browser.runtime.sendMessage({ type: 'LOG', level, msg, data: data?.message ?? data ?? null })
    .catch(() => {}); // ignore if background is not ready
}

export async function saveConfigFiles(configId, fileStorage) {
  await browser.storage.local.set({ [`usersite_files_${configId}`]: fileStorage });
}

export async function readStorageFile(configId, fileName) {
  const storageKey = `usersite_files_${configId}`;
  const result = await browser.storage.local.get([storageKey]);
  const files = result[storageKey];
  if (!files || !files[fileName]) return null;
  const base64 = files[fileName].split(',')[1];
  return atob(base64);
}
