/**
 * widgets/main.js — Vue app entry point
 *
 * Built by esbuild (widgets/build.js) → web/dashboard.iife.js
 * jQuery and Bootstrap globals are provided by web/vendor.js
 */

import { createApp } from 'vue';
import App from './App.vue';

// Apply saved theme before mount to avoid flash
const saved = localStorage.getItem('usersite-theme');
const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
document.documentElement.setAttribute('data-bs-theme', saved || system);

createApp(App).mount('#app');
