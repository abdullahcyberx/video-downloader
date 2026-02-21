import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export const redisConnection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
});

redisConnection.on('error', (err) => {
    logger.error('[Redis Error]', err);
});

redisConnection.on('connect', () => {
    logger.info('Connected to Redis successfully');
});

export const DOWNLOAD_QUEUE_NAME = 'video-download-queue';

export const downloadQueue = new Queue(DOWNLOAD_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: { age: 24 * 3600 }, // Keep completed jobs for 24 hours so UI can poll them
        removeOnFail: false,
    },
});
