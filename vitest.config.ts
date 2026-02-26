import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@careersignal/agents': path.resolve(__dirname, 'agents/src'),
      '@careersignal/core': path.resolve(__dirname, 'packages/core/src'),
      '@careersignal/db': path.resolve(__dirname, 'packages/db/src'),
      '@careersignal/llm': path.resolve(__dirname, 'packages/llm/src'),
      '@careersignal/schemas': path.resolve(__dirname, 'packages/schemas/src'),
      '@/lib': path.resolve(__dirname, 'apps/web/lib'),
    },
  },
});
