import { Server } from 'http';

import { stopBoss } from '../lib/queue/boss.js';
import { logger } from './logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const closeServer = (server: Server): Promise<void> => {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

export const setupGracefulShutdown = (server: Server): void => {
  let shuttingDown = false;
  let forceExitTimer: ReturnType<typeof setTimeout> | undefined;

  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.warn({ signal }, 'Received shutdown signal, starting graceful shutdown');

    forceExitTimer = setTimeout(() => {
      logger.fatal('Forced shutdown due to timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    void (async () => {
      try {
        await closeServer(server);
        logger.info('HTTP server closed');
        await stopBoss();
        const { disconnectDb } = await import('../db/index.js');
        await disconnectDb();
        logger.info('All connections closed, exiting process');
        clearTimeout(forceExitTimer);
        process.exit(0);
      } catch (error) {
        logger.error({ err: error }, 'Error during shutdown');
        clearTimeout(forceExitTimer);
        process.exit(1);
      }
    })();
  };

  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });

  process.on('uncaughtException', (error: Error) => {
    logger.fatal({ err: error }, 'Uncaught Exception');
    shutdown('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    logger.fatal({ reason, promise }, 'Unhandled Rejection');
    shutdown('UNHANDLED_REJECTION');
  });
};
