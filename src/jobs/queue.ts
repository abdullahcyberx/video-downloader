import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config/env';

// We use ioredis for BullMQ as recommended by their docs
export const redisConnection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
});

export const DOWNLOAD_QUEUE_NAME = 'video-downloads';

export const downloadQueue = new Queue(DOWNLOAD_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: true, // Keep it clean
        removeOnFail: 100, // Keep some failed jobs for debugging
    },
});
