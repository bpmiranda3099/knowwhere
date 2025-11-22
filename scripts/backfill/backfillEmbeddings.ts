import { closePool, getClient } from '../../src/db/db';
import { embedText } from '../../src/services/embeddingClient';
import { BACKFILL } from '../../src/config/ingest/constants';

async function processTable(
  table: 'papers' | 'paper_chunks',
  idColumn: string,
  textColumn: string,
  embeddingColumn: string
) {
  const client = await getClient();
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { rows } = await client.query<{ id: string; text: string }>(
        `
        SELECT ${idColumn} AS id, ${textColumn} AS text
        FROM ${table}
        WHERE ${embeddingColumn} IS NULL
        AND ${textColumn} IS NOT NULL
        LIMIT $1;
        `,
        [BACKFILL.batchSize]
      );

      if (rows.length === 0) break;

      for (const row of rows) {
        const embedding = await embedText(row.text);
        const literal = `[${embedding.join(',')}]`;
        await client.query(
          `
          UPDATE ${table}
          SET ${embeddingColumn} = $1
          WHERE ${idColumn} = $2;
          `,
          [literal, row.id]
        );
      }
    }
  } finally {
    client.release();
  }
}

async function main() {
  await processTable('papers', 'id', "coalesce(title,'') || '\n' || coalesce(abstract,'')", 'embedding');
  await processTable('paper_chunks', 'chunk_id', 'chunk_text', 'chunk_embedding');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('backfillEmbeddings failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
