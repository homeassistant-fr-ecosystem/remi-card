import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import url from '@rollup/plugin-url';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/remi-card.ts',
  output: {
    file: 'dist/remi-card.js',
    format: 'es',
    sourcemap: false,
    inlineDynamicImports: true,
  },
  plugins: [
    nodeResolve({
      browser: true,
    }),
    commonjs(),
    json(),
    // Inline image assets into the final bundle so PNGs are packaged inside remi-card.js
    url({
      include: ['**/*.png', '**/*.jpg', '**/*.svg'],
      limit: Infinity,
      emitFiles: false,
    }),
    typescript({
      tsconfig: './tsconfig.json',
      include: ['src/**/*.ts'],
      noForceEmit: true,
      declaration: false,
    }),
    terser({
      format: { comments: false },
    }),
  ],
};
