/**
 * dashboard.js — Add Config Modal (jQuery)
 *
 * Handles the add-config modal: file picker, directory picker, preview, save.
 * Dispatches a 'usersite:config-saved' CustomEvent that App.vue listens for.
 *
 * Vue app is in widgets/ — built by esbuild → web/dashboard.iife.js
 * Loaded as type="module" after vendor.js (jQuery + Bootstrap available as globals).
 */

import {
  addConfig,
  saveConfigFiles,
} from './lib/dashboard-service.js';

import {
  loadFromDirectoryHandle,
  createVirtualHandle,
  persistHandle,
  readFilesAsDataURLs,
} from './lib/fs-service.js';

$(function () {
  let _currentConfigData = null;

  const $configFolderInput = $('#configFolder');
  const $configPreview = $('#configPreview');
  const $configPreviewContent = $('#configPreviewContent');
  const $saveConfigBtn = $('#saveConfigBtn');

  // ── Reset on modal close ──────────────────────────────────────────────────

  $('#addConfigModal').on('hidden.bs.modal', () => {
    $configFolderInput.val('');
    $configPreview.attr('hidden', '');
    $saveConfigBtn.prop('disabled', true);
    _currentConfigData = null;
  });

  // ── File input (webkitdirectory — virtual handle, no persistent access) ───

  $configFolderInput.on('change', async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const dirHandle = createVirtualHandle(files);
      const loaded = await loadFromDirectoryHandle(dirHandle);
      if (loaded) {
        _currentConfigData = { ...loaded.config, _fsHandle: dirHandle, _fsFiles: loaded.files };
        _showPreview(_currentConfigData);
        $saveConfigBtn.prop('disabled', false);
      } else {
        _showAlert('No valid config.json found in selected folder', 'Warning');
        $saveConfigBtn.prop('disabled', true);
      }
    } catch (err) {
      console.error('Error reading folder:', err);
      _showAlert('Error reading folder: ' + err.message, 'Error');
      $saveConfigBtn.prop('disabled', true);
    }
  });

  // ── Directory picker (File System Access API — persistent handle) ─────────

  $('#pickDirBtn').on('click', async () => {
    if (!window.showDirectoryPicker) {
      _showAlert('File System Access API not supported in this browser', 'Warning');
      return;
    }
    try {
      const dirHandle = await window.showDirectoryPicker();
      const loaded = await loadFromDirectoryHandle(dirHandle);
      if (loaded) {
        _currentConfigData = { ...loaded.config, _fsHandle: dirHandle, _fsFiles: loaded.files };
        _showPreview(_currentConfigData);
        $saveConfigBtn.prop('disabled', false);
      } else {
        _showAlert('No valid config.json found in selected folder', 'Warning');
        $saveConfigBtn.prop('disabled', true);
      }
    } catch (err) {
      console.error('Error picking directory:', err);
      _showAlert('Error picking directory: ' + err.message, 'Error');
      $saveConfigBtn.prop('disabled', true);
    }
  });

  // ── Save config ───────────────────────────────────────────────────────────

  $saveConfigBtn.on('click', async () => {
    if (!_currentConfigData) return;
    try {
      const configId = toId(_currentConfigData.name);
      const fileStorage = await readFilesAsDataURLs(_currentConfigData._fsFiles || []);
      await saveConfigFiles(configId, fileStorage);

      const configToSave = { ..._currentConfigData };
      delete configToSave._files;
      delete configToSave._fsFiles;
      delete configToSave._fsHandle;
      configToSave.source = _currentConfigData._fsFiles ? 'fs' : 'storage';

      await addConfig(configId, configToSave);

      if (_currentConfigData._fsHandle) {
        await persistHandle(configId, _currentConfigData._fsHandle);
      }

      // Notify Vue app (App.vue listens for this event)
      document.dispatchEvent(new CustomEvent('usersite:config-saved', {
        detail: { configId, config: configToSave },
      }));

      bootstrap.Modal.getInstance(document.getElementById('addConfigModal')).hide();
      _showAlert('Configuration saved successfully!', 'Success');
    } catch (err) {
      console.error('Error saving config:', err);
      _showAlert('Error saving configuration: ' + err.message, 'Error');
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _showPreview(config) {
    const preview = {
      name: config.name,
      matches: config.matches,
      js: config.js || [],
      css: config.css || [],
      enabled: config.enabled ?? true,
    };
    $configPreviewContent.text(JSON.stringify(preview, null, 2));
    $configPreview.removeAttr('hidden');
  }

  function _showAlert(message, title = 'Notice') {
    $('#alertModalLabel').text(title);
    $('#alertModalBody').text(message);
    new bootstrap.Modal(document.getElementById('alertModal')).show();
  }
});
