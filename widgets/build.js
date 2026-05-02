/**
 * widgets/build.js
 * Builds widgets/main.js (Vue SFCs) → web/dashboard.iife.js using esbuild.
 *
 * Run via: deno task widgets
 */

import * as esbuild from 'npm:esbuild@^0.27.7';
import unpluginVue from 'npm:unplugin-vue/esbuild';

await esbuild.build({
  entryPoints: ['widgets/main.js'],
  bundle: true,
  format: 'iife',
  outfile: 'web/dashboard.iife.js',
  platform: 'browser',
  target: ['chrome120'],

  define: {
    // Vue checks this at runtime — replace at build time so it's not a live reference
    'process.env.NODE_ENV': '"production"',
  },

  plugins: [
    unpluginVue({ isProduction: true }),
  ],

  minify: false,
  sourcemap: false,
});

console.log('widgets built → web/dashboard.iife.js');
await esbuild.stop();
