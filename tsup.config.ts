import { defineConfig } from 'tsup';

/**
 * Library build: ESM + CJS + type declarations.
 * `three` is a peer dependency and stays external.
 */
export default defineConfig({
  entry: { routedots: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  external: ['three'],
  sourcemap: true,
  clean: true,
  minify: false,
  target: 'es2020',
});
