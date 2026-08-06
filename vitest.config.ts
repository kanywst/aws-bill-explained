import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      // The domain and the layout arithmetic are where a silent defect costs
      // a reader money or hides a diagram, so those carry a real floor.
      include: ['src/domain/**', 'src/lib/**', 'src/infrastructure/**', 'src/i18n/**'],
      exclude: ['**/*.test.ts'],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
  },
});
