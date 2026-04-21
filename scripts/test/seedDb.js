const { Client } = require('pg');

async function main() {
  const url =
    process.env.INTEGRATION_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgres://knowwhere_superadmin:knowwhere_superadmin_pass@localhost:5432/knowwhere';

  const client = new Client({ connectionString: url });
  await client.connect();

  // Deterministic seed row for UI + API tests.
  const id = 'test:paper-gnn';
  const title = 'Graph Neural Networks for Molecules (Seed)';
  const abstract =
    'This seeded paper exists for end-to-end UI testing. It mentions graph neural networks and molecules.';

  await client.query(
    `
    INSERT INTO papers (id, title, abstract, subjects, year, tsv)
    VALUES (
      $1,
      $2,
      $3,
      ARRAY['cs.LG']::text[],
      2024,
      to_tsvector('english', coalesce($2,'') || ' ' || coalesce($3,''))
    )
    ON CONFLICT (id) DO UPDATE
      SET title = EXCLUDED.title,
          abstract = EXCLUDED.abstract,
          subjects = EXCLUDED.subjects,
          year = EXCLUDED.year,
          tsv = EXCLUDED.tsv;
    `,
    [id, title, abstract]
  );

  await client.end();
  // eslint-disable-next-line no-console
  console.log(`Seeded paper ${id}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

