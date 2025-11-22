import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  EMBEDDING_ENDPOINT: z.string().url('EMBEDDING_ENDPOINT must be a URL'),
  EMBEDDING_MODEL: z.string().min(1).default('bge-base-en-v1.5'),
  RERANK_ENDPOINT: z.string().url().optional(),
  API_KEY: z.string().optional(),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60_000),
  CORS_ORIGINS: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const corsOrigins =
  parsed.data.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? [];

export const config = {
  ...parsed.data,
  corsOrigins
};
