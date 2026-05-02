<template>
  <div class="config-card border-start border-4 mb-0"
       :class="config.enabled ? 'border-primary' : 'border-secondary opacity-75'"
       :data-config-id="config.id">

    <!-- Card Header -->
    <div class="card-header d-flex align-items-center p-3 config-card-header">
      <div class="flex-grow-1 min-w-0">
        <div class="d-flex align-items-center justify-content-between gap-2">

          <!-- Name + status -->
          <div class="d-flex align-items-center gap-2 min-w-0">
            <i class="bi flex-shrink-0 status-icon"
               :class="config.enabled ? 'bi-circle-fill text-success' : 'bi-circle text-secondary'"
               :title="config.enabled ? 'Enabled' : 'Disabled'"></i>
            <div class="min-w-0">
              <div class="fw-semibold text-emphasis text-truncate">{{ config.name }}</div>
              <div v-if="config.description"
                   class="text-secondary text-truncate small">{{ config.description }}</div>
            </div>
          </div>

          <!-- Controls -->
          <div class="d-flex align-items-center gap-2 flex-shrink-0" @click.stop>
            <div class="form-check form-switch m-0 p-0">
              <input class="form-check-input ms-0 mt-0"
                     type="checkbox"
                     role="switch"
                     :checked="config.enabled"
                     @change="$emit('toggle', config.id, $event.target.checked)">
            </div>
            <button v-if="config.source === 'fs'"
                    class="btn btn-outline-secondary btn-sm icon-btn"
                    title="Rescan folder to reload files"
                    @click.stop="$emit('rescan', config.id)">
              <i class="bi bi-arrow-repeat"></i>
            </button>
          </div>

        </div>
      </div>

      <!-- Collapse toggle -->
      <button class="btn btn-link p-0 ms-2 text-secondary border-0 collapse-btn"
              type="button"
              data-bs-toggle="collapse"
              :data-bs-target="'#body-' + config.id"
              :aria-expanded="expanded"
              :aria-controls="'body-' + config.id"
              @click.stop="expanded = !expanded">
        <i class="bi bi-chevron-down collapse-icon"
           :class="{ 'rotated': expanded }"></i>
      </button>
    </div>

    <!-- Card Body (Bootstrap collapse) -->
    <div :id="'body-' + config.id" class="collapse">
      <div class="card-body bg-body-tertiary border-top">

        <!-- Matches -->
        <div class="mb-3">
          <div class="small fw-semibold text-body-secondary mb-2 d-flex align-items-center gap-1">
            <i class="bi bi-link-45deg"></i> Matches
          </div>
          <div class="d-flex flex-wrap gap-1">
            <span v-for="match in matchList"
                  :key="match"
                  class="badge rounded-pill text-bg-light border px-2 py-1 match-badge">
              {{ match }}
            </span>
          </div>
        </div>

        <!-- Sources -->
        <div class="mb-3">
          <div class="small fw-semibold text-body-secondary mb-2 d-flex align-items-center gap-1">
            <i class="bi bi-files"></i> Sources
          </div>
          <div v-if="sourceItems.length === 0" class="text-secondary small">
            No sources defined
          </div>
          <div v-else class="d-flex flex-wrap gap-2">
            <button v-for="src in sourceItems"
                    :key="src.key"
                    class="btn btn-sm source-btn d-flex align-items-center gap-1"
                    :class="src.isUrl ? 'btn-outline-info' : 'btn-outline-secondary'"
                    :data-url="src.isUrl ? src.name : undefined"
                    :title="src.name"
                    @click="$emit('view-source', config.id, src.fileName, src.inlineCode)">
              <i class="bi" :class="src.iconClass"></i>
              <span class="source-name text-truncate">{{ src.shortName }}</span>
              <span v-if="src.isUrl && cdnProgress[src.name]"
                    class="badge ms-1"
                    :class="cdnProgress[src.name] === '(Error)' ? 'text-bg-danger' : 'text-bg-secondary'">
                {{ cdnProgress[src.name] }}
              </span>
            </button>
          </div>
        </div>

        <!-- Footer actions -->
        <div class="pt-2 border-top d-flex justify-content-end">
          <button class="btn btn-outline-danger btn-sm d-flex align-items-center gap-1"
                  @click.stop="confirmDelete">
            <i class="bi bi-trash3"></i> Delete
          </button>
        </div>

      </div>
    </div>

  </div>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'ConfigCard',

  props: {
    config: { type: Object, required: true },
    cdnProgress: { type: Object, default: () => ({}) },
  },

  emits: ['toggle', 'delete', 'rescan', 'view-source'],

  data() {
    return { expanded: false };
  },

  computed: {
    matchList() {
      const m = this.config.matches;
      if (!m) return [];
      return Array.isArray(m) ? m : [m];
    },

    sourceItems() {
      const items = [];
      const process = (list, type) => {
        if (!Array.isArray(list)) return;
        list.forEach((item, index) => {
          const name = typeof item === 'string' ? item : (item.file || null);
          if (name) {
            const isUrl = name.startsWith('http:') || name.startsWith('https:');
            const iconClass = isUrl
              ? 'bi-globe2'
              : type === 'js' ? 'bi-filetype-js' : 'bi-filetype-css';
            items.push({
              key: `${type}-${index}`,
              name,
              shortName: name.split('/').pop(),
              type,
              isUrl,
              fileName: name,
              inlineCode: null,
              iconClass,
            });
          } else if (item.code) {
            items.push({
              key: `${type}-inline-${index}`,
              name: `Inline ${type === 'js' ? 'Script' : 'Style'}`,
              shortName: `Inline ${type === 'js' ? 'JS' : 'CSS'}`,
              type,
              isUrl: false,
              fileName: `inline-${type}-${index}`,
              inlineCode: item.code,
              iconClass: 'bi-code-slash',
            });
          }
        });
      };
      process(this.config.js, 'js');
      process(this.config.css, 'css');
      return items;
    },
  },

  methods: {
    confirmDelete() {
      if (confirm(`Delete configuration "${this.config.name}"?`)) {
        this.$emit('delete', this.config.id);
      }
    },
  },
});
</script>
