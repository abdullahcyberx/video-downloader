import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export const redisConnection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
    // Enable TLS options for Upstash
    tls: config.redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
});

redisConnection.on('error', (err) => {
    logger.error('[Redis Error]', err);
});

redisConnection.on('connect', () => {
    logger.info('Connected to Redis successfully');
});

// 🚀 UPSTASH FIX: Prevent 500 Internal Server Errors on Railway!
// Upstash free tier forcefully drops idle connections after 5 minutes.
// This 60-second ping keeps the connection warm so IORedis never throws a 500 rejection error.
setInterval(() => {
    if (redisConnection.status === 'ready') {
        redisConnection.ping().catch(() => { });
    }
}, 60000);

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
