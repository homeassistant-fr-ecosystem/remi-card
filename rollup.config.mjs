import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import url from '@rollup/plugin-url';
import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';

export default {
  input: 'src/remi-card.ts',
  output: {
    file: 'dist/remi-card.js',
    format: 'es',
    sourcemap: true,
    inlineDynamicImports: true,
  },
  plugins: [
    resolve({
      browser: true,
    }),
    commonjs(),
    // Inline image assets into the final bundle so PNGs are packaged inside remi-card.js
    url({
      include: ['**/*.png', '**/*.jpg', '**/*.svg'],
      // Set a very large limit to always inline files as data URIs
      limit: Infinity,
      // Do not emit separate files when inlining
      emitFiles: false,
    }),
    typescript({
      declaration: false,
    }),
    json(),
    // copy assets into dist so they are available at dist/assets
    copy({
      targets: [{ src: 'assets', dest: 'dist' }],
      verbose: true,
    }),
    terser({
      compress: {
        drop_console: false,
      },
      output: {
        comments: false,
      },
    }),
  ],
};
