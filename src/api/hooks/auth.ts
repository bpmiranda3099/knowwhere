import { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config/env';

export async function apiKeyGuard(req: FastifyRequest, reply: FastifyReply) {
  if (!config.API_KEY) return;
  if (req.url.startsWith('/health') || req.url.startsWith('/ready') || req.url.startsWith('/status')) return;

  const headerKey = req.headers['x-api-key'];
  if (headerKey !== config.API_KEY) {
    return reply.status(401).send({ error: 'unauthorized' });
  }
}
