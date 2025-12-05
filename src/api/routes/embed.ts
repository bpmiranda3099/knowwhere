import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { embedText } from '../../services/embeddingClient';

const embedSchema = z.object({
  texts: z.array(z.string().min(1)).min(1)
});

export async function registerEmbedRoutes(app: FastifyInstance): Promise<void> {
  app.post('/embed', async (req, reply) => {
    const parsed = embedSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const texts = parsed.data.texts;
    const embeddings: number[][] = [];
    for (const t of texts) {
      // Note: embedText is single input; looped for simplicity.
      // For higher throughput, add a batch client when needed.
      const vec = await embedText(t);
      embeddings.push(vec);
    }
    return reply.send({ embeddings });
  });
}
