import app from './app';
import { config } from './config/env';
import { logger } from './utils/logger';
import { initWorker } from './jobs/worker';
import { cleanOldTempFiles } from './utils/cleanup';

const worker = initWorker();

const server = app.listen(config.port, () => {
    logger.info(`Server is running in ${config.nodeEnv} mode on port ${config.port}`);

    // Auto-update yt-dlp on startup
    import('child_process').then(({ exec }) => {
        exec('yt-dlp -U', (err, stdout) => {
            if (err) logger.warn(`Failed to update yt-dlp: ${err.message}`);
            else logger.info(`yt-dlp updated: ${stdout.trim()}`);
        });
    });
});

// Run background temp file cleanup every 15 minutes to delete files older than 30 minutes
const cleanupInterval = setInterval(() => {
    logger.info('Running cron: Background temp file cleanup');
    cleanOldTempFiles(config.tmpDir, 30);
}, 15 * 60 * 1000);

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
    clearInterval(cleanupInterval);
    await worker.close();
    server.close(() => {
        logger.info('Process terminated!');
    });
});
