// Shared test helper for spinning up the Fastify app.
// Important: this module sets env vars BEFORE importing app code (which reads config at import time).

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/knowwhere_test';
process.env.EMBEDDING_ENDPOINT = process.env.EMBEDDING_ENDPOINT ?? 'http://localhost:8081/embed';
// Prevent `.env` from enabling auth during tests (dotenv won't override an existing var).
process.env.API_KEY = '';

export async function buildTestServer() {
  const { buildServer } = await import('../../../src/api/index');
  return buildServer();
}

