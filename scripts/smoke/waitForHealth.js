function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth({ baseUrl, timeoutMs, intervalMs, apiKey }) {
  const deadline = Date.now() + timeoutMs;
  const services = process.env.SMOKE_SERVICES || 'api,db';
  const url = `${baseUrl.replace(/\/$/, '')}/health?services=${encodeURIComponent(services)}`;

  // eslint-disable-next-line no-console
  console.log(`Waiting for ${url} ...`);

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        headers: apiKey ? { 'x-api-key': apiKey } : undefined
      });
      if (res.ok) {
        // eslint-disable-next-line no-console
        console.log('OK');
        return;
      }
    } catch {
      // ignore and retry
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for ${url} after ${timeoutMs}ms`);
}

async function main() {
  const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
  const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 60_000);
  const intervalMs = Number(process.env.SMOKE_INTERVAL_MS ?? 1_000);
  const apiKey = process.env.SMOKE_API_KEY || process.env.API_KEY;

  await waitForHealth({ baseUrl, timeoutMs, intervalMs, apiKey: apiKey || undefined });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

