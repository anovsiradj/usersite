<template>
  <div class="container-md py-4">

    <!-- Header -->
    <header class="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom">
      <div>
        <h1 class="h3 mb-1 text-emphasis">UserSite</h1>
        <p class="text-secondary small mb-0">Minimalist script &amp; style injector</p>
      </div>
      <button class="theme-toggle" title="Toggle color mode" @click="toggleTheme">🌓</button>
    </header>

    <!-- FS Permission Banner -->
    <div v-if="fsBannerVisible"
         class="alert alert-warning d-flex align-items-center justify-content-between mb-4 border-2 shadow-sm"
         role="alert">
      <span class="small">
        extension does not have access to your folders. grant access to enable rescan.
      </span>
      <button class="btn btn-success btn-sm px-3 fw-bold" @click="grantFsAccess">
        Grant Access
      </button>
    </div>

    <!-- Action Bar -->
    <div class="d-flex justify-content-center gap-2 mb-4">
      <button class="btn btn-primary d-flex align-items-center gap-2 px-4 shadow-sm"
              data-bs-toggle="modal" data-bs-target="#addConfigModal">
        <span class="fs-5 lh-1">+</span> Add Configuration
      </button>
      <button class="btn btn-outline-secondary d-flex align-items-center gap-2 shadow-sm"
              :disabled="loading"
              @click="reloadAll">
        <span>↻</span> Reload All
      </button>
    </div>

    <!-- Config List -->
    <div class="shadow-sm border rounded overflow-hidden">

      <div v-if="loading" class="text-center py-5 text-secondary">
        <div class="spinner-border spinner-border-sm mb-2" role="status"></div>
        <div class="small">Loading configurations...</div>
      </div>

      <div v-else-if="configs.length === 0" class="text-center py-5 text-secondary small">
        No configurations found. Click "Add Configuration" to get started.
      </div>

      <ConfigCard
        v-else
        v-for="config in configs"
        :key="config.id"
        :config="config"
        :cdn-progress="cdnProgress[config.id] || {}"
        @toggle="onToggle"
        @delete="onDelete"
        @rescan="onRescan"
        @view-source="onViewSource"
      />

    </div>

    <!-- Log Panel -->
    <LogPanel :logs="logs" @clear="onClearLogs" />

  </div>
</template>

<script>
import { defineComponent } from 'vue';
import ConfigCard from './ConfigCard.vue';
import LogPanel from './LogPanel.vue';
import { CacheManager } from '../lib/cache-manager.js';
import {
  fetchConfigs,
  addConfig,
  toggleConfig,
  deleteConfig,
  reloadConfigs,
  fetchLogs,
  clearLogs,
  saveConfigFiles,
  readStorageFile,
  logToBackground,
} from '../lib/dashboard-service.js';
import {
  loadFromDirectoryHandle,
  getPersistedHandle,
  listPersistedHandles,
  deleteHandle,
  readFilesAsDataURLs,
  readFileAsText,
  ensureHandlePermission,
  checkFsBannerNeeded,
} from '../lib/fs-service.js';

const cacheManager = new CacheManager();

export default defineComponent({
  name: 'App',
  components: { ConfigCard, LogPanel },

  data() {
    return {
      configs: [],
      logs: [],
      loading: true,
      fsBannerVisible: false,
      // { [configId]: { [url]: '42%' | '(Cached)' | '(Error)' } }
      cdnProgress: {},
    };
  },

  async mounted() {
    try {
      await cacheManager.init();
    } catch (e) {
      console.warn('OPFS not available:', e);
    }

    await this.loadConfigs();
    await this.loadLogs();

    // Listen for config-saved events dispatched by the add-config modal (jQuery)
    document.addEventListener('usersite:config-saved', async (e) => {
      await this.loadConfigs();
      await this.downloadCdnAssets(e.detail.configId, e.detail.config);
    });
  },

  methods: {
    // ── Config operations ────────────────────────────────────────────────────

    async loadConfigs() {
      this.loading = true;
      try {
        this.configs = await fetchConfigs();
        this.fsBannerVisible = await checkFsBannerNeeded(this.configs);
        // Re-cache CDN assets for all enabled configs in the background.
        // This ensures assets are available after extension reload or dashboard refresh.
        for (const config of this.configs) {
          if (config.enabled) {
            this.downloadCdnAssets(config.id, config); // intentionally not awaited
          }
        }
      } catch (e) {
        console.error('Error loading configs:', e);
        this.showAlert('Error loading configurations: ' + e.message, 'Error');
      } finally {
        this.loading = false;
      }
    },

    async onToggle(configId, enabled) {
      try {
        await toggleConfig(configId, enabled);
        await this.loadConfigs();
      } catch (e) {
        console.error('Error toggling config:', e);
        this.showAlert('Error toggling configuration: ' + e.message, 'Error');
      }
    },

    async onDelete(configId) {
      try {
        await deleteConfig(configId);
        await deleteHandle(configId);
        await cacheManager.clearConfigCache(configId);
        await this.loadConfigs();
      } catch (e) {
        console.error('Error deleting config:', e);
        this.showAlert('Error deleting configuration: ' + e.message, 'Error');
      }
    },

    async onRescan(configId) {
      try {
        const dirHandle = await getPersistedHandle(configId);
        if (!dirHandle) {
          this.showAlert('No folder access saved for this configuration. Re-add using directory picker.', 'Warning');
          return;
        }
        const hasPermission = await ensureHandlePermission(dirHandle);
        if (!hasPermission) {
          this.showAlert('Permission denied. Please click "Grant Access" to re-authorize folder access.', 'Warning');
          return;
        }
        const loaded = await loadFromDirectoryHandle(dirHandle);
        if (!loaded) {
          this.showAlert('Failed to read folder. config.json not found.', 'Warning');
          return;
        }
        const fileStorage = await readFilesAsDataURLs(loaded.files);
        await saveConfigFiles(configId, fileStorage);

        const configToSave = { ...loaded.config, id: configId, source: 'fs' };
        await addConfig(configId, configToSave);
        await this.loadConfigs();
        await this.downloadCdnAssets(configId, configToSave);
        this.showAlert('Configuration rescan completed', 'Success');
      } catch (e) {
        console.error('Error rescanning config:', e);
        this.showAlert('Error rescanning configuration: ' + e.message, 'Error');
      }
    },

    async reloadAll() {
      try {
        await reloadConfigs();
        await this.loadConfigs();
      } catch (e) {
        console.error('Error reloading configs:', e);
        this.showAlert('Error reloading configurations: ' + e.message, 'Error');
      }
    },

    // ── Source viewer ────────────────────────────────────────────────────────

    async onViewSource(configId, fileName, inlineCode) {
      const $title = $('#sourceViewerModalLabel');
      const $content = $('#sourceContent');

      $title.text(`Source: ${fileName}`);
      $content.text('Loading...');
      new bootstrap.Modal(document.getElementById('sourceViewerModal')).show();

      if (inlineCode) {
        $content.text(inlineCode);
        return;
      }

      try {
        const handle = await getPersistedHandle(configId);
        if (handle) {
          try {
            const text = await readFileAsText(handle, fileName);
            $content.text(text);
            return;
          } catch (_) { /* fall through */ }
        }

        const text = await readStorageFile(configId, fileName);
        if (text !== null) {
          $content.text(text);
          return;
        }

        const cached = await cacheManager.getCachedContent(configId, fileName);
        $content.text(cached ?? 'Error: Source file not found in storage or cache.');
      } catch (e) {
        console.error('Error viewing source:', e);
        $content.text('Error loading source: ' + e.message);
      }
    },

    // ── CDN asset download ───────────────────────────────────────────────────

    async downloadCdnAssets(configId, config) {
      const urls = [];
      const collect = (items) => {
        if (!Array.isArray(items)) return;
        items.forEach(item => {
          const url = typeof item === 'string' ? item : item.file;
          if (url && isFileHttp(url)) urls.push(url);
        });
      };
      collect(config.js);
      collect(config.css);
      if (!urls.length) return;

      if (!this.cdnProgress[configId]) this.cdnProgress[configId] = {};

      for (const url of urls) {
        this.cdnProgress[configId][url] = '0%';
        try {
          await cacheManager.cacheUrl(configId, url, (pct) => {
            this.cdnProgress[configId][url] = `${pct}%`;
          });
          this.cdnProgress[configId][url] = '(Cached)';
          setTimeout(() => { delete this.cdnProgress[configId]?.[url]; }, 3000);
        } catch (e) {
          console.error(`[UserSite] Failed to cache CDN asset: ${url}`, e);
          logToBackground('error', `Failed to cache CDN asset: ${url}`, e);
          this.cdnProgress[configId][url] = '(Error)';
          // Keep the error visible — don't auto-clear so the user can see it
        }
      }
    },

    // ── Logs ─────────────────────────────────────────────────────────────────

    async loadLogs() {
      try {
        this.logs = await fetchLogs();
      } catch (e) {
        console.error('Error loading logs:', e);
      }
    },

    async onClearLogs() {
      try {
        await clearLogs();
        this.logs = [];
      } catch (e) {
        console.error('Error clearing logs:', e);
      }
    },

    // ── FS banner ─────────────────────────────────────────────────────────────

    async grantFsAccess() {
      try {
        const entries = await listPersistedHandles();
        if (!entries.length) {
          this.showAlert('No folder access saved. Use "Pick Folder" in the Add Configuration modal.', 'Info');
          return;
        }
        for (const entry of entries) {
          await ensureHandlePermission(entry.handle);
        }
        this.fsBannerVisible = await checkFsBannerNeeded(this.configs);
      } catch (e) {
        console.error('Error granting FS access:', e);
      }
    },

    // ── Theme ─────────────────────────────────────────────────────────────────

    toggleTheme() {
      const current = document.documentElement.getAttribute('data-bs-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-bs-theme', next);
      localStorage.setItem('usersite-theme', next);
    },

    // ── Alert helper (uses Bootstrap modal from vendor.js) ────────────────────

    showAlert(message, title = 'Notice') {
      $('#alertModalLabel').text(title);
      $('#alertModalBody').text(message);
      new bootstrap.Modal(document.getElementById('alertModal')).show();
    },
  },
});
</script>
