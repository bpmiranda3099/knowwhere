import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rerank } from '../../services/rerankService';

const rerankSchema = z.object({
  query: z.string().min(1),
  documents: z.array(z.string().min(1)).min(1)
});

export async function registerRerankRoutes(app: FastifyInstance): Promise<void> {
  app.post('/rerank', async (req, reply) => {
    const parsed = rerankSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const scores = await rerank(parsed.data.query, parsed.data.documents);
    return reply.send({ scores: scores ?? [] });
  });
}
