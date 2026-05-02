<template>
  <div class="mt-4">
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="mb-0 text-secondary small fw-bold">Extension Logs</h6>
      <button class="btn btn-outline-secondary btn-sm py-0" @click="$emit('clear')">
        Clear Logs
      </button>
    </div>
    <ul class="list-unstyled small border rounded p-2 bg-body-tertiary mb-0 log-list">
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
