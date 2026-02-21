import app from './app';
import { config } from './config/env';
import { logger } from './utils/logger';
import { initWorker } from './jobs/worker';

const worker = initWorker();

const server = app.listen(config.port, () => {
    logger.info(`Server is running in ${config.nodeEnv} mode on port ${config.port}`);
});

// Handle unhandled rejections
process.on('unhandledRejection', (err: Error) => {
    logger.error(`[Unhandled Rejection] ${err.name}: ${err.message}`, { stack: err.stack });
    server.close(() => {
        process.exit(1);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
    logger.error(`[Uncaught Exception] ${err.name}: ${err.message}`, { stack: err.stack });
    server.close(() => {
        process.exit(1);
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await worker.close();
    server.close(() => {
        logger.info('Process terminated!');
    });
});
