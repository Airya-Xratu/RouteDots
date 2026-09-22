import { defineConfig } from 'tsup';

/**
 * Convenience browser bundle: single IIFE file with `three` bundled in,
 * exposing a global `RouteDots` namespace for usage without a bundler:
 *
 *   <script src="routedots.browser.js"></script>
 *   const { RouteDots } = window.RouteDots;
 */
export default defineConfig({
  entry: { 'routedots.browser': 'src/index.ts' },
  format: ['iife'],
  globalName: 'RouteDots',
  external: [],
  minify: true,
  clean: false,
  outDir: 'dist',
  target: 'es2020',
});
