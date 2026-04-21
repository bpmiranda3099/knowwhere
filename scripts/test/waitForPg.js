const { Client } = require('pg');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForPg() {
  const url =
    process.env.INTEGRATION_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgres://knowwhere_superadmin:knowwhere_superadmin_pass@localhost:5432/knowwhere';
  const timeoutMs = Number(process.env.INTEGRATION_PG_TIMEOUT_MS || 60_000);
  const intervalMs = Number(process.env.INTEGRATION_PG_INTERVAL_MS || 1_000);
  const deadline = Date.now() + timeoutMs;
  /** @type {unknown} */
  let lastErr;

  // eslint-disable-next-line no-console
  console.log(`Waiting for Postgres ${url} ...`);

  while (Date.now() < deadline) {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.query('SELECT 1');
      // eslint-disable-next-line no-console
      console.log('OK');
      await client.end();
      return;
    } catch (err) {
      lastErr = err;
      try {
        await client.end();
      } catch {}
      await sleep(intervalMs);
    }
  }

  const details =
    lastErr && typeof lastErr === 'object' && 'message' in lastErr ? ` Last error: ${lastErr.message}` : '';
  throw new Error(`Timed out waiting for Postgres after ${timeoutMs}ms.${details}`);
}

waitForPg().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

