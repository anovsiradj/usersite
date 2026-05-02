<template>
  <div class="mt-4">

    <!-- Header — always visible, click to toggle -->
    <div class="d-flex justify-content-between align-items-center log-panel-header"
         role="button"
         @click="open = !open">
      <div class="d-flex align-items-center gap-2">
        <span class="small fw-bold text-body-secondary">Extension Logs</span>
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
                class="btn btn-outline-secondary btn-sm py-0 px-2 log-clear-btn"
                @click="$emit('clear')">
          Clear
        </button>
        <span class="text-secondary small log-panel-arrow"
              :class="{ 'arrow-open': open }">▼</span>
      </div>
    </div>

    <!-- Log list — shown when open -->
    <ul v-if="open"
        class="list-unstyled small border rounded p-2 bg-body-tertiary mb-0 log-list mt-2">
      <li v-if="logs.length === 0" class="text-muted log-entry">No logs yet.</li>
      <li v-else
          v-for="(entry, i) in logs"
          :key="i"
          class="log-entry"
          :class="levelClass(entry.level)">
        [{{ formatTime(entry.timestamp) }}]
        [{{ entry.level.toUpperCase() }}]
        {{ entry.message }}{{ formatData(entry.data) }}
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
    return {
      // Auto-open when there are errors; otherwise collapsed by default
      open: false,
    };
  },

  computed: {
    errorCount() {
      return this.logs.filter(e => e.level === 'error').length;
    },
  },

  watch: {
    // Auto-open the panel when a new error arrives
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
