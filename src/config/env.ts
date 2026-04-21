import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    EMBEDDING_ENDPOINT: z.string().url('EMBEDDING_ENDPOINT must be a URL'),
    EMBEDDING_MODEL: z.string().min(1).default('bge-base-en-v1.5'),
    // Required in non-test environments (KnowWhere always reranks in normal operation).
    RERANK_ENDPOINT: z.string().url().optional(),
    API_KEY: z.string().optional(),
    RATE_LIMIT_MAX: z.coerce.number().default(100),
    RATE_LIMIT_WINDOW: z.coerce.number().default(60_000),
    CORS_ORIGINS: z.string().optional(),
    TRUST_PROXY: z
      .string()
      .optional()
      .transform((v) => v === 'true' || v === '1')
      .pipe(z.boolean().default(false)),

    // Contact email (optional; if unset, /contact returns 501)
    CONTACT_TO: z.string().email().default('knowwheretosearch@gmail.com'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_SECURE: z
      .string()
      .optional()
      .transform((v) => v === 'true' || v === '1')
      .pipe(z.boolean().default(false)),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional()
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV !== 'test' && !val.RERANK_ENDPOINT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RERANK_ENDPOINT'],
        message: 'RERANK_ENDPOINT is required (except in test)'
      });
    }
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
