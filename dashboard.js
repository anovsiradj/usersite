// Dashboard script for UserSite extension
import { FileWatcher } from './lib/file-watcher.js';
import { createHandleFromFiles } from './lib/fs-adapter.js';
import {
  saveHandle,
  getHandle,
  listHandles,
  deleteHandle,
  readFileHandleAsDataURL,
  readFileHandleAsText
} from './lib/storage-helper.js';
import { CacheManager } from './lib/cache-manager.js';

// Theme management
(function () {
  const savedTheme = localStorage.getItem('usersite-theme');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const theme = savedTheme || systemTheme;
  document.documentElement.setAttribute('data-bs-theme', theme);
})();

const fileWatcher = new FileWatcher();
const cacheManager = new CacheManager();
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
      console.log('Successfully loaded config from folder:', loaded.config.name);
      currentConfigData = loaded.config;
      currentConfigData._fsHandle = dirHandle;
      currentConfigData._fsFiles = loaded.files;
      displayConfigPreview(currentConfigData);
      $saveConfigBtn.prop('disabled', false);
    } else {
      console.warn('Folder selection failed validation: no config.json or other error');
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
  const files = e.target.files;
  if (!files || files.length === 0) return;

  try {
    currentConfigFiles = Array.from(files);

    // Use the FS Adapter to create a Virtual Handle
    const dirHandle = createHandleFromFiles(files);

    // Now we can use the same loader logic!
    const loaded = await loadFromDirectoryHandle(dirHandle);

    if (loaded) {
      console.log('Successfully loaded config from virtual folder:', loaded.config.name);
      currentConfigData = loaded.config;
      // Store the virtual handle (saveHandle specific logic will skip persisting it)
      currentConfigData._fsHandle = dirHandle;
      currentConfigData._fsFiles = loaded.files;
      displayConfigPreview(currentConfigData);
      $saveConfigBtn.prop('disabled', false);

      // Update UI to show this is non-persistent
      // Maybe show a hint via alert or console?
    } else {
      console.warn('Virtual folder selection failed validation: no config.json or other error');
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
    const configId = toId(currentConfigData.name);
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

    // Save files to storage
    await browser.storage.local.set({
      [`usersite_files_${configId}`]: fileStorage
    });

    const configToSave = { ...currentConfigData };
    delete configToSave._files;
    delete configToSave._fsFiles;
    delete configToSave._fsHandle;
    configToSave.source = currentConfigData._fsFiles ? 'fs' : 'storage';

    // Save config
    const response = await browser.runtime.sendMessage({
      type: 'ADD_CONFIG',
      configId: configId,
      config: configToSave
    });
    if (!response || !response.success) {
      const errorMsg = response && response.error ? response.error : 'Failed to save configuration';
      throw new Error(errorMsg);
    }

    if (currentConfigData._fsHandle) {
      await saveHandle(configId, currentConfigData._fsHandle);
    }

    await loadConfigs();

    // Start CDN downloads (async, show progress in UI)
    downloadCdnAssets(configId, configToSave);

    bootstrap.Modal.getInstance(document.getElementById('addConfigModal')).hide();
    showAlert('Configuration saved successfully!', 'Success');
  } catch (error) {
    console.error('Error saving config:', error);
    showAlert('Error saving configuration: ' + error.message, 'Error');
  }
});
$reloadBtn.on('click', async () => {
  try {
    await browser.runtime.sendMessage({ type: 'RELOAD_CONFIGS' });
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


async function loadConfigs() {
  $configList.html('<div class="loading">Loading configurations...</div>');

  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_CONFIGS' });

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

function populateTemplate($el, data) {
  // Process both the element itself and its descendants
  $el.find('[data-template-text]').add($el.filter('[data-template-text]')).each(function () {
    const key = $(this).data('template-text');
    if (data[key] !== undefined) {
      $(this).text(data[key]);
      if (!data[key] && $(this).hasClass('small')) $(this).hide(); // Hide empty description
    }
  });
  $el.find('[data-template-html]').add($el.filter('[data-template-html]')).each(function () {
    const key = $(this).data('template-html');
    if (data[key] !== undefined) $(this).html(data[key]);
  });
}

function displayConfigs(configs) {
  if (!configs || configs.length === 0) {
    $configList.html('<div class="empty-state">No configurations found. Click \"Add Configuration\" to get started.</div>');
    return;
  }

  $configList.empty();
  configs.forEach(config => {
    const $card = createConfigCard(config);
    $configList.append($card);

    // Attach event listeners
    $card.find(`.config-toggle`).on('change', (e) => {
      e.stopPropagation();
      toggleConfig(config.id, e.target.checked);
    });

    $card.find(`.rescan-btn`).on('click', (e) => {
      e.stopPropagation();
      rescanConfig(config.id);
    });

    $card.find(`.delete-btn`).on('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete configuration "${config.name}"?`)) {
        deleteConfig(config.id);
      }
    });

    $card.find('.header-actions').on('click', (e) => {
      e.stopPropagation();
    });

    $card.find('.source-badge').on('click', function (e) {
      e.stopPropagation();
      const fileName = $(this).data('file');
      viewSource(config.id, fileName);
    });

    // Custom toggle logic
    $card.find('.config-card-header').on('click', function () {
      const $body = $card.find('.config-card-body');
      const $arrow = $card.find('.toggle-arrow');
      const isVisible = $body.is(':visible');

      if (isVisible) {
        $body.slideUp(200);
        $arrow.css('transform', 'rotate(0deg)');
      } else {
        $body.slideDown(200);
        $arrow.css('transform', 'rotate(-180deg)');
      }
    });
  });
}

function createConfigCard(config) {
  const $template = $($('#configCardTemplate').html());

  // Clone and populate badges
  const $matchTpl = $('#matchBadgeTemplate');
  const $sourceTpl = $('#sourceBadgeTemplate');

  const $matchesContainer = $('<div></div>');
  const matches = Array.isArray(config.matches) ? config.matches : (config.matches ? [config.matches] : []);
  matches.forEach(m => {
    const $badge = $($matchTpl.html());
    populateTemplate($badge, { match: m });
    $matchesContainer.append($badge).append(' ');
  });

  const files = [];
  const processItems = (items, type) => {
    if (!Array.isArray(items)) return;
    items.forEach((item, index) => {
      const name = typeof item === 'string' ? item : (item.file || null);
      if (name) {
        files.push({ name, type, index, isUrl: isFileHttp(name) });
      } else if (item.code) {
        files.push({ name: `Inline ${type === 'js' ? 'Script' : 'Style'}`, type, index, isInline: true, code: item.code });
      }
    });
  };

  processItems(config.js, 'js');
  processItems(config.css, 'css');

  const $sourcesContainer = $('<div></div>');
  files.forEach(f => {
    const $badge = $($sourceTpl.html());
    const fileName = f.isInline ? `inline-${f.type}-${f.index}` : f.name;
    $badge.attr('data-file', fileName);
    if (f.isInline) $badge.data('code', f.code);
    if (f.isUrl) {
      $badge.addClass('cdn-badge').attr('data-url', f.name);
      // placeholder for progress
      const $progress = $('<span class="cdn-progress small ms-1" style="display:none; font-size: 0.6rem; opacity: 0.8;">(0%)</span>');
      $badge.append($progress);
    }

    populateTemplate($badge, {
      icon: f.isUrl ? '🌐' : (f.type === 'js' ? '📜' : '🎨'),
      name: f.name
    });
    $sourcesContainer.append($badge).append(' ');
  });

  // Populate main card
  populateTemplate($template, {
    name: config.name,
    description: config.description || '',
    matches: $matchesContainer.html(),
    sources: $sourcesContainer.html() || '<span class="text-secondary small">No sources defined</span>'
  });

  if (!config.enabled) $template.addClass('disabled');
  $template.find('.config-toggle').prop('checked', !!config.enabled);

  return $template;
}

async function viewSource(configId, fileName) {
  const $modal = $('#sourceViewerModal');
  const $content = $('#sourceContent');
  const $title = $('#sourceViewerModalLabel');

  $title.text(`Source: ${fileName}`);
  $content.text('Loading...');

  const modalObj = new bootstrap.Modal($modal[0]);
  modalObj.show();

  // Check if it's inline code passed via data
  const $clickedBadge = $configList.find(`.source-badge[data-file="${fileName}"]`);
  const inlineCode = $clickedBadge.data('code');
  if (inlineCode) {
    $content.text(inlineCode);
    return;
  }

  try {
    // First try to see if it's an FS handle based config
    const handle = await getHandle(configId);
    if (handle) {
      try {
        const fileHandle = await handle.getFileHandle(fileName);
        const text = await readFileHandleAsText(fileHandle);
        $content.text(text);
        return;
      } catch (e) {
        console.warn('Could not read from FS handle directly, falling back to storage', e);
      }
    }

    const storageKey = `usersite_files_${configId}`;
    const result = await browser.storage.local.get([storageKey]);
    const files = result[storageKey];

    if (files && files[fileName]) {
      const dataURL = files[fileName];
      const base64Content = dataURL.split(',')[1];
      const text = atob(base64Content);
      $content.text(text);
      return;
    }

    // Try OPFS Cache (CDN)
    const cachedContent = await cacheManager.getCachedContent(configId, fileName);
    if (cachedContent) {
      $content.text(cachedContent);
    } else {
      $content.text('Error: Source file not found in storage or cache.');
    }
  } catch (error) {
    console.error('Error viewing source:', error);
    $content.text('Error loading source: ' + error.message);
  }
}

async function toggleConfig(configId, enabled) {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'TOGGLE_CONFIG',
      configId: configId,
      enabled: enabled
    });

    if (!response || !response.success) {
      throw new Error('Failed to toggle configuration');
    }

    // Reload to reflect changes
    await loadConfigs();
  } catch (error) {
    console.error('Error toggling config:', error);
    showAlert('Error toggling configuration: ' + error.message, 'Error');
  }
}

async function deleteConfig(configId) {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'DELETE_CONFIG',
      configId: configId
    });

    if (!response || !response.success) {
      throw new Error('Failed to delete configuration');
    }

    // Delete stored files
    await browser.storage.local.remove(`usersite_files_${configId}`);
    await deleteHandle(configId);

    // Reload list
    await loadConfigs();
  } catch (error) {
    console.error('Error deleting config:', error);
    showAlert('Error deleting configuration: ' + error.message, 'Error');
  }
}


// Load configs on page load
$(async function () {
  try {
    await cacheManager.init();
  } catch (e) {
    console.warn('OPFS not initialized on startup:', e);
  }
  loadConfigs();
  updateFsBanner();
});


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
    let resp;
    try {
      resp = await browser.runtime.sendMessage({ type: 'GET_CONFIGS' });
    } catch (e) {
      resp = { success: false, configs: [] };
    }
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
    if (!config) {
      console.warn('No config.json found in handle:', dirHandle.name);
      return null;
    }
    return { config, files };
  } catch (e) {
    console.error('Error loading from directory handle:', e);
    return null;
  }
}

async function rescanConfig(configId) {
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
    await browser.storage.local.set({
      [`usersite_files_${configId}`]: fileStorage
    });

    const configToSave = { ...loaded.config, id: configId, source: 'fs' };
    const response = await browser.runtime.sendMessage({
      type: 'ADD_CONFIG',
      configId: configId,
      config: configToSave
    });

    if (!response || !response.success) {
      throw new Error('Failed to update configuration');
    }

    await loadConfigs();

    // Start downloading CDN assets and show progress
    await downloadCdnAssets(configId, configToSave);

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
  localStorage.setItem('usersite-theme', newTheme);
});

async function downloadCdnAssets(configId, config) {
  const cdnAssets = [];
  const collect = (items) => {
    if (!Array.isArray(items)) return;
    items.forEach(item => {
      const url = typeof item === 'string' ? item : item.file;
      if (url && isFileHttp(url)) cdnAssets.push(url);
    });
  };
  collect(config.js);
  collect(config.css);

  if (cdnAssets.length === 0) return;

  // Find the card for this config in the DOM
  // Note: we might need a better way to identify the specific card if config IDs are not in DOM attributes
  // But each config card has a name and we can search for badges.

  for (const url of cdnAssets) {
    const $badge = $configList.find(`.cdn-badge[data-url="${url}"]`).filter(function () {
      // Ideally we'd match the specific card, but for now we'll match all with this URL 
      // (could be multiple configs using same CDN)
      return true;
    });

    const $progress = $badge.find('.cdn-progress');
    $progress.show();

    try {
      await cacheManager.cacheUrl(configId, url, (percent) => {
        $progress.text(`(${percent}%)`);
      });
      $progress.text('(Cached)');
      setTimeout(() => $progress.fadeOut(), 3000);
    } catch (error) {
      console.error(`Failed to cache ${url}:`, error);
      $progress.text('(Error)').addClass('text-danger');
    }
  }
}

