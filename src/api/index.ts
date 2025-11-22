import fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from '../config/env';
import { registerSearchRoutes } from './routes/search';
import { registerHealthRoutes } from './routes/health';
import { apiKeyGuard } from './hooks/auth';
import { RATE_LIMIT_ALLOWLIST } from '../config/system/constants';

export async function buildServer() {
  const app = fastify({
    logger: {
      level: 'info',
      transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      redact: ['req.headers.authorization']
    }
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true
  });

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    allowList: RATE_LIMIT_ALLOWLIST
  });

  app.addHook('onRequest', apiKeyGuard);
  await registerHealthRoutes(app);
  await registerSearchRoutes(app);

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  buildServer()
    .then((app) =>
      app.listen({ port: config.PORT, host: '0.0.0.0' }).then(() => {
        app.log.info(`search API running on ${config.PORT}`);
      })
    )
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to start server', err);
      process.exit(1);
    });
}
