<template>
  <div class="config-card border-start border-4 mb-0"
       :class="config.enabled ? 'border-primary' : 'border-secondary opacity-75'"
       :data-config-id="config.id">

    <!-- Card Header -->
    <div class="card-header d-flex align-items-center p-3 config-card-header">
      <div class="flex-grow-1">
        <div class="row align-items-center g-2">

          <!-- Name + description -->
          <div class="col">
            <div class="fw-bold text-emphasis text-truncate">{{ config.name }}</div>
            <div v-if="config.description"
                 class="text-secondary text-truncate mt-1 small">
              {{ config.description }}
            </div>
          </div>

          <!-- Controls -->
          <div class="col-auto">
            <div class="d-flex align-items-center gap-2 header-actions" @click.stop>
              <div class="form-check form-switch m-0 p-0">
                <input class="form-check-input ms-0 mt-0"
                       type="checkbox"
                       role="switch"
                       :checked="config.enabled"
                       @change="$emit('toggle', config.id, $event.target.checked)">
              </div>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary py-0 px-2"
                        title="Rescan folder"
                        @click.stop="$emit('rescan', config.id)">
                  Rescan
                </button>
                <button class="btn btn-outline-danger py-0 px-2"
                        title="Delete configuration"
                        @click.stop="confirmDelete">
                  Delete
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Collapse toggle (Bootstrap collapse) -->
      <button class="btn btn-link p-0 ms-3 text-secondary toggle-arrow border-0"
              type="button"
              data-bs-toggle="collapse"
              :data-bs-target="'#body-' + config.id"
              :aria-expanded="expanded"
              :aria-controls="'body-' + config.id"
              @click.stop="expanded = !expanded">
        <span class="small" :class="{ 'arrow-open': expanded }">▼</span>
      </button>
    </div>

    <!-- Card Body (Bootstrap collapse) -->
    <div :id="'body-' + config.id" class="collapse">
      <div class="card-body bg-body-tertiary border-top">

        <!-- Matches -->
        <div class="mb-3">
          <label class="small fw-bold text-body-secondary mb-1 d-block">Matches:</label>
          <div class="d-flex flex-wrap gap-1">
            <span v-for="match in matchList"
                  :key="match"
                  class="badge rounded-pill text-bg-light border px-2 py-1 match-badge">
              {{ match }}
            </span>
          </div>
        </div>

        <!-- Sources -->
        <div>
          <label class="small fw-bold text-body-secondary mb-2 d-block">Sources:</label>
          <div v-if="sourceItems.length === 0" class="text-secondary small">
            No sources defined
          </div>
          <div v-else class="d-flex flex-wrap gap-2">
            <div v-for="src in sourceItems"
                 :key="src.key"
                 class="badge text-bg-secondary p-1 px-2 d-flex align-items-center gap-1 fw-normal source-badge"
                 :class="{ 'cdn-badge': src.isUrl }"
                 :data-url="src.isUrl ? src.name : undefined"
                 role="button"
                 title="Click to view source"
                 @click="$emit('view-source', config.id, src.fileName, src.inlineCode)">
              <span>{{ src.icon }}</span>
              <span>{{ src.name }}</span>
              <span v-if="src.isUrl && cdnProgress[src.name]" class="ms-1 cdn-progress-text">
                {{ cdnProgress[src.name] }}
              </span>
            </div>
          </div>
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
            items.push({
              key: `${type}-${index}`,
              name,
              type,
              isUrl,
              fileName: name,
              inlineCode: null,
              icon: isUrl ? '🌐' : (type === 'js' ? '📜' : '🎨'),
            });
          } else if (item.code) {
            items.push({
              key: `${type}-inline-${index}`,
              name: `Inline ${type === 'js' ? 'Script' : 'Style'}`,
              type,
              isUrl: false,
              fileName: `inline-${type}-${index}`,
              inlineCode: item.code,
              icon: type === 'js' ? '📜' : '🎨',
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
