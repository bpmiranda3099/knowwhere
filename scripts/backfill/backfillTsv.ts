import { query, closePool } from '../../src/db/db';

async function main() {
  // Update papers TSV
  await query(
    `
    UPDATE papers
    SET tsv = to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,''))
    WHERE true;
    `
  );

  // Update chunk TSV
  await query(
    `
    UPDATE paper_chunks
    SET tsv = to_tsvector('english', coalesce(chunk_text,''))
    WHERE true;
    `
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('backfillTsv failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
