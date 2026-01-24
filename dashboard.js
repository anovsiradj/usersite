// Dashboard script for UserWeb extension

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

// DOM Elements
const configList = document.getElementById('configList');
const addConfigBtn = document.getElementById('addConfigBtn');
const reloadBtn = document.getElementById('reloadBtn');
const addConfigModal = document.getElementById('addConfigModal');
const closeModal = document.getElementById('closeModal');
const cancelBtn = document.getElementById('cancelBtn');
const pickDirBtn = document.getElementById('pickDirBtn');
const configFolderInput = document.getElementById('configFolder');
const configPreview = document.getElementById('configPreview');
const configPreviewContent = document.getElementById('configPreviewContent');
const saveConfigBtn = document.getElementById('saveConfigBtn');

// Event Listeners
addConfigBtn.addEventListener('click', () => {
  addConfigModal.classList.add('show');
});

closeModal.addEventListener('click', closeModalHandler);
cancelBtn.addEventListener('click', closeModalHandler);

pickDirBtn.addEventListener('click', async () => {
  if (!window.showDirectoryPicker) {
    alert('File System Access API not supported in this browser');
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
      saveConfigBtn.disabled = false;
    } else {
      alert('No valid config.json found in selected folder');
      saveConfigBtn.disabled = true;
    }
  } catch (error) {
    console.error('Error picking directory:', error);
    alert('Error picking directory: ' + error.message);
    saveConfigBtn.disabled = true;
  }
});

configFolderInput.addEventListener('change', async (e) => {
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
      saveConfigBtn.disabled = false;
    } else {
      alert('No valid config.json found in selected folder');
      saveConfigBtn.disabled = true;
    }
  } catch (error) {
    console.error('Error reading folder:', error);
    alert('Error reading folder: ' + error.message);
    saveConfigBtn.disabled = true;
  }
});

saveConfigBtn.addEventListener('click', async () => {
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
    
    // Close modal and reset
    closeModalHandler();
    alert('Configuration saved successfully!');
  } catch (error) {
    console.error('Error saving config:', error);
    alert('Error saving configuration: ' + error.message);
  }
});

reloadBtn.addEventListener('click', async () => {
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
    alert('Error reloading configurations: ' + error.message);
  }
});

function closeModalHandler() {
  addConfigModal.classList.remove('show');
  configFolderInput.value = '';
  configPreview.style.display = 'none';
  saveConfigBtn.disabled = true;
  currentConfigFiles = null;
  currentConfigData = null;
}

function displayConfigPreview(config) {
  const preview = {
    name: config.name,
    matches: config.matches,
    js: config.js || [],
    css: config.css || [],
    jquery: config.jquery,
    enabled: config.enabled !== undefined ? config.enabled : true
  };
  
  configPreviewContent.textContent = JSON.stringify(preview, null, 2);
  configPreview.style.display = 'block';
}

function generateConfigId(name) {
  const timestamp = Date.now();
  const sanitized = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return `${sanitized}-${timestamp}`;
}

async function loadConfigs() {
  configList.innerHTML = '<div class="loading">Loading configurations...</div>';

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
      configList.innerHTML = '<div class="empty-state">No configurations found. Click "Add Configuration" to get started.</div>';
    }
  } catch (error) {
    console.error('Error loading configs:', error);
    configList.innerHTML = '<div class="empty-state">Error loading configurations: ' + error.message + '</div>';
  }
}

function displayConfigs(configs) {
  if (configs.length === 0) {
    configList.innerHTML = '<div class="empty-state">No configurations found. Click "Add Configuration" to get started.</div>';
    return;
  }

  configList.innerHTML = configs.map(config => createConfigCard(config)).join('');
  
  // Attach event listeners
  configs.forEach(config => {
    const toggleId = `toggle-${config.id}`;
    const toggle = document.getElementById(toggleId);
    if (toggle) {
      toggle.addEventListener('change', (e) => {
        toggleConfig(config.id, e.target.checked);
      });
    }

    const deleteId = `delete-${config.id}`;
    const deleteBtn = document.getElementById(deleteId);
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Delete configuration "${config.name}"?`)) {
          deleteConfig(config.id);
        }
      });
    }
    const rescanId = `rescan-${config.id}`;
    const rescanBtn = document.getElementById(rescanId);
    if (rescanBtn) {
      rescanBtn.addEventListener('click', () => {
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
    <div class="config-card ${config.enabled ? '' : 'disabled'}">
      <div class="config-header">
        <div>
          <div class="config-title">${escapeHtml(config.name)}</div>
          ${config.description ? `<div class="config-description">${escapeHtml(config.description)}</div>` : ''}
        </div>
        <div class="config-controls">
          <label class="toggle-switch">
            <input type="checkbox" id="toggle-${config.id}" ${config.enabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
          <button class="btn btn-secondary btn-small" id="rescan-${config.id}">Rescan</button>
          <button class="btn btn-danger btn-small" id="delete-${config.id}">Delete</button>
        </div>
      </div>
      <div class="config-details">
        <div class="config-detail-row">
          <span class="config-detail-label">Matches:</span>
          <span class="config-detail-value">
            <div class="config-match-patterns">
              ${config.matches.map(m => `<span class="match-pattern">${escapeHtml(m)}</span>`).join('')}
            </div>
          </span>
        </div>
        <div class="config-detail-row">
          <span class="config-detail-label">Files:</span>
          <span class="config-detail-value">
            <div class="file-list">
              ${files.map(f => `
                <div class="file-item">
                  <span class="file-icon">${f.type === 'js' ? '📜' : '🎨'}</span>
                  <span>${escapeHtml(f.name)}</span>
                </div>
              `).join('')}
            </div>
          </span>
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
    alert('Error toggling configuration: ' + error.message);
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
    alert('Error deleting configuration: ' + error.message);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load configs on page load
loadConfigs();

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
      alert('No folder access saved for this configuration. Re-add using directory picker.');
      return;
    }
    const loaded = await loadFromDirectoryHandle(dirHandle);
    if (!loaded) {
      alert('Failed to read folder. Please re-authorize access.');
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
    alert('Configuration rescan completed');
  } catch (error) {
    console.error('Error rescanning config:', error);
    alert('Error rescanning configuration: ' + error.message);
  }
}

