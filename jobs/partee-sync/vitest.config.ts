import { defineConfig } from 'vitest/config';

// Own config so vitest does not pick up the app's vite.config.ts from the parent folder.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
