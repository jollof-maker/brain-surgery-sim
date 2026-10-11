import { defineConfig } from 'vitest/config';

export default defineConfig({
  // One self-contained app: three.js + postprocessing are loaded up front anyway.
  build: { chunkSizeWarningLimit: 1600 },
  server: { port: 5173, strictPort: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
