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
        removeOnComplete: {
            age: 3600, // Keep completed metadata for 1 hour to allow frontend polling
            count: 1000
        },
        removeOnFail: {
            age: 86400, // Keep failed jobs for 24h for debugging
            count: 1000
        },
    },
});
