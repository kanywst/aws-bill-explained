import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // No 'html': the generated report is 6,000 lines of istanbul output
      // that once got committed and then reformatted by prettier. CI uploads
      // it as an artifact when it is actually wanted.
      reporter: ['text-summary', 'json-summary'],
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
