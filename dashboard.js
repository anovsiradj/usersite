// Dashboard script for UserWeb extension

// Theme management
(function () {
  const savedTheme = localStorage.getItem('userweb-theme');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const theme = savedTheme || systemTheme;
  document.documentElement.setAttribute('data-bs-theme', theme);
})();

// FileWatcher implementation (inline for compatibility)
class FileWatcher {
  async readDirectory(files) {
    const configs = {};
    const fileMap = {};

    for (const file of files) {
      const path = file.webkitRelativePath || file.name;
      const pathParts = path.split('/');

      if (pathParts.length > 1) {
        const dirName = pathParts[0];
        const fileName = pathParts[pathParts.length - 1];

        if (!fileMap[dirName]) {
          fileMap[dirName] = { files: [], config: null };
        }

        fileMap[dirName].files.push({ file, fileName, path });
      } else {
        if (!fileMap['']) {
          fileMap[''] = { files: [], config: null };
        }
        fileMap[''].files.push({ file, fileName: file.name, path });
      }
    }

    for (const [dirName, dirData] of Object.entries(fileMap)) {
      const configFile = dirData.files.find(f => f.fileName === 'config.json');

      if (configFile) {
        try {
          const configText = await this.readFileAsText(configFile.file);
          const config = JSON.parse(configText);
          dirData.config = config;

          config._files = dirData.files.map(f => ({
            name: f.fileName,
            path: f.path,
            file: f.file
          }));

          configs[dirName || 'root'] = dirData.config;
        } catch (error) {
          console.error(`Error reading config.json in ${dirName}:`, error);
        }
      }
    }

    return configs;
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }

  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }
}

const fileWatcher = new FileWatcher();
let currentConfigFiles = null;
let currentConfigData = null;

// DOM Elements (jQuery)
const $configList = $('#configList');
const $addConfigBtn = $('#addConfigBtn');
const $reloadBtn = $('#reloadBtn');
const $pickDirBtn = $('#pickDirBtn');
const $configFolderInput = $('#configFolder');
const $configPreview = $('#configPreview');
const $configPreviewContent = $('#configPreviewContent');
const $saveConfigBtn = $('#saveConfigBtn');
const $fsBanner = $('#fsBanner');
const $fsGrantBtn = $('#fsGrantBtn');

function showAlert(message, title = 'Notice') {
  $('#alertModalLabel').text(title);
  $('#alertModalBody').text(message);
  new bootstrap.Modal(document.getElementById('alertModal')).show();
}

// Event Listeners (jQuery)
$addConfigBtn.on('click', () => {
  new bootstrap.Modal(document.getElementById('addConfigModal')).show();
});

$('#addConfigModal').on('hidden.bs.modal', () => {
  $configFolderInput.val('');
  $configPreview.hide();
  $saveConfigBtn.prop('disabled', true);
  currentConfigFiles = null;
  currentConfigData = null;
});

$pickDirBtn.on('click', async () => {
  if (!window.showDirectoryPicker) {
    showAlert('File System Access API not supported in this browser', 'Warning');
    return;
  }
  try {
    const dirHandle = await window.showDirectoryPicker();
    const loaded = await loadFromDirectoryHandle(dirHandle);
    if (loaded) {
      currentConfigData = loaded.config;
      currentConfigData._fsHandle = dirHandle;
      currentConfigData._fsFiles = loaded.files;
      displayConfigPreview(currentConfigData);
      $saveConfigBtn.prop('disabled', false);
    } else {
      showAlert('No valid config.json found in selected folder', 'Warning');
      $saveConfigBtn.prop('disabled', true);
    }
  } catch (error) {
    console.error('Error picking directory:', error);
    showAlert('Error picking directory: ' + error.message, 'Error');
    $saveConfigBtn.prop('disabled', true);
  }
});

if ($fsGrantBtn.length) {
  $fsGrantBtn.on('click', async () => {
    await requestFsPermissionsViaGesture();
    await updateFsBanner();
  });
}

$configFolderInput.on('change', async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  try {
    currentConfigFiles = files;
    const configs = await fileWatcher.readDirectory(files);

    // For now, handle first config found
    const configKey = Object.keys(configs)[0];
    if (configKey && configs[configKey]) {
      currentConfigData = configs[configKey];
      displayConfigPreview(currentConfigData);
      $saveConfigBtn.prop('disabled', false);
    } else {
      showAlert('No valid config.json found in selected folder', 'Warning');
      $saveConfigBtn.prop('disabled', true);
    }
  } catch (error) {
    console.error('Error reading folder:', error);
    showAlert('Error reading folder: ' + error.message, 'Error');
    $saveConfigBtn.prop('disabled', true);
  }
});

$saveConfigBtn.on('click', async () => {
  if (!currentConfigData) return;

  try {
    // Generate unique config ID
    const configId = generateConfigId(currentConfigData.name);

    // Store files in extension storage (as data URLs)
    const fileStorage = {};
    if (currentConfigData._fsFiles && currentConfigData._fsFiles.length) {
      for (const f of currentConfigData._fsFiles) {
        if (f.name !== 'config.json') {
          const dataURL = await readFileHandleAsDataURL(f.handle);
          fileStorage[f.name] = dataURL;
        }
      }
    } else {
      for (const fileInfo of currentConfigData._files || []) {
        if (fileInfo.file.name !== 'config.json') {
          const dataURL = await fileWatcher.readFileAsDataURL(fileInfo.file);
          fileStorage[fileInfo.name] = dataURL;
        }
      }
    }

    // Browser API compatibility
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

    // Save files to storage
    await browserAPI.storage.local.set({
      [`userweb_files_${configId}`]: fileStorage
    });

    // Prepare config without _files
    const configToSave = { ...currentConfigData };
    delete configToSave._files;
    delete configToSave._fsFiles;
    delete configToSave._fsHandle;
    configToSave.source = currentConfigData._fsFiles ? 'fs' : 'storage';

    // Save config using promise-based message sending
    const saveResponse = await new Promise((resolve, reject) => {
      browserAPI.runtime.sendMessage({
        type: 'ADD_CONFIG',
        configId: configId,
        config: configToSave
      }, (response) => {
        if (browserAPI.runtime.lastError) {
          reject(new Error(browserAPI.runtime.lastError.message));
        } else if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error('Failed to save configuration'));
        }
      });
    });

    if (currentConfigData._fsHandle) {
      await saveHandle(configId, currentConfigData._fsHandle);
    }

    // Reload configs list
    await loadConfigs();

    // Close modal
    bootstrap.Modal.getInstance(document.getElementById('addConfigModal')).hide();
    showAlert('Configuration saved successfully!', 'Success');
  } catch (error) {
    console.error('Error saving config:', error);
    showAlert('Error saving configuration: ' + error.message, 'Error');
  }
});
$reloadBtn.on('click', async () => {
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
  try {
    await new Promise((resolve, reject) => {
      browserAPI.runtime.sendMessage({ type: 'RELOAD_CONFIGS' }, (response) => {
        if (browserAPI.runtime.lastError) {
          reject(new Error(browserAPI.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    await loadConfigs();
  } catch (error) {
    console.error('Error reloading configs:', error);
    showAlert('Error reloading configurations: ' + error.message, 'Error');
  }
});

function displayConfigPreview(config) {
  const preview = {
    name: config.name,
    matches: config.matches,
    js: config.js || [],
    css: config.css || [],
    enabled: config.enabled !== undefined ? config.enabled : true
  };

  $configPreviewContent.text(JSON.stringify(preview, null, 2));
  $configPreview.show();
}

function generateConfigId(name) {
  const timestamp = Date.now();
  const sanitized = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return `${sanitized}-${timestamp}`;
}

async function loadConfigs() {
  $configList.html('<div class="loading">Loading configurations...</div>');

  try {
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    const response = await new Promise((resolve, reject) => {
      browserAPI.runtime.sendMessage({ type: 'GET_CONFIGS' }, (response) => {
        if (browserAPI.runtime.lastError) {
          reject(new Error(browserAPI.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (response && response.success && response.configs) {
      displayConfigs(response.configs);
    } else {
      $configList.html('<div class="empty-state">No configurations found. Click \"Add Configuration\" to get started.</div>');
    }
  } catch (error) {
    console.error('Error loading configs:', error);
    $configList.html('<div class="empty-state">Error loading configurations: ' + error.message + '</div>');
  }
}

function displayConfigs(configs) {
  if (!configs || configs.length === 0) {
    $configList.html('<div class="empty-state">No configurations found. Click \"Add Configuration\" to get started.</div>');
    return;
  }

  $configList.html(configs.map(config => createConfigCard(config)).join(''));

  // Attach event listeners
  configs.forEach(config => {
    const toggleId = `toggle-${config.id}`;
    const $toggle = $(`#${toggleId}`);
    if ($toggle.length) {
      $toggle.on('change', (e) => {
        toggleConfig(config.id, e.target.checked);
      });
    }

    const deleteId = `delete-${config.id}`;
    const $deleteBtn = $(`#${deleteId}`);
    if ($deleteBtn.length) {
      $deleteBtn.on('click', () => {
        if (confirm(`Delete configuration "${config.name}"?`)) {
          deleteConfig(config.id);
        }
      });
    }
    const rescanId = `rescan-${config.id}`;
    const $rescanBtn = $(`#${rescanId}`);
    if ($rescanBtn.length) {
      $rescanBtn.on('click', () => {
        rescanConfig(config.id);
      });
    }
  });
}

function createConfigCard(config) {
  const files = [];
  if (config.js) {
    config.js.forEach(item => {
      const name = typeof item === 'string' ? item : item.path;
      files.push({ name, type: 'js' });
    });
  }
  if (config.css) {
    config.css.forEach(item => {
      const name = typeof item === 'string' ? item : item.path;
      files.push({ name, type: 'css' });
    });
  }

  return `
    <div class="card config-card ${config.enabled ? '' : 'disabled'} mb-3">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start mb-3">
          <div>
            <h5 class="card-title h6 mb-1 text-emphasis">${escapeHtml(config.name)}</h5>
            ${config.description ? `<p class="card-text small text-secondary mb-0">${escapeHtml(config.description)}</p>` : ''}
          </div>
          <div class="d-flex align-items-center gap-2">
            <div class="form-check form-switch me-2">
              <input class="form-check-input" type="checkbox" role="switch" id="toggle-${config.id}" ${config.enabled ? 'checked' : ''}>
            </div>
            <button class="btn btn-outline-secondary btn-sm" id="rescan-${config.id}" title="Rescan folder">Rescan</button>
            <button class="btn btn-outline-danger btn-sm" id="delete-${config.id}" title="Delete configuration">Delete</button>
          </div>
        </div>
        
        <div class="config-details border-top pt-3">
          <div class="row mb-2">
            <div class="col-sm-2 small fw-bold text-body-secondary">Matches:</div>
            <div class="col-sm-10">
              <div class="d-flex flex-wrap gap-1">
                ${config.matches.map(m => `<span class="badge rounded-pill text-bg-light border">${escapeHtml(m)}</span>`).join('')}
              </div>
            </div>
          </div>
          <div class="row">
            <div class="col-sm-2 small fw-bold text-body-secondary">Files:</div>
            <div class="col-sm-10">
              <div class="d-flex flex-wrap gap-1">
                ${files.map(f => `
                  <div class="badge text-bg-secondary p-1 px-2 d-flex align-items-center gap-1 fw-normal">
                    <span>${f.type === 'js' ? '📜' : '🎨'}</span>
                    <span>${escapeHtml(f.name)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function toggleConfig(configId, enabled) {
  try {
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    await new Promise((resolve, reject) => {
      browserAPI.runtime.sendMessage({
        type: 'TOGGLE_CONFIG',
        configId: configId,
        enabled: enabled
      }, (response) => {
        if (browserAPI.runtime.lastError) {
          reject(new Error(browserAPI.runtime.lastError.message));
        } else if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error('Failed to toggle configuration'));
        }
      });
    });

    // Reload to reflect changes
    await loadConfigs();
  } catch (error) {
    console.error('Error toggling config:', error);
    showAlert('Error toggling configuration: ' + error.message, 'Error');
  }
}

async function deleteConfig(configId) {
  try {
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    await new Promise((resolve, reject) => {
      browserAPI.runtime.sendMessage({
        type: 'DELETE_CONFIG',
        configId: configId
      }, (response) => {
        if (browserAPI.runtime.lastError) {
          reject(new Error(browserAPI.runtime.lastError.message));
        } else if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error('Failed to delete configuration'));
        }
      });
    });

    // Delete stored files
    await browserAPI.storage.local.remove(`userweb_files_${configId}`);
    await deleteHandle(configId);

    // Reload list
    await loadConfigs();
  } catch (error) {
    console.error('Error deleting config:', error);
    showAlert('Error deleting configuration: ' + error.message, 'Error');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load configs on page load
$(function () {
  loadConfigs();
  updateFsBanner();
});

async function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('userweb_fs', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandle(configId, handle) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, configId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function listHandles() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readonly');
    const store = tx.objectStore('handles');
    const req = store.openCursor();
    const entries = [];
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        entries.push({ configId: cursor.key, handle: cursor.value });
        cursor.continue();
      } else {
        resolve(entries);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

async function ensureHandlePermission(handle) {
  try {
    if (!handle || typeof handle.queryPermission !== 'function' || typeof handle.requestPermission !== 'function') return false;
    const q = await handle.queryPermission({ mode: 'read' });
    if (q === 'granted') return true;
    const r = await handle.requestPermission({ mode: 'read' });
    return r === 'granted';
  } catch (_) {
    return false;
  }
}

async function requestFsPermissionsViaGesture() {
  try {
    const entries = await listHandles();
    console.log('Found handles for permission request:', entries.length);
    if (entries.length) {
      for (const entry of entries) {
        console.log('Requesting permission for configId:', entry.configId);
        const granted = await ensureHandlePermission(entry.handle);
        console.log('Permission for', entry.configId, 'granted:', granted);
      }
      return;
    }
    showAlert('No folder access saved. Use "Pick Folder" in the Add Configuration modal.', 'Info');
  } catch (err) {
    console.error('Error requesting permissions:', err);
  }
}

async function updateFsBanner() {
  try {
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    const resp = await new Promise((resolve) => {
      browserAPI.runtime.sendMessage({ type: 'GET_CONFIGS' }, (response) => {
        if (browserAPI.runtime.lastError) {
          resolve({ success: false, configs: [] });
        } else {
          resolve(response || { success: true, configs: [] });
        }
      });
    });
    const configs = (resp && resp.success && Array.isArray(resp.configs)) ? resp.configs : [];
    const fsConfigs = configs.filter(c => c && c.source === 'fs');
    let needs = false;
    if (fsConfigs.length === 0) {
      needs = false;
    } else {
      for (const cfg of fsConfigs) {
        try {
          const handle = await getHandle(cfg.id);
          if (!handle) {
            needs = true;
            break;
          }
          const q = await handle.queryPermission({ mode: 'read' });
          if (q !== 'granted') {
            needs = true;
            break;
          }
        } catch (_) {
          needs = true;
          break;
        }
      }
    }
    if ($fsBanner.length) {
      if (needs) {
        $fsBanner.removeAttr('hidden');
      } else {
        $fsBanner.attr('hidden', 'hidden');
      }
    }
  } catch (err) {
    console.error('Error updating FS banner:', err);
    if ($fsBanner.length) {
      $fsBanner.attr('hidden', 'hidden');
    }
  }
}

async function getHandle(configId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get(configId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteHandle(configId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').delete(configId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function readFileHandleAsDataURL(fileHandle) {
  const file = await fileHandle.getFile();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

async function readFileHandleAsText(fileHandle) {
  const file = await fileHandle.getFile();
  return file.text();
}

async function loadFromDirectoryHandle(dirHandle) {
  const files = [];
  let config = null;
  try {
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
  } catch (e) {
    return null;
  }
}

async function rescanConfig(configId) {
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
  try {
    const dirHandle = await getHandle(configId);
    if (!dirHandle) {
      showAlert('No folder access saved for this configuration. Re-add using directory picker.', 'Warning');
      return;
    }
    const loaded = await loadFromDirectoryHandle(dirHandle);
    if (!loaded) {
      showAlert('Failed to read folder. Please re-authorize access.', 'Warning');
      return;
    }
    const fileStorage = {};
    for (const f of loaded.files) {
      if (f.name !== 'config.json') {
        const dataURL = await readFileHandleAsDataURL(f.handle);
        fileStorage[f.name] = dataURL;
      }
    }
    await browserAPI.storage.local.set({
      [`userweb_files_${configId}`]: fileStorage
    });
    const configToSave = { ...loaded.config, id: configId, source: 'fs' };
    await new Promise((resolve, reject) => {
      browserAPI.runtime.sendMessage({
        type: 'ADD_CONFIG',
        configId: configId,
        config: configToSave
      }, (response) => {
        if (browserAPI.runtime.lastError) {
          reject(new Error(browserAPI.runtime.lastError.message));
        } else if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error('Failed to update configuration'));
        }
      });
    });
    await loadConfigs();
    showAlert('Configuration rescan completed', 'Success');
  } catch (error) {
    console.error('Error rescanning config:', error);
    showAlert('Error rescanning configuration: ' + error.message, 'Error');
  }
}

// Theme toggle listener
$('#themeToggle').on('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-bs-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-bs-theme', newTheme);
  localStorage.setItem('userweb-theme', newTheme);
});

