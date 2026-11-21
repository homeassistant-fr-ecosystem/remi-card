// Polyfill for Map.groupBy (available from Node.js 23, needed for Vitest on Node 20/22)
if (!Map.groupBy) {
  Map.groupBy = function <T, K>(
    iterable: Iterable<T>,
    keySelector: (item: T) => K,
  ): Map<K, T[]> {
    const map = new Map<K, T[]>();
    for (const item of iterable) {
      const key = keySelector(item);
      const group = map.get(key);
      if (group) {
        group.push(item);
      } else {
        map.set(key, [item]);
      }
    }
    return map;
  } as unknown as <T, K>(
    iterable: Iterable<T>,
    keySelector: (item: T) => K,
  ) => Map<K, T[]>;
}

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
});
