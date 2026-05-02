/**
 * FS Service
 * File system and directory handle operations for the dashboard.
 * Wraps storage-helper and fs-adapter into higher-level operations.
 */

import { createHandleFromFiles } from './fs-adapter.js';
import {
  saveHandle,
  getHandle,
  listHandles,
  deleteHandle,
  readFileHandleAsDataURL,
  readFileHandleAsText,
} from './storage-helper.js';

export { deleteHandle };

/**
 * Load a config and its files from a FileSystemDirectoryHandle (real or virtual).
 * Returns { config, files } or null if no config.json found.
 */
export async function loadFromDirectoryHandle(dirHandle) {
  const files = [];
  let config = null;
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file') {
      files.push({ name, handle });
      if (name === 'config.json') {
        const txt = await readFileHandleAsText(handle);
        config = JSON.parse(txt);
      }
    }
  }
  if (!config) return null;
  return { config, files };
}

/**
 * Create a virtual directory handle from a FileList (input[type=file] webkitdirectory).
 */
export function createVirtualHandle(fileList) {
  return createHandleFromFiles(fileList);
}

/**
 * Persist a real FS handle to IndexedDB for later rescan.
 * Skips virtual handles (not serializable).
 */
export async function persistHandle(configId, handle) {
  await saveHandle(configId, handle);
}

/**
 * Retrieve a persisted FS handle by configId.
 */
export async function getPersistedHandle(configId) {
  return getHandle(configId);
}

/**
 * List all persisted handles.
 */
export async function listPersistedHandles() {
  return listHandles();
}

/**
 * Read all non-config files from a directory handle as data URLs.
 * Returns { [fileName]: dataURL }
 */
export async function readFilesAsDataURLs(files) {
  const fileStorage = {};
  for (const f of files) {
    if (f.name !== 'config.json') {
      fileStorage[f.name] = await readFileHandleAsDataURL(f.handle);
    }
  }
  return fileStorage;
}

/**
 * Read a single file from a handle as text.
 */
export async function readFileAsText(handle, fileName) {
  const fileHandle = await handle.getFileHandle(fileName);
  return readFileHandleAsText(fileHandle);
}

/**
 * Check and optionally request read permission for a handle.
 */
export async function ensureHandlePermission(handle) {
  if (!handle || typeof handle.queryPermission !== 'function') return false;
  const q = await handle.queryPermission({ mode: 'read' });
  if (q === 'granted') return true;
  const r = await handle.requestPermission({ mode: 'read' });
  return r === 'granted';
}

/**
 * Check whether any fs-sourced configs need permission re-grant.
 * Returns true if the FS banner should be shown.
 */
export async function checkFsBannerNeeded(configs) {
  const fsConfigs = configs.filter(c => c && c.source === 'fs');
  for (const cfg of fsConfigs) {
    const handle = await getHandle(cfg.id);
    if (!handle) return true;
    const q = await handle.queryPermission({ mode: 'read' });
    if (q !== 'granted') return true;
  }
  return false;
}
