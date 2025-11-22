import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { search } from '../../services/searchService';
import { Level, Mode } from '../../types';
import { SEARCH_LIMITS } from '../../config/search/constants';
import { SEARCH_RULES } from '../../config/search/validationRules';

const bodySchema = z.object({
  q: z.string().min(SEARCH_RULES.queryMinLength).max(SEARCH_RULES.queryMaxLength),
  limit: z.number().int().positive().max(SEARCH_RULES.limitMax).optional(),
  mode: z.enum(['hybrid', 'lexical', 'semantic']).optional(),
  level: z.enum(['paper', 'chunk']).optional(),
  filters: z
    .object({
      yearFrom: z.number().int().optional(),
      yearTo: z.number().int().optional(),
      venue: z.string().max(SEARCH_RULES.venueMaxLength).optional(),
      subject: z.string().max(SEARCH_RULES.subjectMaxLength).optional(),
      source: z.string().max(SEARCH_RULES.sourceMaxLength).optional()
    })
    .optional()
});

export async function registerSearchRoutes(app: FastifyInstance): Promise<void> {
  app.post('/search', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const payload = parsed.data;
    const mode: Mode = payload.mode ?? 'hybrid';
    const level: Level = payload.level ?? 'paper';

    if (payload.filters?.yearFrom && payload.filters?.yearTo && payload.filters.yearFrom > payload.filters.yearTo) {
      return reply.status(400).send({ error: 'yearFrom cannot be greater than yearTo' });
    }

    const results = await search({
      q: payload.q,
      limit: payload.limit,
      mode,
      level,
      filters: payload.filters
    });

    return reply.send({ results, mode, level });
  });
}
