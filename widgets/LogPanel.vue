<template>
  <div class="mt-4">

    <!-- Header — always visible, click to toggle -->
    <div class="d-flex justify-content-between align-items-center log-panel-header"
         role="button"
         @click="open = !open">
      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-terminal text-body-secondary"></i>
        <span class="small fw-semibold text-body-secondary">Logs</span>
        <span v-if="errorCount > 0"
              class="badge text-bg-danger log-count-badge">
          {{ errorCount }}
        </span>
        <span v-else-if="logs.length > 0"
              class="badge text-bg-secondary log-count-badge">
          {{ logs.length }}
        </span>
      </div>
      <div class="d-flex align-items-center gap-2" @click.stop>
        <button v-if="open && logs.length > 0"
                class="btn btn-outline-secondary btn-sm icon-btn log-clear-btn"
                title="Clear logs"
                @click="$emit('clear')">
          <i class="bi bi-x-lg"></i>
        </button>
        <i class="bi bi-chevron-down log-panel-arrow text-secondary"
           :class="{ 'rotated': open }"></i>
      </div>
    </div>

    <!-- Log list — shown when open -->
    <ul v-if="open"
        class="list-unstyled mb-0 log-list mt-2 border rounded bg-body-tertiary p-2">
      <li v-if="logs.length === 0"
          class="text-muted log-entry d-flex align-items-center gap-2">
        <i class="bi bi-info-circle"></i> No logs yet.
      </li>
      <li v-else
          v-for="(entry, i) in logs"
          :key="i"
          class="log-entry d-flex align-items-start gap-2"
          :class="levelClass(entry.level)">
        <i class="bi flex-shrink-0 mt-1" :class="levelIcon(entry.level)"></i>
        <span>
          <span class="text-body-secondary me-1">{{ formatTime(entry.timestamp) }}</span>
          {{ entry.message }}{{ formatData(entry.data) }}
        </span>
      </li>
    </ul>

  </div>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'LogPanel',

  props: {
    logs: { type: Array, default: () => [] },
  },

  emits: ['clear'],

  data() {
    return { open: false };
  },

  computed: {
    errorCount() {
      return this.logs.filter(e => e.level === 'error').length;
    },
  },

  watch: {
    errorCount(newVal, oldVal) {
      if (newVal > oldVal) this.open = true;
    },
  },

  methods: {
    levelClass(level) {
      return level === 'error' ? 'text-danger'
           : level === 'warn'  ? 'text-warning'
           : 'text-muted';
    },

    levelIcon(level) {
      return level === 'error' ? 'bi-x-circle-fill'
           : level === 'warn'  ? 'bi-exclamation-circle-fill'
           : 'bi-info-circle';
    },

    formatTime(ts) {
      return new Date(ts).toLocaleTimeString();
    },

    formatData(data) {
      if (!data) return '';
      const str = data instanceof Error ? data.message : JSON.stringify(data);
      return ` — ${str}`;
    },
  },
});
</script>
