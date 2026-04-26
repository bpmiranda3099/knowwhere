import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Default checkpoint path for `ingest:topics` and interactive core-topic ingest.
 * Compose sets INGEST_TOPICS_STATE_FILE to a host-mounted path so resume survives `docker compose run --rm`.
 */
export function defaultIngestTopicsStateFile(): string {
  const v = process.env.INGEST_TOPICS_STATE_FILE?.trim();
  return v && v.length > 0 ? v : '.ingest-topics-state.json';
}

export async function writeTopicIngestStateFile(path: string, state: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2) + '\n', 'utf8');
}
