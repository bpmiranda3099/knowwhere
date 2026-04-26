import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Only run tests from our repo (never dependency test suites).
    include: ['tests/**/*.test.{ts,js}', 'tests/**/*.unit.test.ts', 'tests/**/*.smoke.test.ts', 'tests/**/*.e2e.test.ts'],
    // Keep this minimal so targeted runs (e.g. integration) still work.
    // The npm scripts already exclude e2e/integration for unit test runs.
    exclude: ['node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      // Option A: enforce 100% coverage for a defined, testable subset.
      include: [
        'src/db/db.ts',
        'src/services/embeddingClient.ts',
        'src/services/rerankService.ts',
        'src/api/hooks/auth.ts',
        'src/api/routes/health.ts',
        'src/api/routes/search.ts',
        'src/api/routes/ingest.ts',
        'src/api/routes/contact.ts'
      ],
      exclude: ['**/*.d.ts', 'dist/**', 'node_modules/**', 'tests/**'],
      thresholds: {
        100: true,
        perFile: true
      }
    }
  }
});

