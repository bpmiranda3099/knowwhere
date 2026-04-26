process.env.NODE_ENV = 'test';
process.env.API_KEY = '';
process.env.DATABASE_URL =
  process.env.INTEGRATION_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgres://knowwhere_superadmin:knowwhere_superadmin_pass@localhost:5432/knowwhere';
// Ensure semantic/hybrid won't be used in integration by default.
process.env.EMBEDDING_ENDPOINT = process.env.EMBEDDING_ENDPOINT ?? 'http://127.0.0.1:59999/embed';
process.env.SKIP_RERANK = process.env.SKIP_RERANK ?? '1';

export async function buildIntegrationServer() {
  const { buildServer } = await import('../../../src/api/index');
  return buildServer();
}

