async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHttp() {
  const url = process.env.WAIT_URL || 'http://localhost:8080/web/index.html';
  const timeoutMs = Number(process.env.WAIT_TIMEOUT_MS || 60_000);
  const intervalMs = Number(process.env.WAIT_INTERVAL_MS || 1_000);
  const deadline = Date.now() + timeoutMs;

  // eslint-disable-next-line no-console
  console.log(`Waiting for ${url} ...`);

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        // eslint-disable-next-line no-console
        console.log('OK');
        return;
      }
    } catch {
      // ignore
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${url} after ${timeoutMs}ms`);
}

waitForHttp().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

