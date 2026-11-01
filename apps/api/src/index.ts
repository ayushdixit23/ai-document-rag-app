import type { Server } from 'http';

import createApp from './app.js';
import { NODE_ENV, PORT } from './config/env.js';
import { connectDb } from './db/index.js';
import { startBoss } from './lib/queue/boss.js';
import { setupGracefulShutdown } from './utils/gracefulShutdown.js';
import { logger } from './utils/logger.js';

const listen = (app: ReturnType<typeof createApp>, port: string): Promise<Server> =>
  new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
    server.once('error', reject);
  });

const startServer = async (): Promise<void> => {
  try {
    logger.info({ port: PORT, environment: NODE_ENV }, 'Starting server');

    // Bind the port before awaiting Postgres so Next rewrites don't race a slow DB warm-up.
    const app = createApp();
    const server = await listen(app, PORT);

    logger.info(
      {
        url: `http://localhost:${PORT}`,
        environment: NODE_ENV,
        startTime: new Date().toISOString(),
      },
      'Server started successfully',
    );

    setupGracefulShutdown(server);

    await connectDb();
    await startBoss();
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

void startServer();
